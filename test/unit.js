const path = require("path");
const { expect } = require("chai");
const { tests } = require("@iobroker/testing");
const { isNumericValue, MinMaxCalculator } = require("../build/lib/minmax-calculator");
const MinmaxController = require("../build/lib/minmax-controller").default;
const { getCalendarKeys, getPeriodResetFlags } = require("../build/lib/timezone-utils");

function createMockAdapter(namespace, sourceStates = {}) {
    const states = new Map();
    const objects = new Map();
    const subscriptions = new Set();
    const errors = [];
    return {
        namespace,
        config: { timezone: "Europe/Berlin" },
        sourceStates,
        states,
        objects,
        subscriptions,
        errors,
        log: { error: (message) => errors.push(message) },
        setObjectNotExistsAsync: async (id, object) => {
            if (!objects.has(id)) objects.set(id, object);
        },
        getStateAsync: async (id) => states.get(id) || null,
        setStateAsync: async (id, state) => {
            const stored = { ...state, ts: state.ts || Date.now() };
            states.set(id, stored);
            return stored;
        },
        delObjectAsync: async (id) => {
            objects.delete(id);
            states.delete(id);
        },
        getForeignStateAsync: async (id) => sourceStates[id] || null,
        subscribeForeignStates: (id) => subscriptions.add(id),
        unsubscribeForeignStates: (id) => subscriptions.delete(id),
    };
}

function sourceObject(id, namespace, custom, type = "number") {
    return {
        _id: id,
        type: "state",
        common: { name: id, type, custom: { [namespace]: custom } },
        native: {},
    };
}

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

        describe("Timezone utilities", () => {
            it("calculates calendar periods in the configured timezone", () => {
                const instant = new Date("2026-01-01T00:30:00.000Z");

                expect(getCalendarKeys(instant, "Europe/Berlin")).to.deep.equal({
                    day: "2026-01-01",
                    month: "2026-01",
                    year: "2026",
                });
                expect(getCalendarKeys(instant, "America/Los_Angeles")).to.deep.equal({
                    day: "2025-12-31",
                    month: "2025-12",
                    year: "2025",
                });
            });

            it("detects month and year changes as period resets", () => {
                const previous = getCalendarKeys(new Date("2026-12-31T22:59:00.000Z"), "Europe/Berlin");
                const current = getCalendarKeys(new Date("2026-12-31T23:00:00.000Z"), "Europe/Berlin");

                expect(previous).to.deep.equal({ day: "2026-12-31", month: "2026-12", year: "2026" });
                expect(current).to.deep.equal({ day: "2027-01-01", month: "2027-01", year: "2027" });
                expect(getPeriodResetFlags(previous, current)).to.deep.equal({ day: true, month: true, year: true });
            });

            it("keeps the local calendar day continuous through the DST spring transition", () => {
                const beforeTransition = getCalendarKeys(new Date("2026-03-29T00:59:00.000Z"), "Europe/Berlin");
                const afterTransition = getCalendarKeys(new Date("2026-03-29T01:01:00.000Z"), "Europe/Berlin");

                expect(beforeTransition.day).to.equal("2026-03-29");
                expect(afterTransition.day).to.equal("2026-03-29");
                expect(beforeTransition.month).to.equal(afterTransition.month);
            });
        });

        describe("MinmaxController", () => {
            it("loads and subscribes only configurations for this adapter instance", async () => {
                const namespace = "minmax.1";
                const adapter = createMockAdapter(namespace, {
                    "sensor.temperature": { val: 21, ack: true },
                });
                const controller = new MinmaxController(adapter);
                await controller.initialize({
                    "sensor.temperature": sourceObject("sensor.temperature", namespace, {
                        enabled: true,
                        logName: "Temperature",
                        calcDiff: true,
                    }),
                    "sensor.humidity": sourceObject("sensor.humidity", "minmax.0", {
                        enabled: true,
                        logName: "Humidity",
                        calcDiff: false,
                    }),
                });

                expect([...adapter.subscriptions]).to.deep.equal(["sensor.temperature"]);
                expect(adapter.states.get("Temperature.TodayMin").val).to.equal(21);
                expect(adapter.states.get("Temperature.TodayMax").val).to.equal(21);
                expect(adapter.states.get("Temperature.TodayDiff").val).to.equal(0);
                expect(adapter.objects.has("Humidity.TodayMin")).to.equal(false);
            });

            it("rejects duplicate log names without interrupting the existing tracker", async () => {
                const namespace = "minmax.0";
                const adapter = createMockAdapter(namespace, {
                    "sensor.first": { val: 5, ack: true },
                    "sensor.second": { val: 8, ack: true },
                });
                const controller = new MinmaxController(adapter);
                await controller.initialize({
                    "sensor.first": sourceObject("sensor.first", namespace, { enabled: true, logName: "Shared", calcDiff: false }),
                    "sensor.second": sourceObject("sensor.second", namespace, { enabled: true, logName: "Shared", calcDiff: false }),
                });

                expect([...adapter.subscriptions]).to.deep.equal(["sensor.first"]);
                expect(adapter.states.get("Shared.TodayMin").val).to.equal(5);
                expect(adapter.errors).to.have.length(1);
                expect(adapter.errors[0]).to.contain("sensor.second");
            });

            it("moves output values on rename and removes difference states when disabled", async () => {
                const namespace = "minmax.0";
                const adapter = createMockAdapter(namespace, { "sensor.temperature": { val: 14, ack: true } });
                const controller = new MinmaxController(adapter);
                await controller.initialize({
                    "sensor.temperature": sourceObject("sensor.temperature", namespace, {
                        enabled: true,
                        logName: "OldName",
                        calcDiff: true,
                    }),
                });

                await controller.handleObjectChange("sensor.temperature", sourceObject("sensor.temperature", namespace, {
                    enabled: true,
                    logName: "NewName",
                    calcDiff: false,
                }));

                expect(adapter.objects.has("OldName")).to.equal(false);
                expect(adapter.states.has("OldName.TodayMin")).to.equal(false);
                expect(adapter.states.get("NewName.TodayMin").val).to.equal(14);
                expect(adapter.objects.has("NewName.TodayDiff")).to.equal(false);
            });

            it("stops tracking on deactivation but retains existing output data", async () => {
                const namespace = "minmax.0";
                const adapter = createMockAdapter(namespace, { "sensor.temperature": { val: 12, ack: true } });
                const controller = new MinmaxController(adapter);
                await controller.initialize({
                    "sensor.temperature": sourceObject("sensor.temperature", namespace, {
                        enabled: true,
                        logName: "Temperature",
                        calcDiff: false,
                    }),
                });
                const previousMin = adapter.states.get("Temperature.TodayMin");

                await controller.handleObjectChange("sensor.temperature", sourceObject("sensor.temperature", namespace, {
                    enabled: false,
                    logName: "Temperature",
                    calcDiff: false,
                }));

                await controller.handleStateChange("sensor.temperature", { val: 2, ack: true });
                expect(adapter.subscriptions.has("sensor.temperature")).to.equal(false);
                expect(adapter.states.get("Temperature.TodayMin")).to.equal(previousMin);
            });

            it("does not activate non-numeric object types", async () => {
                const namespace = "minmax.0";
                const adapter = createMockAdapter(namespace);
                const controller = new MinmaxController(adapter);
                await controller.initialize({
                    "sensor.label": sourceObject("sensor.label", namespace, {
                        enabled: true,
                        logName: "Label",
                        calcDiff: false,
                    }, "string"),
                });

                expect(adapter.subscriptions.size).to.equal(0);
                expect(adapter.errors[0]).to.contain("wrong configuration");
                expect(adapter.errors[0]).to.contain("sensor.label");
            });

            it("refreshes active values at calendar boundaries", async () => {
                const namespace = "minmax.0";
                const adapter = createMockAdapter(namespace, { "sensor.temperature": { val: 20, ack: true } });
                const controller = new MinmaxController(adapter);
                await controller.initialize({
                    "sensor.temperature": sourceObject("sensor.temperature", namespace, {
                        enabled: true,
                        logName: "Temperature",
                        calcDiff: true,
                    }),
                });

                adapter.sourceStates["sensor.temperature"] = { val: 25, ack: true };
                await controller.handleBoundary({ day: true, month: false, year: false });

                expect(adapter.states.get("Temperature.TodayMin").val).to.equal(25);
                expect(adapter.states.get("Temperature.TodayMax").val).to.equal(25);
                expect(adapter.states.get("Temperature.MonthMin").val).to.equal(20);
                expect(adapter.states.get("Temperature.MonthMax").val).to.equal(25);
                expect(adapter.states.get("Temperature.TodayDiff").val).to.equal(0);
            });

            it("reinitializes stale statistics after a missed period while resuming", async () => {
                const namespace = "minmax.0";
                const adapter = createMockAdapter(namespace, { "sensor.temperature": { val: 8, ack: true } });
                const staleTimestamp = Date.now() - 400 * 24 * 60 * 60 * 1000;
                for (const period of ["Today", "Month", "Year"]) {
                    adapter.states.set(`Temperature.${period}Min`, { val: -10, ts: staleTimestamp, ack: true });
                    adapter.states.set(`Temperature.${period}Max`, { val: 40, ts: staleTimestamp, ack: true });
                }
                const controller = new MinmaxController(adapter);
                await controller.initialize({
                    "sensor.temperature": sourceObject("sensor.temperature", namespace, {
                        enabled: true,
                        logName: "Temperature",
                        calcDiff: true,
                    }),
                });

                for (const period of ["Today", "Month", "Year"]) {
                    expect(adapter.states.get(`Temperature.${period}Min`).val).to.equal(8);
                    expect(adapter.states.get(`Temperature.${period}Max`).val).to.equal(8);
                    expect(adapter.states.get(`Temperature.${period}Diff`).val).to.equal(0);
                }
            });

            it("ignores non-numeric and unacknowledged runtime state changes", async () => {
                const namespace = "minmax.0";
                const adapter = createMockAdapter(namespace, { "sensor.temperature": { val: 20, ack: true } });
                const controller = new MinmaxController(adapter);
                await controller.initialize({
                    "sensor.temperature": sourceObject("sensor.temperature", namespace, {
                        enabled: true,
                        logName: "Temperature",
                        calcDiff: false,
                    }),
                });

                await controller.handleStateChange("sensor.temperature", { val: 30, ack: true });
                await controller.handleStateChange("sensor.temperature", { val: "0", ack: true });
                await controller.handleStateChange("sensor.temperature", { val: 0, ack: false });

                expect(adapter.states.get("Temperature.TodayMin").val).to.equal(20);
                expect(adapter.states.get("Temperature.TodayMax").val).to.equal(30);
            });
        });
    },
});
