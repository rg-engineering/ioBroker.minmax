const path = require("path");
const { expect } = require("chai");
const { tests } = require("@iobroker/testing");
const { isNumericValue, MinMaxCalculator } = require("../build/lib/minmax-calculator");

tests.unit(path.join(__dirname, ".."), {
    defineAdditionalTests() {
        describe("MinMaxCalculator", () => {
            const calculator = new MinMaxCalculator();
            const noResets = { day: false, month: false, year: false };
            const emptyStatistics = { day: null, month: null, year: null };

            it("initializes each period from the first measurement, including negative values", () => {
                const observedAt = new Date("2026-10-26T12:34:56.000Z");
                const result = calculator.calculate(emptyStatistics, -4, observedAt, noResets, true);
                const expected = {
                    minimum: { value: -4, timestamp: observedAt.getTime() },
                    maximum: { value: -4, timestamp: observedAt.getTime() },
                };

                expect(result.statistics.day).to.deep.equal(expected);
                expect(result.statistics.month).to.deep.equal(expected);
                expect(result.statistics.year).to.deep.equal(expected);
                expect(result.differences).to.deep.equal({ day: 0, month: 0, year: 0 });
            });

            it("updates extrema and timestamps only when a value exceeds them", () => {
                const oldTimestamp = new Date("2026-10-26T10:00:00.000Z").getTime();
                const observedAt = new Date("2026-10-26T11:00:00.000Z");
                const current = {
                    day: { minimum: { value: 2, timestamp: oldTimestamp }, maximum: { value: 8, timestamp: oldTimestamp } },
                    month: { minimum: { value: 1, timestamp: oldTimestamp }, maximum: { value: 9, timestamp: oldTimestamp } },
                    year: { minimum: { value: 0, timestamp: oldTimestamp }, maximum: { value: 10, timestamp: oldTimestamp } },
                };

                const result = calculator.calculate(current, 11, observedAt, noResets, true);

                expect(result.statistics.day.minimum).to.deep.equal({ value: 2, timestamp: oldTimestamp });
                expect(result.statistics.day.maximum).to.deep.equal({ value: 11, timestamp: observedAt.getTime() });
                expect(result.statistics.month.maximum.value).to.equal(11);
                expect(result.statistics.year.maximum.value).to.equal(11);
                expect(result.differences).to.deep.equal({ day: 9, month: 10, year: 11 });
            });

            it("resets only periods whose boundaries have changed", () => {
                const oldTimestamp = new Date("2026-10-25T23:00:00.000Z").getTime();
                const observedAt = new Date("2026-10-26T00:00:00.000Z");
                const period = {
                    minimum: { value: 1, timestamp: oldTimestamp },
                    maximum: { value: 10, timestamp: oldTimestamp },
                };
                const current = { day: period, month: period, year: period };

                const result = calculator.calculate(current, 5, observedAt, { day: true, month: false, year: false }, true);

                expect(result.statistics.day).to.deep.equal({
                    minimum: { value: 5, timestamp: observedAt.getTime() },
                    maximum: { value: 5, timestamp: observedAt.getTime() },
                });
                expect(result.statistics.month).to.deep.equal(period);
                expect(result.statistics.year).to.deep.equal(period);
                expect(result.differences).to.deep.equal({ day: 0, month: 9, year: 9 });
            });

            it("resets day, month, and year together at a year boundary", () => {
                const observedAt = new Date("2027-01-01T00:00:00.000Z");
                const period = {
                    minimum: { value: 1, timestamp: 0 },
                    maximum: { value: 10, timestamp: 0 },
                };
                const current = { day: period, month: period, year: period };
                const result = calculator.calculate(
                    current,
                    6,
                    observedAt,
                    { day: true, month: true, year: true },
                    false,
                );

                expect(result.statistics.day.minimum.value).to.equal(6);
                expect(result.statistics.month.maximum.value).to.equal(6);
                expect(result.statistics.year.minimum.timestamp).to.equal(observedAt.getTime());
                expect(result.differences).to.equal(undefined);
            });

            it("keeps the original timestamp for tied extrema", () => {
                const period = {
                    minimum: { value: 3, timestamp: 1000 },
                    maximum: { value: 7, timestamp: 1000 },
                };
                const current = { day: period, month: period, year: period };
                const result = calculator.calculate(current, 3, new Date(2000), noResets, false);

                expect(result.statistics.day.minimum.timestamp).to.equal(1000);
                expect(result.statistics.day.maximum.timestamp).to.equal(1000);
            });

            it("rejects non-numeric and non-finite measurements without coercion", () => {
                for (const value of ["12", null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
                    expect(isNumericValue(value), `value ${String(value)}`).to.equal(false);
                    expect(() => calculator.calculate(emptyStatistics, value, new Date(), noResets, false)).to.throw(TypeError);
                }
                expect(isNumericValue(12)).to.equal(true);
            });

            it("rejects invalid timestamps", () => {
                expect(() => calculator.calculate(emptyStatistics, 1, new Date(Number.NaN), noResets, false)).to.throw(RangeError);
            });
        });
    },
});
