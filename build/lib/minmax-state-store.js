"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
    constructor(adapter) {
        this.adapter = adapter;
    }
    async ensureObjects(logName, includeDifferences) {
        await this.adapter.setObjectNotExistsAsync(logName, {
            type: "channel",
            common: { name: "min and max" },
            native: {},
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
            this.loadPeriod(logName, "TodayMin", "TodayMax"),
            this.loadPeriod(logName, "MonthMin", "MonthMax"),
            this.loadPeriod(logName, "YearMin", "YearMax"),
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
            native: { id },
        });
    }
    async loadPeriod(logName, minName, maxName) {
        const [minimumState, maximumState] = await Promise.all([
            this.adapter.getStateAsync(`${logName}.${minName}`),
            this.adapter.getStateAsync(`${logName}.${maxName}`),
        ]);
        const minimum = this.toExtremum(minimumState);
        const maximum = this.toExtremum(maximumState);
        return minimum && maximum ? { minimum, maximum } : null;
    }
    toExtremum(state) {
        if (!state || typeof state.val !== "number" || !Number.isFinite(state.val) || !Number.isFinite(state.ts)) {
            return null;
        }
        return { value: state.val, timestamp: state.ts };
    }
    async savePeriod(logName, periodName, previous, current) {
        const writes = [];
        if (!previous || previous.minimum !== current.minimum) {
            writes.push(this.adapter.setStateAsync(`${logName}.${periodName}Min`, { val: current.minimum.value, ack: true }));
            writes.push(this.adapter.setStateAsync(`${logName}.${periodName}Min${periodName === "Today" ? "Time" : "Date"}`, {
                val: periodName === "Today" ? this.formatTime(current.minimum.timestamp) : this.formatTimestamp(current.minimum.timestamp),
                ack: true,
            }));
        }
        if (!previous || previous.maximum !== current.maximum) {
            writes.push(this.adapter.setStateAsync(`${logName}.${periodName}Max`, { val: current.maximum.value, ack: true }));
            writes.push(this.adapter.setStateAsync(`${logName}.${periodName}Max${periodName === "Today" ? "Time" : "Date"}`, {
                val: periodName === "Today" ? this.formatTime(current.maximum.timestamp) : this.formatTimestamp(current.maximum.timestamp),
                ack: true,
            }));
        }
        await Promise.all(writes);
    }
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const hours = date.getHours().toString().padStart(2, "0");
        const minutes = date.getMinutes().toString().padStart(2, "0");
        const seconds = date.getSeconds().toString().padStart(2, "0");
        return `${hours}:${minutes}:${seconds}`;
    }
    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const dayNumber = date.getDate();
        const day = dayNumber < 10 ? ` ${dayNumber}` : dayNumber.toString();
        const hours = date.getHours().toString().padStart(2, "0");
        const minutes = date.getMinutes().toString().padStart(2, "0");
        const seconds = date.getSeconds().toString().padStart(2, "0");
        return `${day} ${months[date.getMonth()]} ${date.getFullYear()} ${hours}:${minutes}:${seconds}`;
    }
}
exports.default = MinmaxStateStore;
//# sourceMappingURL=minmax-state-store.js.map