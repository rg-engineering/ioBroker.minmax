"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const minmax_state_store_1 = __importDefault(require("./minmax-state-store"));
const minmax_tracker_1 = __importDefault(require("./minmax-tracker"));
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
class MinmaxController {
    adapter;
    stateStore;
    trackers = new Map();
    pendingObjectChanges = Promise.resolve();
    constructor(adapter) {
        this.adapter = adapter;
        this.stateStore = new minmax_state_store_1.default(adapter);
    }
    async initialize(objects) {
        for (const id of Object.keys(objects).sort()) {
            await this.handleObjectChange(id, objects[id]);
        }
    }
    handleObjectChange(id, obj) {
        this.pendingObjectChanges = this.pendingObjectChanges
            .then(() => this.applyObjectChange(id, obj))
            .catch((error) => {
            this.adapter.log.error(`Failed to process object change for ${id}: ${String(error)}`);
        });
        return this.pendingObjectChanges;
    }
    async handleStateChange(id, state) {
        const tracker = this.trackers.get(id);
        if (tracker) {
            await tracker.onStateChange(state);
        }
    }
    async stop() {
        await this.pendingObjectChanges;
        for (const tracker of this.trackers.values()) {
            tracker.stop();
        }
        this.trackers.clear();
    }
    async applyObjectChange(id, obj) {
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
            this.adapter.log.error(`wrong configuration: ${id} cannot use logName "${logName}" because it is already used by ${duplicate.sourceId}`);
            return;
        }
        const trackerConfig = {
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
        const tracker = new minmax_tracker_1.default(this.adapter, this.stateStore, trackerConfig);
        await tracker.start();
        this.trackers.set(id, tracker);
    }
    removeTracker(id) {
        const tracker = this.trackers.get(id);
        if (tracker) {
            tracker.stop();
            this.trackers.delete(id);
        }
    }
    readConfig(obj, namespace) {
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
exports.default = MinmaxController;
//# sourceMappingURL=minmax-controller.js.map