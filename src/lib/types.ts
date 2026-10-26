export interface MinmaxCustomConfig {
    enabled: boolean;
    logName: string;
    calcDiff: boolean;
}

export interface MinmaxTrackerConfig {
    sourceId: string;
    logName: string;
    calcDiff: boolean;
}

export interface Extremum {
    value: number;
    timestamp: number;
}

export interface PeriodStatistics {
    minimum: Extremum;
    maximum: Extremum;
}

export interface MinMaxStatistics {
    day: PeriodStatistics | null;
    month: PeriodStatistics | null;
    year: PeriodStatistics | null;
}

export interface PeriodResetFlags {
    day: boolean;
    month: boolean;
    year: boolean;
}

export interface MinMaxDifferences {
    day: number;
    month: number;
    year: number;
}

export interface MinMaxCalculationResult {
    statistics: MinMaxStatistics;
    differences?: MinMaxDifferences;
}
