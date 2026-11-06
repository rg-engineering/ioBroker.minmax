const path = require("path");
const os = require("os");
const fs = require("fs/promises");
const { expect } = require("chai");
const { tests } = require("@iobroker/testing");
const { isNumericValue, MinMaxCalculator } = require("../build/lib/minmax-calculator");
const MinmaxController = require("../build/lib/minmax-controller").default;
const LegacyConfigMigrator = require("../build/lib/legacy-config-migrator").default;
const { getLegacyConfigPaths } = require("../build/lib/legacy-config-migrator");
const {
    formatDateTimeInZone,
    formatTimeInZone,
    getCalendarKeys,
    getPeriodResetFlags,
    parseDateTimeInZone,
} = require("../build/lib/timezone-utils");

function createMockAdapter(namespace, sourceStates = {}) {
    const states = new Map();
    const objects = new Map();
    const subscriptions = new Set();
    const errors = [];
    const warnings = [];
    const infos = [];
    const foreignObjects = new Map();
    const instances = {};
    const adapter = {
        namespace,
        config: { timezone: "Europe/Berlin" },
        sourceStates,
        states,
        objects,
        subscriptions,
        errors,
        warnings,
        infos,
        foreignObjects,
        instances,
        log: {
            error: (message) => errors.push(message),
            warn: (message) => warnings.push(message),
            info: (message) => infos.push(message),
            debug: () => undefined,
        },
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
        getForeignObjectsAsync: async (pattern) => pattern === "system.adapter.minmax.*" ? instances : Object.fromEntries(foreignObjects),
        getForeignObjectAsync: async (id) => foreignObjects.get(id) || null,
        extendForeignObjectAsync: async (id, patch) => {
            const current = foreignObjects.get(id);
            const next = {
                ...current,
                common: {
                    ...current.common,
                    ...patch.common,
                    custom: { ...(current.common.custom || {}), ...patch.common.custom },
                },
            };
            foreignObjects.set(id, next);
            return next;
        },
    };
    return adapter;
}

function sourceObject(id, namespace, custom, type = "number") {
    return {
        _id: id,
        type: "state",
        common: { name: id, type, custom: { [namespace]: custom } },
        native: {},
    };
}

async function withLegacyFile(contents, run) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "minmax-migration-"));
    const legacyDirectory = path.join(root, "minmax");
    const legacyFile = path.join(legacyDirectory, "minmax.json");
    await fs.mkdir(legacyDirectory);
    await fs.writeFile(legacyFile, contents, "utf8");
    try {
        await run(legacyFile);
    } finally {
        await fs.rm(root, { recursive: true, force: true });
    }
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
            it("parses legacy formatted dates in the configured timezone", () => {
                const timestamp = parseDateTimeInZone(" 7 Jul 2026 12:05:06", "Europe/Berlin");

                expect(timestamp).to.equal(new Date("2026-07-07T10:05:06.000Z").getTime());
                expect(parseDateTimeInZone("not a date", "Europe/Berlin")).to.equal(null);
            });

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

            it("preserves the legacy time and date output formats in the configured timezone", () => {
                const timestamp = new Date("2026-07-07T10:05:06.000Z").getTime();

                expect(formatTimeInZone(timestamp, "Europe/Berlin")).to.equal("12:05:06");
                expect(formatDateTimeInZone(timestamp, "Europe/Berlin")).to.equal(" 7 Jul 2026 12:05:06");
            });
        });

        describe("Legacy configuration migration", () => {
            it("searches the legacy root-relative location and the controller data directory", () => {
                const buildDirectory = path.join(path.sep, "opt", "iobroker", "node_modules", "iobroker.minmax", "build");
                const defaultDataDirectory = path.join(path.sep, "opt", "iobroker", "iobroker-data");

                expect(getLegacyConfigPaths(buildDirectory, defaultDataDirectory)).to.deep.equal([
                    path.join(path.sep, "opt", "iobroker", "iobroker-data", "minmax", "minmax.json"),
                ]);
            });

            it("migrates once and preserves existing visible custom values", async () => {
                await withLegacyFile(JSON.stringify({
                    myObjects: [
                        { id: "sensor.temperature", name: "LegacyName", enabled: true, calcDiff: true },
                    ],
                }), async (legacyFile) => {
                    const namespace = "minmax.0";
                    const adapter = createMockAdapter(namespace);
                    adapter.instances[`system.adapter.${namespace}`] = { type: "instance" };
                    adapter.foreignObjects.set("sensor.temperature", sourceObject("sensor.temperature", namespace, {
                        enabled: false,
                        keep: "visible",
                    }));

                    await new LegacyConfigMigrator(adapter, [legacyFile]).migrate();
                    const migrated = adapter.foreignObjects.get("sensor.temperature").common.custom[namespace];

                    expect(migrated).to.deep.equal({
                        enabled: false,
                        keep: "visible",
                        logName: "LegacyName",
                        calcDiff: true,
                    });
                    expect(adapter.infos[0]).to.contain("Migrated 1");
                    const legacyFileWasRemoved = await fs.access(legacyFile).then(() => false, () => true);
                    expect(legacyFileWasRemoved).to.equal(true);

                    await new LegacyConfigMigrator(adapter, [legacyFile]).migrate();
                    expect(adapter.foreignObjects.get("sensor.temperature").common.custom[namespace]).to.deep.equal(migrated);
                });
            });

            it("defaults an omitted legacy calcDiff setting to false", async () => {
                await withLegacyFile(JSON.stringify({
                    myObjects: [
                        { id: "sensor.temperature", name: "Temperature", enabled: true },
                    ],
                }), async (legacyFile) => {
                    const namespace = "minmax.0";
                    const adapter = createMockAdapter(namespace);
                    adapter.instances[`system.adapter.${namespace}`] = { type: "instance" };
                    adapter.foreignObjects.set("sensor.temperature", sourceObject("sensor.temperature", namespace, {}));

                    await new LegacyConfigMigrator(adapter, [legacyFile]).migrate();

                    expect(adapter.foreignObjects.get("sensor.temperature").common.custom[namespace]).to.deep.equal({
                        enabled: true,
                        logName: "Temperature",
                        calcDiff: false,
                    });
                    expect(adapter.errors).to.have.length(0);
                });
            });

            it("discards legacy entries when multiple adapter instances make ownership ambiguous", async () => {
                await withLegacyFile(JSON.stringify({
                    myObjects: [
                        { id: "sensor.temperature", name: "LegacyName", enabled: true, calcDiff: false },
                    ],
                }), async (legacyFile) => {
                    const adapter = createMockAdapter("minmax.0");
                    adapter.instances["system.adapter.minmax.0"] = { type: "instance" };
                    adapter.instances["system.adapter.minmax.1"] = { type: "instance" };
                    adapter.foreignObjects.set("sensor.temperature", sourceObject("sensor.temperature", "minmax.1", {
                        enabled: true,
                        logName: "OtherInstance",
                        calcDiff: false,
                    }));

                    await new LegacyConfigMigrator(adapter, [legacyFile]).migrate();

                    expect(adapter.foreignObjects.get("sensor.temperature").common.custom).not.to.have.property("minmax.0");
                    expect(adapter.warnings[0]).to.contain("carefully check");
                    const legacyFileWasRemoved = await fs.access(legacyFile).then(() => false, () => true);
                    expect(legacyFileWasRemoved).to.equal(true);
                });
            });

            it("keeps the legacy file when writing migrated settings fails", async () => {
                await withLegacyFile(JSON.stringify({
                    myObjects: [
                        { id: "sensor.temperature", name: "LegacyName", enabled: true, calcDiff: false },
                    ],
                }), async (legacyFile) => {
                    const namespace = "minmax.0";
                    const adapter = createMockAdapter(namespace);
                    adapter.instances[`system.adapter.${namespace}`] = { type: "instance" };
                    adapter.foreignObjects.set("sensor.temperature", sourceObject("sensor.temperature", namespace, {}));
                    adapter.extendForeignObjectAsync = async () => {
                        throw new Error("object database unavailable");
                    };

                    await new LegacyConfigMigrator(adapter, [legacyFile]).migrate();

                    const legacyFileStillExists = await fs.access(legacyFile).then(() => true, () => false);
                    expect(legacyFileStillExists).to.equal(true);
                    expect(adapter.errors[0]).to.contain("kept for retry");
                });
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
                for (const id of [
                    "TodayMin", "TodayMax", "TodayMinTime", "TodayMaxTime",
                    "MonthMin", "MonthMax", "MonthMinDate", "MonthMaxDate",
                    "YearMin", "YearMax", "YearMinDate", "YearMaxDate",
                    "TodayDiff", "MonthDiff", "YearDiff",
                ]) {
                    expect(adapter.objects.has(`Temperature.${id}`), id).to.equal(true);
                }
                expect(adapter.objects.get("Temperature").common).to.include({ role: "value" });
                expect(adapter.objects.get("Temperature").native.location).to.equal("Temperature");
                expect(adapter.objects.get("Temperature.TodayMin").common).to.include({ type: "number", role: "value" });
                expect(adapter.objects.get("Temperature.TodayMin").native.location).to.equal("Temperature.TodayMin");
                expect(adapter.objects.get("Temperature.TodayMinTime").common).to.include({ type: "string", role: "value" });
                expect(adapter.objects.get("Temperature.TodayDiff").common).to.include({ type: "number", role: "value" });
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

            it("preserves existing extrema on startup when legacy states lack timestamps", async () => {
                const namespace = "minmax.0";
                const adapter = createMockAdapter(namespace, { "sensor.temperature": { val: 15, ack: true } });
                const logName = "Temperature";
                const now = Date.now();
                const currentFormattedDate = formatDateTimeInZone(now, "Europe/Berlin");
                adapter.states.set(`${logName}.TodayMin`, { val: -3, ts: 0, ack: true });
                adapter.states.set(`${logName}.TodayMax`, { val: 30, ts: 0, ack: true });
                adapter.states.set(`${logName}.TodayMinTime`, { val: "06:00:00", ack: true });
                adapter.states.set(`${logName}.TodayMaxTime`, { val: "14:00:00", ack: true });
                adapter.states.set(`${logName}.MonthMin`, { val: 1, ts: 0, ack: true });
                adapter.states.set(`${logName}.MonthMax`, { val: 29, ts: 0, ack: true });
                adapter.states.set(`${logName}.MonthMinDate`, { val: currentFormattedDate, ack: true });
                adapter.states.set(`${logName}.MonthMaxDate`, { val: currentFormattedDate, ack: true });
                adapter.states.set(`${logName}.YearMin`, { val: 0, ts: 0, ack: true });
                adapter.states.set(`${logName}.YearMax`, { val: 35, ts: 0, ack: true });
                adapter.states.set(`${logName}.YearMinDate`, { val: currentFormattedDate, ack: true });
                adapter.states.set(`${logName}.YearMaxDate`, { val: currentFormattedDate, ack: true });
                const controller = new MinmaxController(adapter);
                await controller.initialize({
                    "sensor.temperature": sourceObject("sensor.temperature", namespace, {
                        enabled: true,
                        logName,
                        calcDiff: false,
                    }),
                });

                expect(adapter.states.get(`${logName}.TodayMin`).val).to.equal(-3);
                expect(adapter.states.get(`${logName}.TodayMax`).val).to.equal(30);
                expect(adapter.states.get(`${logName}.MonthMin`).val).to.equal(1);
                expect(adapter.states.get(`${logName}.MonthMax`).val).to.equal(29);
                expect(adapter.states.get(`${logName}.YearMin`).val).to.equal(0);
                expect(adapter.states.get(`${logName}.YearMax`).val).to.equal(35);
                expect(adapter.warnings).to.have.length(2);
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
