"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cron_1 = require("cron");
const timezone_utils_1 = require("./timezone-utils");
class BoundaryScheduler {
    timeZone;
    onBoundary;
    onError;
    job;
    pendingTick = Promise.resolve();
    lastCalendarKeys;
    constructor(timeZone, onBoundary, onError) {
        this.timeZone = timeZone;
        this.onBoundary = onBoundary;
        this.onError = onError;
        this.lastCalendarKeys = (0, timezone_utils_1.getCalendarKeys)(new Date(), timeZone);
    }
    async start() {
        if (this.job) {
            return;
        }
        try {
            await this.handleTick();
        }
        catch (error) {
            this.onError(error);
        }
        this.job = cron_1.CronJob.from({
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
    async stop() {
        const job = this.job;
        this.job = undefined;
        await job?.stop();
        await this.pendingTick;
    }
    async handleTick() {
        const currentCalendarKeys = (0, timezone_utils_1.getCalendarKeys)(new Date(), this.timeZone);
        const resetPeriods = (0, timezone_utils_1.getPeriodResetFlags)(this.lastCalendarKeys, currentCalendarKeys);
        if (!resetPeriods.day && !resetPeriods.month && !resetPeriods.year) {
            return;
        }
        await this.onBoundary(resetPeriods);
        this.lastCalendarKeys = currentCalendarKeys;
    }
}
exports.default = BoundaryScheduler;
//# sourceMappingURL=boundary-scheduler.js.map