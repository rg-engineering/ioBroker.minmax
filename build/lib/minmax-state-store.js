"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const timezone_utils_1 = require("./timezone-utils");
const statisticFields = [
    "TodayMin",
    "TodayMinTime",
    "TodayMax",
    "TodayMaxTime",
    "MonthMin",
    "MonthMinDate",
    "MonthMax",
    "MonthMaxDate",
    "YearMin",
    "YearMinDate",
    "YearMax",
    "YearMaxDate",
];
const differenceFields = ["TodayDiff", "MonthDiff", "YearDiff"];
class MinmaxStateStore {
    adapter;
    timeZone;
    constructor(adapter, timeZone) {
        this.adapter = adapter;
        this.timeZone = timeZone;
    }
    async ensureObjects(logName, includeDifferences) {
        await this.adapter.setObjectNotExistsAsync(logName, {
            type: "channel",
            common: {
                name: "min and max",
                role: "value",
            },
            native: { location: logName },
        });
        const numericStates = [
            ["TodayMin", "todays minimum value"],
            ["TodayMax", "todays maximum value"],
            ["MonthMin", "month minimum value"],
            ["MonthMax", "month maximum value"],
            ["YearMin", "year minimum value"],
            ["YearMax", "year maximum value"],
        ];
        const stringStates = [
            ["TodayMinTime", "todays minimum value"],
            ["TodayMaxTime", "todays maximum value"],
            ["MonthMinDate", "month minimum value"],
            ["MonthMaxDate", "month maximum value"],
            ["YearMinDate", "year minimum value"],
            ["YearMaxDate", "year maximum value"],
        ];
        for (const [field, name] of numericStates) {
            await this.ensureState(`${logName}.${field}`, name, "number");
        }
        for (const [field, name] of stringStates) {
            await this.ensureState(`${logName}.${field}`, name, "string");
        }
        if (includeDifferences) {
            const names = ["today diff value", "month diff value", "year diff value"];
            for (const [index, field] of differenceFields.entries()) {
                await this.ensureState(`${logName}.${field}`, names[index], "number");
            }
        }
    }
    async loadStatistics(logName) {
        const [day, month, year] = await Promise.all([
            this.loadPeriod(logName, "TodayMin", "TodayMax", "TodayMinTime", "TodayMaxTime"),
            this.loadPeriod(logName, "MonthMin", "MonthMax", "MonthMinDate", "MonthMaxDate"),
            this.loadPeriod(logName, "YearMin", "YearMax", "YearMinDate", "YearMaxDate"),
        ]);
        return { day, month, year };
    }
    async saveCalculation(logName, previous, result) {
        await Promise.all([
            this.savePeriod(logName, "Today", previous.day, result.statistics.day),
            this.savePeriod(logName, "Month", previous.month, result.statistics.month),
            this.savePeriod(logName, "Year", previous.year, result.statistics.year),
        ]);
        if (result.differences) {
            await Promise.all([
                this.adapter.setStateAsync(`${logName}.TodayDiff`, { val: result.differences.day, ack: true }),
                this.adapter.setStateAsync(`${logName}.MonthDiff`, { val: result.differences.month, ack: true }),
                this.adapter.setStateAsync(`${logName}.YearDiff`, { val: result.differences.year, ack: true }),
            ]);
        }
    }
    async removeDifferences(logName) {
        for (const field of differenceFields) {
            await this.adapter.delObjectAsync(`${logName}.${field}`);
        }
    }
    async moveOutput(oldLogName, newLogName, includeDifferences) {
        if (oldLogName === newLogName) {
            return;
        }
        await this.ensureObjects(newLogName, includeDifferences);
        const fields = includeDifferences
            ? [...statisticFields, ...differenceFields]
            : statisticFields;
        for (const field of fields) {
            const oldState = await this.adapter.getStateAsync(`${oldLogName}.${field}`);
            if (oldState) {
                await this.adapter.setStateAsync(`${newLogName}.${field}`, {
                    val: oldState.val,
                    ack: oldState.ack,
                    ts: oldState.ts,
                });
            }
        }
        await this.removeOutput(oldLogName);
    }
    async removeOutput(logName) {
        const fields = [...statisticFields, ...differenceFields];
        for (const field of fields) {
            await this.adapter.delObjectAsync(`${logName}.${field}`);
        }
        await this.adapter.delObjectAsync(logName);
    }
    async ensureState(id, name, type) {
        await this.adapter.setObjectNotExistsAsync(id, {
            type: "state",
            common: {
                name,
                role: "value",
                type,
                unit: "",
                read: true,
                write: false,
            },
            native: { location: id },
        });
    }
    async loadPeriod(logName, minName, maxName, minDateName, maxDateName) {
        const [minimumState, maximumState, minimumDateState, maximumDateState] = await Promise.all([
            this.adapter.getStateAsync(`${logName}.${minName}`),
            this.adapter.getStateAsync(`${logName}.${maxName}`),
            this.adapter.getStateAsync(`${logName}.${minDateName}`),
            this.adapter.getStateAsync(`${logName}.${maxDateName}`),
        ]);
        const minimum = this.toExtremum(minimumState, minimumDateState, `${logName}.${minName}`);
        const maximum = this.toExtremum(maximumState, maximumDateState, `${logName}.${maxName}`);
        return minimum && maximum ? { minimum, maximum } : null;
    }
    toExtremum(state, dateState, stateId) {
        if (!state || typeof state.val !== "number" || !Number.isFinite(state.val)) {
            return null;
        }
        let timestamp = typeof state.ts === "number" && Number.isFinite(state.ts) && state.ts > 0
            ? state.ts
            : typeof state.lc === "number" && Number.isFinite(state.lc) && state.lc > 0
                ? state.lc
                : undefined;
        if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
            if (typeof dateState?.val === "string") {
                timestamp = (0, timezone_utils_1.parseDateTimeInZone)(dateState.val, this.timeZone) ?? undefined;
            }
        }
        if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
            this.adapter.log.warn(`Cannot determine the period timestamp for existing statistic ${stateId}; preserving its value until a new extremum is recorded`);
            timestamp = Date.now();
        }
        return { value: state.val, timestamp };
    }
    async savePeriod(logName, periodName, previous, current) {
        const writes = [];
        if (!previous || previous.minimum !== current.minimum) {
            writes.push(this.adapter.setStateAsync(`${logName}.${periodName}Min`, { val: current.minimum.value, ack: true }));
            writes.push(this.adapter.setStateAsync(`${logName}.${periodName}Min${periodName === "Today" ? "Time" : "Date"}`, {
                val: periodName === "Today"
                    ? (0, timezone_utils_1.formatTimeInZone)(current.minimum.timestamp, this.timeZone)
                    : (0, timezone_utils_1.formatDateTimeInZone)(current.minimum.timestamp, this.timeZone),
                ack: true,
            }));
        }
        if (!previous || previous.maximum !== current.maximum) {
            writes.push(this.adapter.setStateAsync(`${logName}.${periodName}Max`, { val: current.maximum.value, ack: true }));
            writes.push(this.adapter.setStateAsync(`${logName}.${periodName}Max${periodName === "Today" ? "Time" : "Date"}`, {
                val: periodName === "Today"
                    ? (0, timezone_utils_1.formatTimeInZone)(current.maximum.timestamp, this.timeZone)
                    : (0, timezone_utils_1.formatDateTimeInZone)(current.maximum.timestamp, this.timeZone),
                ack: true,
            }));
        }
        await Promise.all(writes);
    }
}
exports.default = MinmaxStateStore;
//# sourceMappingURL=minmax-state-store.js.map