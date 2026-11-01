"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = require("node:fs/promises");
const error_utils_1 = require("./error-utils");
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseLegacyEntries(contents) {
    const parsed = JSON.parse(contents);
    if (!isRecord(parsed) || !Array.isArray(parsed.myObjects)) {
        throw new TypeError("Legacy configuration does not contain a myObjects array");
    }
    return parsed.myObjects.map((entry, index) => {
        if (!isRecord(entry) ||
            typeof entry.id !== "string" ||
            entry.id.length === 0 ||
            typeof entry.name !== "string" ||
            entry.name.length === 0 ||
            typeof entry.enabled !== "boolean" ||
            typeof entry.calcDiff !== "boolean") {
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
function hasOwn(record, key) {
    return Object.prototype.hasOwnProperty.call(record, key);
}
function hasOtherMinmaxConfig(custom, namespace) {
    return Object.keys(custom).some((key) => /^minmax\.\d+$/.test(key) && key !== namespace);
}
class LegacyConfigMigrator {
    adapter;
    legacyFilePath;
    constructor(adapter, legacyFilePath) {
        this.adapter = adapter;
        this.legacyFilePath = legacyFilePath;
    }
    async migrate() {
        let contents;
        try {
            contents = await (0, promises_1.readFile)(this.legacyFilePath, "utf8");
        }
        catch (error) {
            if (isRecord(error) && error.code === "ENOENT") {
                this.adapter.log.debug("No legacy minmax configuration found");
                return;
            }
            this.adapter.log.error(`Cannot read legacy minmax configuration; it was kept for retry: ${(0, error_utils_1.describeError)(error)}`);
            return;
        }
        let entries;
        try {
            entries = parseLegacyEntries(contents);
        }
        catch (error) {
            this.adapter.log.error(`Cannot parse legacy minmax configuration; it was kept for retry: ${(0, error_utils_1.describeError)(error)}`);
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
                const customValue = sourceObject.common.custom;
                const custom = isRecord(customValue) ? customValue : {};
                const hasOtherNamespaceConfig = hasOtherMinmaxConfig(custom, this.adapter.namespace);
                if (hasOwn(custom, this.adapter.namespace)) {
                    const currentConfigValue = custom[this.adapter.namespace];
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
                    if (mergedConfig.enabled !== currentConfig.enabled ||
                        mergedConfig.logName !== currentConfig.logName ||
                        mergedConfig.calcDiff !== currentConfig.calcDiff) {
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
                await (0, promises_1.unlink)(this.legacyFilePath);
            }
            catch (error) {
                if (!isRecord(error) || error.code !== "ENOENT") {
                    throw error;
                }
            }
            if (migratedCount > 0) {
                this.adapter.log.info(`Migrated ${migratedCount} legacy minmax object configuration(s)`);
            }
            if (discardedCount > 0) {
                this.adapter.log.warn(`Discarded ${discardedCount} legacy minmax configuration(s) because they could not be assigned safely. Please carefully check the enabled minmax objects and their visible configuration in Admin.`);
            }
        }
        catch (error) {
            this.adapter.log.error(`Legacy minmax migration failed; the file was kept for retry: ${(0, error_utils_1.describeError)(error)}`);
        }
    }
}
exports.default = LegacyConfigMigrator;
//# sourceMappingURL=legacy-config-migrator.js.map