"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const minmax_calculator_1 = require("./minmax-calculator");
class MinmaxTracker {
    adapter;
    stateStore;
    calculator = new minmax_calculator_1.MinMaxCalculator();
    statistics = { day: null, month: null, year: null };
    config;
    constructor(adapter, stateStore, config) {
        this.adapter = adapter;
        this.stateStore = stateStore;
        this.config = config;
    }
    get sourceId() {
        return this.config.sourceId;
    }
    get logName() {
        return this.config.logName;
    }
    get calculateDifferences() {
        return this.config.calcDiff;
    }
    async start() {
        await this.stateStore.ensureObjects(this.config.logName, this.config.calcDiff);
        if (!this.config.calcDiff) {
            await this.stateStore.removeDifferences(this.config.logName);
        }
        this.statistics = await this.stateStore.loadStatistics(this.config.logName);
        this.adapter.subscribeForeignStates(this.config.sourceId);
        const current = await this.adapter.getForeignStateAsync(this.config.sourceId);
        if (current?.ack) {
            await this.processValue(current.val);
        }
    }
    async reconfigure(config) {
        const oldLogName = this.config.logName;
        if (oldLogName !== config.logName) {
            await this.stateStore.moveOutput(oldLogName, config.logName, config.calcDiff);
            this.statistics = await this.stateStore.loadStatistics(config.logName);
        }
        this.config = config;
        await this.stateStore.ensureObjects(this.config.logName, this.config.calcDiff);
        if (!this.config.calcDiff) {
            await this.stateStore.removeDifferences(this.config.logName);
        }
    }
    stop() {
        this.adapter.unsubscribeForeignStates(this.config.sourceId);
    }
    async onStateChange(state) {
        if (!state?.ack || !(0, minmax_calculator_1.isNumericValue)(state.val)) {
            return;
        }
        await this.processValue(state.val);
    }
    async processValue(value) {
        if (!(0, minmax_calculator_1.isNumericValue)(value)) {
            return;
        }
        const result = this.calculator.calculate(this.statistics, value, new Date(), { day: false, month: false, year: false }, this.config.calcDiff);
        await this.stateStore.saveCalculation(this.config.logName, this.statistics, result);
        this.statistics = result.statistics;
    }
}
exports.default = MinmaxTracker;
//# sourceMappingURL=minmax-tracker.js.map