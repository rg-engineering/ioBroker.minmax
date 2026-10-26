"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const error_utils_1 = require("./error-utils");
const minmax_calculator_1 = require("./minmax-calculator");
const timezone_utils_1 = require("./timezone-utils");
class MinmaxTracker {
    adapter;
    stateStore;
    calculator = new minmax_calculator_1.MinMaxCalculator();
    statistics = { day: null, month: null, year: null };
    config;
    pendingCalculation = Promise.resolve();
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
            await this.enqueueValue(current.val);
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
        await this.enqueueValue(state.val);
    }
    async onBoundary(resetPeriods) {
        const current = await this.adapter.getForeignStateAsync(this.config.sourceId);
        if (current?.ack && (0, minmax_calculator_1.isNumericValue)(current.val)) {
            await this.enqueueValue(current.val, resetPeriods);
        }
    }
    enqueueValue(value, requestedResets) {
        const calculation = this.pendingCalculation.then(() => this.processValue(value, requestedResets));
        this.pendingCalculation = calculation.catch((error) => {
            this.adapter.log.error(`Failed to update min/max for ${this.config.sourceId}: ${(0, error_utils_1.describeError)(error)}`);
        });
        return calculation;
    }
    async processValue(value, requestedResets) {
        if (!(0, minmax_calculator_1.isNumericValue)(value)) {
            return;
        }
        const observedAt = new Date();
        const stalePeriods = (0, timezone_utils_1.getStalePeriodResetFlags)(this.statistics, observedAt, this.adapter.config.timezone || "Europe/Berlin");
        const resetPeriods = {
            day: stalePeriods.day || requestedResets?.day === true,
            month: stalePeriods.month || requestedResets?.month === true,
            year: stalePeriods.year || requestedResets?.year === true,
        };
        const result = this.calculator.calculate(this.statistics, value, observedAt, resetPeriods, this.config.calcDiff);
        await this.stateStore.saveCalculation(this.config.logName, this.statistics, result);
        this.statistics = result.statistics;
    }
}
exports.default = MinmaxTracker;
//# sourceMappingURL=minmax-tracker.js.map