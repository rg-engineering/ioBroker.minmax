import type { Minmax } from "../main";
import { describeError } from "./error-utils";
import { isNumericValue, MinMaxCalculator } from "./minmax-calculator";
import type MinmaxStateStore from "./minmax-state-store";
import { getStalePeriodResetFlags } from "./timezone-utils";
import type { MinMaxStatistics, MinmaxTrackerConfig, PeriodResetFlags } from "./types";

export default class MinmaxTracker {
    private readonly calculator = new MinMaxCalculator();
    private statistics: MinMaxStatistics = { day: null, month: null, year: null };
    private config: MinmaxTrackerConfig;
    private pendingCalculation: Promise<void> = Promise.resolve();

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
            await this.enqueueValue(current.val);
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
        await this.enqueueValue(state.val);
    }

    public async onBoundary(resetPeriods: PeriodResetFlags): Promise<void> {
        const current = await this.adapter.getForeignStateAsync(this.config.sourceId);
        if (current?.ack && isNumericValue(current.val)) {
            await this.enqueueValue(current.val, resetPeriods);
        }
    }

    private enqueueValue(value: unknown, requestedResets?: PeriodResetFlags): Promise<void> {
        const calculation = this.pendingCalculation.then(() => this.processValue(value, requestedResets));
        this.pendingCalculation = calculation.catch((error: unknown) => {
            this.adapter.log.error(`Failed to update min/max for ${this.config.sourceId}: ${describeError(error)}`);
        });
        return calculation;
    }

    private async processValue(value: unknown, requestedResets?: PeriodResetFlags): Promise<void> {
        if (!isNumericValue(value)) {
            return;
        }

        const observedAt = new Date();
        const stalePeriods = getStalePeriodResetFlags(this.statistics, observedAt, this.adapter.config.timezone || "Europe/Berlin");
        const resetPeriods: PeriodResetFlags = {
            day: stalePeriods.day || requestedResets?.day === true,
            month: stalePeriods.month || requestedResets?.month === true,
            year: stalePeriods.year || requestedResets?.year === true,
        };
        const result = this.calculator.calculate(
            this.statistics,
            value,
            observedAt,
            resetPeriods,
            this.config.calcDiff,
        );
        await this.stateStore.saveCalculation(this.config.logName, this.statistics, result);
        this.statistics = result.statistics;
    }
}
