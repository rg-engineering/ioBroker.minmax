import type {
    CalculatedMinMaxStatistics,
    Extremum,
    MinMaxCalculationResult,
    MinMaxStatistics,
    PeriodResetFlags,
    PeriodStatistics,
} from "./types";

export function isNumericValue(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

export class MinMaxCalculator {
    public calculate(
        current: MinMaxStatistics,
        value: unknown,
        observedAt: Date,
        resetPeriods: PeriodResetFlags,
        calculateDifferences: boolean,
    ): MinMaxCalculationResult {
        if (!isNumericValue(value)) {
            throw new TypeError("A min/max measurement must be a finite number");
        }
        if (!(observedAt instanceof Date) || !Number.isFinite(observedAt.getTime())) {
            throw new RangeError("The measurement timestamp must be a valid Date");
        }

        const timestamp = observedAt.getTime();
        const day = this.updatePeriod(current.day, value, timestamp, resetPeriods.day);
        const month = this.updatePeriod(current.month, value, timestamp, resetPeriods.month);
        const year = this.updatePeriod(current.year, value, timestamp, resetPeriods.year);
        const statistics: CalculatedMinMaxStatistics = { day, month, year };

        if (!calculateDifferences) {
            return { statistics };
        }

        return {
            statistics,
            differences: {
                day: day.maximum.value - day.minimum.value,
                month: month.maximum.value - month.minimum.value,
                year: year.maximum.value - year.minimum.value,
            },
        };
    }

    private updatePeriod(
        current: PeriodStatistics | null,
        value: number,
        timestamp: number,
        reset: boolean,
    ): PeriodStatistics {
        if (current === null || reset) {
            const extremum: Extremum = { value, timestamp };
            return { minimum: extremum, maximum: extremum };
        }

        return {
            minimum:
                value < current.minimum.value
                    ? { value, timestamp }
                    : current.minimum,
            maximum:
                value > current.maximum.value
                    ? { value, timestamp }
                    : current.maximum,
        };
    }
}
