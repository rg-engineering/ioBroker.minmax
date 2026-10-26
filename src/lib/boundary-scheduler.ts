import { CronJob } from "cron";
import { getCalendarKeys, getPeriodResetFlags } from "./timezone-utils";
import type { CalendarKeys } from "./timezone-utils";
import type { PeriodResetFlags } from "./types";

export default class BoundaryScheduler {
    private job: CronJob | undefined;
    private pendingTick: Promise<void> = Promise.resolve();
    private lastCalendarKeys: CalendarKeys;

    public constructor(
        private readonly timeZone: string,
        private readonly onBoundary: (resetPeriods: PeriodResetFlags) => Promise<void>,
        private readonly onError: (error: unknown) => void,
    ) {
        this.lastCalendarKeys = getCalendarKeys(new Date(), timeZone);
    }

    public async start(): Promise<void> {
        if (this.job) {
            return;
        }

        try {
            await this.handleTick();
        } catch (error) {
            this.onError(error);
        }

        this.job = CronJob.from({
            cronTime: "0 0 0 * * *",
            timeZone: this.timeZone,
            start: true,
            waitForCompletion: true,
            onTick: () => {
                this.pendingTick = this.handleTick().catch(this.onError);
                return this.pendingTick;
            },
            errorHandler: this.onError,
            name: `minmax-midnight-${this.timeZone}`,
        });
    }

    public async stop(): Promise<void> {
        const job = this.job;
        this.job = undefined;
        await job?.stop();
        await this.pendingTick;
    }

    private async handleTick(): Promise<void> {
        const currentCalendarKeys = getCalendarKeys(new Date(), this.timeZone);
        const resetPeriods = getPeriodResetFlags(this.lastCalendarKeys, currentCalendarKeys);
        if (!resetPeriods.day && !resetPeriods.month && !resetPeriods.year) {
            return;
        }

        await this.onBoundary(resetPeriods);
        this.lastCalendarKeys = currentCalendarKeys;
    }
}
