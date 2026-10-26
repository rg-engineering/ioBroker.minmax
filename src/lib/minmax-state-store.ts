import type { Minmax } from "../main";
import { formatDateTimeInZone, formatTimeInZone } from "./timezone-utils";
import type { Extremum, MinMaxCalculationResult, MinMaxStatistics, PeriodStatistics } from "./types";

interface StoredState {
    val: ioBroker.StateValue;
    ts: number;
}

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
] as const;

const differenceFields = ["TodayDiff", "MonthDiff", "YearDiff"] as const;

export default class MinmaxStateStore {
    public constructor(
        private readonly adapter: Minmax,
        private readonly timeZone: string,
    ) {}

    public async ensureObjects(logName: string, includeDifferences: boolean): Promise<void> {
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
        ] as const;
        const stringStates = [
            ["TodayMinTime", "todays minimum value"],
            ["TodayMaxTime", "todays maximum value"],
            ["MonthMinDate", "month minimum value"],
            ["MonthMaxDate", "month maximum value"],
            ["YearMinDate", "year minimum value"],
            ["YearMaxDate", "year maximum value"],
        ] as const;
        for (const [field, name] of numericStates) {
            await this.ensureState(`${logName}.${field}`, name, "number");
        }
        for (const [field, name] of stringStates) {
            await this.ensureState(`${logName}.${field}`, name, "string");
        }
        if (includeDifferences) {
            const names = ["today diff value", "month diff value", "year diff value"] as const;
            for (const [index, field] of differenceFields.entries()) {
                await this.ensureState(`${logName}.${field}`, names[index], "number");
            }
        }
    }

    public async loadStatistics(logName: string): Promise<MinMaxStatistics> {
        const [day, month, year] = await Promise.all([
            this.loadPeriod(logName, "TodayMin", "TodayMax"),
            this.loadPeriod(logName, "MonthMin", "MonthMax"),
            this.loadPeriod(logName, "YearMin", "YearMax"),
        ]);
        return { day, month, year };
    }

    public async saveCalculation(
        logName: string,
        previous: MinMaxStatistics,
        result: MinMaxCalculationResult,
    ): Promise<void> {
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

    public async removeDifferences(logName: string): Promise<void> {
        for (const field of differenceFields) {
            await this.adapter.delObjectAsync(`${logName}.${field}`);
        }
    }

    public async moveOutput(oldLogName: string, newLogName: string, includeDifferences: boolean): Promise<void> {
        if (oldLogName === newLogName) {
            return;
        }

        await this.ensureObjects(newLogName, includeDifferences);
        const fields: readonly string[] = includeDifferences
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

    public async removeOutput(logName: string): Promise<void> {
        const fields: readonly string[] = [...statisticFields, ...differenceFields];
        for (const field of fields) {
            await this.adapter.delObjectAsync(`${logName}.${field}`);
        }
        await this.adapter.delObjectAsync(logName);
    }

    private async ensureState(id: string, name: string, type: "number" | "string"): Promise<void> {
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

    private async loadPeriod(logName: string, minName: string, maxName: string): Promise<PeriodStatistics | null> {
        const [minimumState, maximumState] = await Promise.all([
            this.adapter.getStateAsync(`${logName}.${minName}`),
            this.adapter.getStateAsync(`${logName}.${maxName}`),
        ]);
        const minimum = this.toExtremum(minimumState);
        const maximum = this.toExtremum(maximumState);
        return minimum && maximum ? { minimum, maximum } : null;
    }

    private toExtremum(state: StoredState | null | undefined): Extremum | null {
        if (!state || typeof state.val !== "number" || !Number.isFinite(state.val) || !Number.isFinite(state.ts)) {
            return null;
        }
        return { value: state.val, timestamp: state.ts };
    }

    private async savePeriod(
        logName: string,
        periodName: "Today" | "Month" | "Year",
        previous: PeriodStatistics | null,
        current: PeriodStatistics,
    ): Promise<void> {
        const writes: Promise<unknown>[] = [];
        if (!previous || previous.minimum !== current.minimum) {
            writes.push(this.adapter.setStateAsync(`${logName}.${periodName}Min`, { val: current.minimum.value, ack: true }));
            writes.push(this.adapter.setStateAsync(`${logName}.${periodName}Min${periodName === "Today" ? "Time" : "Date"}`, {
                val: periodName === "Today"
                    ? formatTimeInZone(current.minimum.timestamp, this.timeZone)
                    : formatDateTimeInZone(current.minimum.timestamp, this.timeZone),
                ack: true,
            }));
        }
        if (!previous || previous.maximum !== current.maximum) {
            writes.push(this.adapter.setStateAsync(`${logName}.${periodName}Max`, { val: current.maximum.value, ack: true }));
            writes.push(this.adapter.setStateAsync(`${logName}.${periodName}Max${periodName === "Today" ? "Time" : "Date"}`, {
                val: periodName === "Today"
                    ? formatTimeInZone(current.maximum.timestamp, this.timeZone)
                    : formatDateTimeInZone(current.maximum.timestamp, this.timeZone),
                ack: true,
            }));
        }
        await Promise.all(writes);
    }

    }
