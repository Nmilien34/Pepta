import type { HomeResponse, TrackResponse } from "@pepta/shared";
import { buildHomeView } from "./homeView";
import { buildGettingStarted, type LogAction } from "./planView";

export type PepPriorityLevel = "important" | "routine" | "celebration";

export interface PepNotificationCopy {
  title: string;
  body: string;
}

export interface PepPriorityNote {
  id: string;
  text: string;
  emoji?: string;
  cta?: string;
  action?: LogAction;
  tone: "nudge" | "win";
}

export interface PepPriority {
  id: string;
  rank: number;
  level: PepPriorityLevel;
  pushEligible: boolean;
  reminderId?: string;
  note: PepPriorityNote;
  notification?: PepNotificationCopy;
}

export interface PepPriorityInput {
  home: HomeResponse;
  track?: TrackResponse | null;
  now?: Date;
}

const MS_PER_HOUR = 60 * 60 * 1000;

function hoursLabel(hours: number): string {
  const rounded = Math.max(1, Math.round(hours));
  return `${rounded} ${rounded === 1 ? "hour" : "hours"}`;
}

function latestDoseAt(track?: TrackResponse | null): Date | null {
  const latest = [...(track?.doseLogs ?? [])]
    .filter((dose) => dose.deletedAt == null)
    .sort((left, right) => new Date(right.datetime).getTime() - new Date(left.datetime).getTime())[0];
  if (!latest) return null;
  const date = new Date(latest.datetime);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildPepReminderNotificationCopy(
  reminderId: string,
  home: HomeResponse | null,
): PepNotificationCopy | null {
  const compoundName =
    home?.nextDose?.compoundName ??
    home?.activeCompounds[0]?.name ??
    "your medication";
  const proteinGoal = home?.profile?.dailyProteinTargetGrams ?? null;
  const waterGoal = home?.profile?.dailyWaterTargetOz ?? null;

  switch (reminderId) {
    case "dose_due":
      return {
        title: "Pep: shot time",
        body: `I have ${compoundName} due on the board. Log it when it's done, and I'll keep the cycle lined up with you.`,
      };
    case "post_dose_checkin":
      return {
        title: "Pep: post-shot check-in",
        body: "Quick read for me: appetite, side effects, water, and protein. The first day after a shot is useful data.",
      };
    case "protein_anchor":
      return {
        title: "Pep: protein checkpoint",
        body: proteinGoal
          ? `I’m watching your ${Math.round(proteinGoal)}g protein target with you. Anchor the next meal and the day gets easier.`
          : "Protein first on the next meal. Future-you and your muscles both like that plan.",
      };
    case "hydration_check":
      return {
        title: "Pep: water + fiber check",
        body: waterGoal
          ? `Your ${Math.round(waterGoal)} oz water target is still part of the plan. Add a glass if the day got busy.`
          : "Water and fiber check. Small, boring, useful. My favorite category.",
      };
    case "weekly_weigh_in":
      return {
        title: "Pep: scale check",
        body: "Same kind of morning read, no drama. Log it and I’ll watch the trend, not one noisy number.",
      };
    case "trend_review":
      return {
        title: "Pep: weekly read",
        body: "I’ve got your dose cycle, logs, and trend waiting. Open Pepta and we’ll read the week together.",
      };
    case "progress_photo":
      return {
        title: "Pep: photo check-in",
        body: "Same mirror, same light. One quick photo gives us another way to see the journey.",
      };
    default:
      return null;
  }
}

export function buildPepPriorities({ home, track = null, now = new Date() }: PepPriorityInput): PepPriority[] {
  const priorities: PepPriority[] = [];
  const gs = buildGettingStarted(home);
  const view = buildHomeView(home);
  const dose = home.nextDose;

  if (dose && dose.hoursUntilNextDose <= 3) {
    const soon =
      dose.hoursUntilNextDose <= 1
        ? "due soon"
        : `due in ${hoursLabel(dose.hoursUntilNextDose)}`;
    priorities.push({
      id: "dose-due",
      rank: 10,
      level: "important",
      pushEligible: true,
      reminderId: "dose_due",
      note: {
        id: "dose-due",
        text: `${dose.compoundName} is ${soon}. Log it when it’s done so I can keep your cycle lined up.`,
        emoji: "💉",
        cta: "Log dose",
        action: "dose",
        tone: "nudge",
      },
      notification: buildPepReminderNotificationCopy("dose_due", home) ?? undefined,
    });
  }

  const lastDose = latestDoseAt(track);
  if (!dose && lastDose) {
    const hoursSince = (now.getTime() - lastDose.getTime()) / MS_PER_HOUR;
    if (hoursSince >= 12 && hoursSince <= 36) {
      priorities.push({
        id: "post-dose-checkin",
        rank: 12,
        level: "important",
        pushEligible: true,
        reminderId: "post_dose_checkin",
        note: {
          id: "post-dose-checkin",
          text: `${hoursLabel(hoursSince)} since your last shot — log appetite, side effects, water, or protein while this dose settles in.`,
          emoji: "🩺",
          cta: "Quick log",
          action: "water",
          tone: "nudge",
        },
        notification: buildPepReminderNotificationCopy("post_dose_checkin", home) ?? undefined,
      });
    }
  }

  if (gs.show) {
    const next = gs.tasks.find((task) => !task.done && task.action);
    if (next) {
      priorities.push({
        id: `setup-${next.key}`,
        rank: 20,
        level: "routine",
        pushEligible: false,
        note: {
          id: `setup-${next.key}`,
          text: `Next up — ${next.label.toLowerCase()}.`,
          emoji: "✨",
          cta: "Let’s go",
          action: next.action ?? undefined,
          tone: "nudge",
        },
      });
    } else {
      priorities.push({
        id: "setup-done",
        rank: 80,
        level: "celebration",
        pushEligible: false,
        note: {
          id: "setup-done",
          text: "You finished setup — your full dashboard is unlocked!",
          emoji: "🎉",
          tone: "win",
        },
      });
    }
  }

  if (view.protein.target) {
    const gap = Math.round(view.protein.target - view.protein.current);
    if (gap > 0) {
      priorities.push({
        id: "protein-gap",
        rank: gap >= 35 ? 30 : 45,
        level: gap >= 35 ? "important" : "routine",
        pushEligible: gap >= 35,
        reminderId: "protein_anchor",
        note: {
          id: "protein-gap",
          text: `You’re ${gap}g from today’s protein — a snack closes it.`,
          emoji: "🍗",
          cta: "Log a meal",
          action: "meal",
          tone: "nudge",
        },
        notification: buildPepReminderNotificationCopy("protein_anchor", home) ?? undefined,
      });
    } else {
      priorities.push({
        id: "protein-win",
        rank: 90,
        level: "celebration",
        pushEligible: false,
        note: {
          id: "protein-win",
          text: "Protein goal hit for today — that’s the muscle move.",
          emoji: "💪",
          tone: "win",
        },
      });
    }
  }

  if (view.water.target && view.water.current < view.water.target) {
    priorities.push({
      id: "water",
      rank: 50,
      level: "routine",
      pushEligible: false,
      reminderId: "hydration_check",
      note: {
        id: "water",
        text: "Hydration check — want to add a glass?",
        emoji: "💧",
        cta: "Add water",
        action: "water",
        tone: "nudge",
      },
      notification: buildPepReminderNotificationCopy("hydration_check", home) ?? undefined,
    });
  }

  const insight = home.insights[0];
  if (insight) {
    priorities.push({
      id: `insight-${insight.id}`,
      rank: 60,
      level: "routine",
      pushEligible: true,
      note: {
        id: `insight-${insight.id}`,
        text: insight.headline,
        emoji: "💡",
        tone: "nudge",
      },
    });
  }

  if (home.streakDays >= 2) {
    priorities.push({
      id: "streak",
      rank: 95,
      level: "celebration",
      pushEligible: false,
      note: {
        id: "streak",
        text: `${home.streakDays}-day streak — keep it rolling.`,
        emoji: "🔥",
        tone: "win",
      },
    });
  }

  if (priorities.length === 0) {
    priorities.push({
      id: "hello",
      rank: 100,
      level: "celebration",
      pushEligible: false,
      note: {
        id: "hello",
        text: "Looking good today — tap me whenever you need a nudge.",
        emoji: "👋",
        tone: "win",
      },
    });
  }

  return priorities.sort((left, right) => left.rank - right.rank);
}
