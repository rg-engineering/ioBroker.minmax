import type { Minmax } from "../main";
import { isNumericValue, MinMaxCalculator } from "./minmax-calculator";
import type MinmaxStateStore from "./minmax-state-store";
import type { MinMaxStatistics, MinmaxTrackerConfig } from "./types";

export default class MinmaxTracker {
    private readonly calculator = new MinMaxCalculator();
    private statistics: MinMaxStatistics = { day: null, month: null, year: null };
    private config: MinmaxTrackerConfig;

    public constructor(
        private readonly adapter: Minmax,
        private readonly stateStore: MinmaxStateStore,
        config: MinmaxTrackerConfig,
    ) {
        this.config = config;
    }

    public get sourceId(): string {
        return this.config.sourceId;
    }

    public get logName(): string {
        return this.config.logName;
    }

    public get calculateDifferences(): boolean {
        return this.config.calcDiff;
    }

    public async start(): Promise<void> {
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

    public async reconfigure(config: MinmaxTrackerConfig): Promise<void> {
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

    public stop(): void {
        this.adapter.unsubscribeForeignStates(this.config.sourceId);
    }

    public async onStateChange(state: ioBroker.State | null | undefined): Promise<void> {
        if (!state?.ack || !isNumericValue(state.val)) {
            return;
        }
        await this.processValue(state.val);
    }

    private async processValue(value: unknown): Promise<void> {
        if (!isNumericValue(value)) {
            return;
        }

        const result = this.calculator.calculate(
            this.statistics,
            value,
            new Date(),
            { day: false, month: false, year: false },
            this.config.calcDiff,
        );
        await this.stateStore.saveCalculation(this.config.logName, this.statistics, result);
        this.statistics = result.statistics;
    }
}
