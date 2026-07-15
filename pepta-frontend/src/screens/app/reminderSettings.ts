import type { HomeResponse, TrackResponse } from "@pepta/shared";
import { buildPepReminderNotificationCopy, type PepNotificationCopy } from "./pepPriorities";

export type ReminderIcon =
  | "notifications"
  | "needle"
  | "nutrition"
  | "water"
  | "scale"
  | "chart-line"
  | "images"
  | "pulse";

export type ReminderScheduleRule =
  | { kind: "date"; datetime: string }
  | { kind: "weekly"; weekdays: number[]; hour: number; minute: number }
  | { kind: "daily"; hour: number; minute: number }
  | { kind: "timeInterval"; seconds: number; repeats: true }
  | { kind: "none" };

export interface ReminderItem {
  id: string;
  icon: ReminderIcon;
  label: string;
  subtitle: string;
  defaultOn: boolean;
  schedule: ReminderScheduleRule;
  notification?: PepNotificationCopy;
}

export interface ReminderGroup {
  title: string;
  items: ReminderItem[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function validIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function addDaysIso(value: string, days: number): string {
  return new Date(new Date(value).getTime() + days * MS_PER_DAY).toISOString();
}

function formatDoseDateTime(value: string, timezone: string | null | undefined): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Scheduled dose";

  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone ?? undefined,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }
}

function dateSchedule(datetime: string | null): ReminderScheduleRule {
  return datetime ? { kind: "date", datetime } : { kind: "none" };
}

export function deriveReminderGroups(args: {
  home: HomeResponse | null;
  track: TrackResponse | null;
}): ReminderGroup[] {
  const nextDoseAt = validIso(args.home?.nextDose?.nextDoseAt);
  const compoundName =
    args.home?.nextDose?.compoundName ??
    args.home?.activeCompounds[0]?.name ??
    "your medication";
  const timezone = args.home?.profile?.timezone ?? null;
  const proteinTarget = args.home?.profile?.dailyProteinTargetGrams;
  const postDoseAt = nextDoseAt ? addDaysIso(nextDoseAt, 1) : null;
  const notification = (id: string): PepNotificationCopy | undefined =>
    buildPepReminderNotificationCopy(id, args.home) ?? undefined;

  return [
    {
      title: "DOSE CYCLE",
      items: [
        {
          id: "dose_due",
          icon: "needle",
          label: "Dose reminder",
          subtitle: nextDoseAt
            ? `${compoundName} · ${formatDoseDateTime(nextDoseAt, timezone)}`
            : "Set your dose schedule to enable",
          defaultOn: Boolean(nextDoseAt),
          schedule: dateSchedule(nextDoseAt),
          notification: notification("dose_due"),
        },
        {
          id: "post_dose_checkin",
          icon: "pulse",
          label: "Post-dose check-in",
          subtitle: nextDoseAt
            ? "24 hours after your next dose"
            : "Enabled after your next dose is scheduled",
          defaultOn: Boolean(postDoseAt),
          schedule: dateSchedule(postDoseAt),
          notification: notification("post_dose_checkin"),
        },
      ],
    },
    {
      title: "DAILY ANCHORS",
      items: [
        {
          id: "protein_anchor",
          icon: "nutrition",
          label: "Protein anchor",
          subtitle: proteinTarget
            ? `Aim for ${Math.round(proteinTarget)}g by evening`
            : "Late-morning protein check",
          defaultOn: true,
          schedule: { kind: "daily", hour: 11, minute: 30 },
          notification: notification("protein_anchor"),
        },
        {
          id: "hydration_check",
          icon: "water",
          label: "Hydration + fiber",
          subtitle: "Afternoon water + fiber check",
          defaultOn: true,
          schedule: { kind: "daily", hour: 15, minute: 30 },
          notification: notification("hydration_check"),
        },
      ],
    },
    {
      title: "CHECK-INS",
      items: [
        {
          id: "weekly_weigh_in",
          icon: "scale",
          label: "Weekly weigh-in",
          subtitle: "Sunday morning",
          defaultOn: true,
          schedule: { kind: "weekly", weekdays: [1], hour: 8, minute: 0 },
          notification: notification("weekly_weigh_in"),
        },
        {
          id: "trend_review",
          icon: "chart-line",
          label: "Weekly trend review",
          subtitle: "Monday morning",
          defaultOn: true,
          schedule: { kind: "weekly", weekdays: [2], hour: 9, minute: 0 },
          notification: notification("trend_review"),
        },
        {
          id: "progress_photo",
          icon: "images",
          label: "Progress photo",
          subtitle: "Every 4 weeks",
          defaultOn: false,
          schedule: { kind: "timeInterval", seconds: 28 * MS_PER_DAY / 1000, repeats: true },
          notification: notification("progress_photo"),
        },
      ],
    },
  ];
}

export function defaultReminderState(groups: ReminderGroup[]): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  for (const group of groups) {
    for (const item of group.items) {
      state[item.id] = item.defaultOn;
    }
  }
  return state;
}
