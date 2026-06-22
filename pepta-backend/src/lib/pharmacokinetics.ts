export const PHARMACOKINETICS_ENGINE_VERSION = "pk-v2";

const MS_PER_HOUR = 60 * 60 * 1000;
const HOURS_PER_DAY = 24;
const CURVE_SAMPLE_HOURS = 6;

export interface MedicationSchedule {
  frequency: "daily" | "weekly" | "biweekly" | "custom";
  intervalDays?: number;
  daysOfWeek?: number[];
}

export interface MedicationDose {
  amount: number;
  datetime: string;
}

export interface MedicationLevelInput {
  compoundId: string;
  compoundName: string;
  halfLifeDays: number;
  doses: MedicationDose[];
  now?: Date;
  scheduleIntervalDays?: number;
  schedule?: MedicationSchedule;
  curveDaysBefore?: number;
  curveDaysAfter?: number;
}

export interface MedicationLevelPoint {
  datetime: string;
  level: number;
}

export interface MedicationLevelResult {
  compoundId: string;
  compoundName: string;
  halfLifeDays: number;
  currentEstimate: number;
  peakEstimate: number;
  troughEstimate: number;
  curve: MedicationLevelPoint[];
  nextDoseAt: string | null;
  hoursUntilNextDose: number | null;
  /** Relative dose-equivalent estimate, not a measured serum concentration. */
  estimateBasis: "relative-dose-equivalent";
  engineVersion: typeof PHARMACOKINETICS_ENGINE_VERSION;
}

function elapsedDays(later: Date, earlier: Date): number {
  return (later.getTime() - earlier.getTime()) / (MS_PER_HOUR * HOURS_PER_DAY);
}

function roundLevel(value: number): number {
  return Number(value.toFixed(4));
}

function levelAt(
  doses: MedicationDose[],
  halfLifeDays: number,
  at: Date,
): number {
  const level = doses.reduce((sum, dose) => {
    const doseAt = new Date(dose.datetime);

    if (Number.isNaN(doseAt.getTime()) || doseAt.getTime() > at.getTime()) {
      return sum;
    }

    const days = elapsedDays(at, doseAt);
    return sum + dose.amount * 0.5 ** (days / halfLifeDays);
  }, 0);

  return roundLevel(level);
}

function latestDose(doses: MedicationDose[]): MedicationDose | null {
  const sorted = doses
    .filter((dose) => !Number.isNaN(new Date(dose.datetime).getTime()))
    .sort(
      (left, right) =>
        new Date(right.datetime).getTime() - new Date(left.datetime).getTime(),
    );

  return sorted[0] ?? null;
}

function msForDays(days: number): number {
  return days * HOURS_PER_DAY * MS_PER_HOUR;
}

function buildCurve(
  input: Required<
    Pick<MedicationLevelInput, "curveDaysAfter" | "curveDaysBefore">
  > & {
    doses: MedicationDose[];
    halfLifeDays: number;
    now: Date;
  },
): MedicationLevelPoint[] {
  const points: MedicationLevelPoint[] = [];
  const start = new Date(input.now);
  start.setUTCDate(start.getUTCDate() - input.curveDaysBefore);
  start.setUTCHours(0, 0, 0, 0);

  const totalDays = input.curveDaysBefore + input.curveDaysAfter;
  const totalSteps = Math.floor(
    (totalDays * HOURS_PER_DAY) / CURVE_SAMPLE_HOURS,
  );
  for (let index = 0; index <= totalSteps; index += 1) {
    const at = new Date(
      start.getTime() + index * CURVE_SAMPLE_HOURS * MS_PER_HOUR,
    );
    points.push({
      datetime: at.toISOString(),
      level: levelAt(input.doses, input.halfLifeDays, at),
    });
  }

  return points;
}

function nextDoseFromSchedule(input: {
  latest: MedicationDose | null;
  now: Date;
  schedule?: MedicationSchedule;
  fallbackIntervalDays?: number;
}): Date | null {
  if (input.latest === null) {
    return null;
  }

  const latestAt = new Date(input.latest.datetime);
  const scheduleDays = input.schedule?.daysOfWeek ?? [];

  if (
    input.schedule &&
    (input.schedule.frequency === "weekly" ||
      input.schedule.frequency === "custom") &&
    scheduleDays.length > 0
  ) {
    for (let dayOffset = 0; dayOffset <= 31; dayOffset += 1) {
      const candidate = new Date(input.now);
      candidate.setUTCHours(0, 0, 0, 0);
      candidate.setUTCDate(candidate.getUTCDate() + dayOffset);
      candidate.setUTCHours(
        latestAt.getUTCHours(),
        latestAt.getUTCMinutes(),
        latestAt.getUTCSeconds(),
        latestAt.getUTCMilliseconds(),
      );

      if (
        candidate.getTime() > input.now.getTime() &&
        scheduleDays.includes(candidate.getUTCDay())
      ) {
        return candidate;
      }
    }
  }

  const intervalDays =
    input.schedule?.intervalDays ?? input.fallbackIntervalDays;
  return intervalDays
    ? new Date(latestAt.getTime() + msForDays(intervalDays))
    : null;
}

function forwardTrough(input: {
  doses: MedicationDose[];
  halfLifeDays: number;
  now: Date;
  nextDose: Date | null;
  curveDaysAfter: number;
}): number {
  const end =
    input.nextDose && input.nextDose.getTime() > input.now.getTime()
      ? input.nextDose
      : new Date(input.now.getTime() + msForDays(input.curveDaysAfter));
  const levels: number[] = [];

  for (
    let atMs = input.now.getTime();
    atMs <= end.getTime();
    atMs += CURVE_SAMPLE_HOURS * MS_PER_HOUR
  ) {
    levels.push(levelAt(input.doses, input.halfLifeDays, new Date(atMs)));
  }

  if (levels.length === 0) {
    return levelAt(input.doses, input.halfLifeDays, input.now);
  }

  return Math.min(...levels);
}

export function computeMedicationLevel(
  input: MedicationLevelInput,
): MedicationLevelResult {
  const now = input.now ?? new Date();
  const curveDaysBefore = input.curveDaysBefore ?? 7;
  const curveDaysAfter = input.curveDaysAfter ?? 7;
  const curve = buildCurve({
    doses: input.doses,
    halfLifeDays: input.halfLifeDays,
    now,
    curveDaysBefore,
    curveDaysAfter,
  });
  const latest = latestDose(input.doses);
  const nextDose = nextDoseFromSchedule({
    latest,
    now,
    schedule: input.schedule,
    fallbackIntervalDays: input.scheduleIntervalDays,
  });
  const hoursUntilNextDose =
    nextDose === null
      ? null
      : Math.max(
          0,
          Math.round((nextDose.getTime() - now.getTime()) / MS_PER_HOUR),
        );
  const levels = curve.map((point) => point.level);

  return {
    compoundId: input.compoundId,
    compoundName: input.compoundName,
    halfLifeDays: input.halfLifeDays,
    currentEstimate: levelAt(input.doses, input.halfLifeDays, now),
    peakEstimate: levels.length > 0 ? Math.max(...levels) : 0,
    troughEstimate: forwardTrough({
      doses: input.doses,
      halfLifeDays: input.halfLifeDays,
      now,
      nextDose,
      curveDaysAfter,
    }),
    curve,
    nextDoseAt: nextDose?.toISOString() ?? null,
    hoursUntilNextDose,
    estimateBasis: "relative-dose-equivalent",
    engineVersion: PHARMACOKINETICS_ENGINE_VERSION,
  };
}
