import type { Minmax } from "../main";
import MinmaxStateStore from "./minmax-state-store";
import MinmaxTracker from "./minmax-tracker";
import type { MinmaxCustomConfig, MinmaxTrackerConfig } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export default class MinmaxController {
    private readonly stateStore: MinmaxStateStore;
    private readonly trackers = new Map<string, MinmaxTracker>();
    private pendingObjectChanges: Promise<void> = Promise.resolve();

    public constructor(private readonly adapter: Minmax) {
        this.stateStore = new MinmaxStateStore(adapter);
    }

    public async initialize(objects: Record<string, ioBroker.StateObject>): Promise<void> {
        for (const id of Object.keys(objects).sort()) {
            await this.handleObjectChange(id, objects[id]);
        }
    }

    public handleObjectChange(id: string, obj: ioBroker.Object | null | undefined): Promise<void> {
        this.pendingObjectChanges = this.pendingObjectChanges
            .then(() => this.applyObjectChange(id, obj))
            .catch((error: unknown) => {
                this.adapter.log.error(`Failed to process object change for ${id}: ${String(error)}`);
            });
        return this.pendingObjectChanges;
    }

    public async handleStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
        const tracker = this.trackers.get(id);
        if (tracker) {
            await tracker.onStateChange(state);
        }
    }

    public async stop(): Promise<void> {
        await this.pendingObjectChanges;
        for (const tracker of this.trackers.values()) {
            tracker.stop();
        }
        this.trackers.clear();
    }

    private async applyObjectChange(id: string, obj: ioBroker.Object | null | undefined): Promise<void> {
        if (!obj || obj.type !== "state") {
            this.removeTracker(id);
            return;
        }

        const config = this.readConfig(obj, this.adapter.namespace);
        if (!config?.enabled) {
            this.removeTracker(id);
            return;
        }

        if (obj.common.type !== "number") {
            this.adapter.log.error(`wrong configuration: ${id} must have the numeric object type`);
            this.removeTracker(id);
            return;
        }

        const logName = config.logName.length > 0 ? config.logName : id;
        const duplicate = [...this.trackers.values()].find((tracker) => tracker.sourceId !== id && tracker.logName === logName);
        if (duplicate) {
            this.adapter.log.error(
                `wrong configuration: ${id} cannot use logName "${logName}" because it is already used by ${duplicate.sourceId}`,
            );
            return;
        }

        const trackerConfig: MinmaxTrackerConfig = {
            sourceId: id,
            logName,
            calcDiff: config.calcDiff,
        };
        const currentTracker = this.trackers.get(id);
        if (currentTracker) {
            await currentTracker.reconfigure(trackerConfig);
            const current = await this.adapter.getForeignStateAsync(id);
            if (current?.ack) {
                await currentTracker.onStateChange(current);
            }
            return;
        }

        const tracker = new MinmaxTracker(this.adapter, this.stateStore, trackerConfig);
        await tracker.start();
        this.trackers.set(id, tracker);
    }

    private removeTracker(id: string): void {
        const tracker = this.trackers.get(id);
        if (tracker) {
            tracker.stop();
            this.trackers.delete(id);
        }
    }

    private readConfig(obj: ioBroker.Object, namespace: string): MinmaxCustomConfig | null {
        if (obj.type !== "state" || !isRecord(obj.common.custom)) {
            return null;
        }
        const custom = obj.common.custom[namespace];
        if (!isRecord(custom)) {
            return null;
        }
        return {
            enabled: custom.enabled === true,
            logName: typeof custom.logName === "string" ? custom.logName : "",
            calcDiff: custom.calcDiff === true,
        };
    }
}
