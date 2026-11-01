import type { MinMaxStatistics, PeriodResetFlags } from "./types";

export interface CalendarKeys {
    day: string;
    month: string;
    year: string;
}

function getCalendarParts(date: Date, timeZone: string): Record<string, string> {
    if (!Number.isFinite(date.getTime())) {
        throw new RangeError("Cannot determine calendar period for an invalid date");
    }

    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        calendar: "iso8601",
        numberingSystem: "latn",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);
    return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

export function getCalendarKeys(date: Date, timeZone: string): CalendarKeys {
    const parts = getCalendarParts(date, timeZone);
    return {
        day: `${parts.year}-${parts.month}-${parts.day}`,
        month: `${parts.year}-${parts.month}`,
        year: parts.year,
    };
}

export function getPeriodResetFlags(previous: CalendarKeys, current: CalendarKeys): PeriodResetFlags {
    return {
        day: previous.day !== current.day,
        month: previous.month !== current.month,
        year: previous.year !== current.year,
    };
}

export function getStalePeriodResetFlags(
    statistics: MinMaxStatistics,
    currentDate: Date,
    timeZone: string,
): PeriodResetFlags {
    const currentKeys = getCalendarKeys(currentDate, timeZone);
    return {
        day: periodIsStale(statistics.day, currentKeys.day, timeZone, "day"),
        month: periodIsStale(statistics.month, currentKeys.month, timeZone, "month"),
        year: periodIsStale(statistics.year, currentKeys.year, timeZone, "year"),
    };
}

function periodIsStale(
    statistics: MinMaxStatistics["day"],
    currentPeriod: string,
    timeZone: string,
    period: keyof CalendarKeys,
): boolean {
    if (!statistics) {
        return false;
    }

    return [statistics.minimum.timestamp, statistics.maximum.timestamp].some((timestamp) => {
        const timestampKeys = getCalendarKeys(new Date(timestamp), timeZone);
        return timestampKeys[period] !== currentPeriod;
    });
}

export function formatTimeInZone(timestamp: number, timeZone: string): string {
    const parts = getCalendarParts(new Date(timestamp), timeZone);
    return `${parts.hour}:${parts.minute}:${parts.second}`;
}

export function formatDateTimeInZone(timestamp: number, timeZone: string): string {
    const parts = getCalendarParts(new Date(timestamp), timeZone);
    const dayNumber = Number(parts.day);
    const day = dayNumber < 10 ? ` ${dayNumber}` : dayNumber.toString();
    const month = new Intl.DateTimeFormat("en-US", { timeZone, month: "short" }).format(new Date(timestamp));
    return `${day} ${month} ${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}
