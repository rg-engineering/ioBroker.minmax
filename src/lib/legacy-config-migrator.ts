import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Minmax } from "../main";
import { describeError } from "./error-utils";

interface LegacyEntry {
    id: string;
    name: string;
    enabled: boolean;
    calcDiff: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLegacyEntries(contents: string): LegacyEntry[] {
    const parsed: unknown = JSON.parse(contents);
    if (!isRecord(parsed) || !Array.isArray(parsed.myObjects)) {
        throw new TypeError("Legacy configuration does not contain a myObjects array");
    }

    return parsed.myObjects.map((entry: unknown, index: number) => {
        if (
            !isRecord(entry) ||
            typeof entry.id !== "string" ||
            entry.id.length === 0 ||
            typeof entry.name !== "string" ||
            entry.name.length === 0 ||
            typeof entry.enabled !== "boolean" ||
            typeof entry.calcDiff !== "boolean"
        ) {
            throw new TypeError(`Legacy configuration entry ${index} has an invalid shape`);
        }

        return {
            id: entry.id,
            name: entry.name,
            enabled: entry.enabled,
            calcDiff: entry.calcDiff,
        };
    });
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(record, key);
}

function hasOtherMinmaxConfig(custom: Record<string, unknown>, namespace: string): boolean {
    return Object.keys(custom).some((key) => /^minmax\.\d+$/.test(key) && key !== namespace);
}

export function getLegacyConfigPaths(adapterBuildDirectory: string, defaultDataDirectory: string): string[] {
    const historicalPath = join(adapterBuildDirectory, "..", "..", "..", "iobroker-data", "minmax", "minmax.json");
    const controllerDefaultPath = join(defaultDataDirectory, "minmax", "minmax.json");
    return [...new Set([historicalPath, controllerDefaultPath])];
}

export default class LegacyConfigMigrator {
    public constructor(
        private readonly adapter: Minmax,
        private readonly legacyFilePaths: readonly string[],
    ) {}

    public async migrate(): Promise<void> {
        let contents: string | undefined;
        let legacyFilePath: string | undefined;
        for (const candidatePath of this.legacyFilePaths) {
            try {
                contents = await readFile(candidatePath, "utf8");
                legacyFilePath = candidatePath;
                break;
            } catch (error) {
                if (isRecord(error) && error.code === "ENOENT") {
                    continue;
                }
                this.adapter.log.error(
                    `Cannot read legacy minmax configuration at "${candidatePath}"; it was kept for retry: ${describeError(error)}`,
                );
                return;
            }
        }
        if (contents === undefined || legacyFilePath === undefined) {
            this.adapter.log.debug(`No legacy minmax configuration found at: ${this.legacyFilePaths.join(", ")}`);
            return;
        }

        let entries: LegacyEntry[];
        try {
            entries = parseLegacyEntries(contents);
        } catch (error) {
            this.adapter.log.error(
                `Cannot parse legacy minmax configuration at "${legacyFilePath}"; it was kept for retry: ${describeError(error)}`,
            );
            return;
        }

        try {
            const configuredInstances = await this.adapter.getForeignObjectsAsync("system.adapter.minmax.*", "instance");
            const instanceIds = Object.keys(configuredInstances);
            const canAssignLegacyData = instanceIds.length === 1 && instanceIds[0] === `system.adapter.${this.adapter.namespace}`;
            let migratedCount = 0;
            let discardedCount = 0;

            for (const entry of entries) {
                const sourceObject = await this.adapter.getForeignObjectAsync(entry.id);
                if (!sourceObject || sourceObject.type !== "state") {
                    discardedCount++;
                    continue;
                }

                const customValue: unknown = sourceObject.common.custom;
                const custom = isRecord(customValue) ? customValue : {};
                const hasOtherNamespaceConfig = hasOtherMinmaxConfig(custom, this.adapter.namespace);
                if (hasOwn(custom, this.adapter.namespace)) {
                    const currentConfigValue: unknown = custom[this.adapter.namespace];
                    if (!isRecord(currentConfigValue)) {
                        discardedCount++;
                        continue;
                    }

                    const currentConfig = currentConfigValue;
                    const hasCompleteConfig = ["enabled", "logName", "calcDiff"].every((key) => hasOwn(currentConfig, key));
                    if (hasCompleteConfig) {
                        continue;
                    }
                    if (!canAssignLegacyData || hasOtherNamespaceConfig) {
                        discardedCount++;
                        continue;
                    }

                    const mergedConfig = { ...currentConfig };
                    if (!hasOwn(currentConfig, "enabled")) {
                        mergedConfig.enabled = entry.enabled;
                    }
                    if (!hasOwn(currentConfig, "logName")) {
                        mergedConfig.logName = entry.name;
                    }
                    if (!hasOwn(currentConfig, "calcDiff")) {
                        mergedConfig.calcDiff = entry.calcDiff;
                    }
                    if (
                        mergedConfig.enabled !== currentConfig.enabled ||
                        mergedConfig.logName !== currentConfig.logName ||
                        mergedConfig.calcDiff !== currentConfig.calcDiff
                    ) {
                        await this.adapter.extendForeignObjectAsync(entry.id, {
                            common: { custom: { [this.adapter.namespace]: mergedConfig } },
                        });
                        migratedCount++;
                    }
                    continue;
                }

                if (!canAssignLegacyData || hasOtherNamespaceConfig) {
                    discardedCount++;
                    continue;
                }

                await this.adapter.extendForeignObjectAsync(entry.id, {
                    common: {
                        custom: {
                            [this.adapter.namespace]: {
                                enabled: entry.enabled,
                                logName: entry.name,
                                calcDiff: entry.calcDiff,
                            },
                        },
                    },
                });
                migratedCount++;
            }

            try {
                await unlink(legacyFilePath);
            } catch (error) {
                if (!isRecord(error) || error.code !== "ENOENT") {
                    throw error;
                }
            }
            if (migratedCount > 0) {
                this.adapter.log.info(`Migrated ${migratedCount} legacy minmax object configuration(s)`);
            }
            if (discardedCount > 0) {
                this.adapter.log.warn(
                    `Discarded ${discardedCount} legacy minmax configuration(s) because they could not be assigned safely. Please carefully check the enabled minmax objects and their visible configuration in Admin.`,
                );
            }
        } catch (error) {
            this.adapter.log.error(
                `Legacy minmax migration failed for "${legacyFilePath}"; the file was kept for retry: ${describeError(error)}`,
            );
        }
    }
}
