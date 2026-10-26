"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MinMaxCalculator = void 0;
exports.isNumericValue = isNumericValue;
function isNumericValue(value) {
    return typeof value === "number" && Number.isFinite(value);
}
class MinMaxCalculator {
    calculate(current, value, observedAt, resetPeriods, calculateDifferences) {
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
        const statistics = { day, month, year };
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
    updatePeriod(current, value, timestamp, reset) {
        if (current === null || reset) {
            const extremum = { value, timestamp };
            return { minimum: extremum, maximum: extremum };
        }
        return {
            minimum: value < current.minimum.value
                ? { value, timestamp }
                : current.minimum,
            maximum: value > current.maximum.value
                ? { value, timestamp }
                : current.maximum,
        };
    }
}
exports.MinMaxCalculator = MinMaxCalculator;
//# sourceMappingURL=minmax-calculator.js.map