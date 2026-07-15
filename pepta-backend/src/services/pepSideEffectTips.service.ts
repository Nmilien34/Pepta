export interface PepSideEffectTipInput {
  types: string[];
  severity: number;
  when: string;
}

export interface PepSideEffectTip {
  label: string;
  supportTip: string;
  clinicianPrompt: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  nausea: "nausea",
  constipation: "constipation",
  diarrhea: "diarrhea",
  fatigue: "fatigue",
  headache: "headache",
  reflux: "reflux",
  hair_loss: "hair changes",
  bloating: "bloating",
  sulfur_burps: "sulfur burps",
  appetite_suppression: "low appetite",
  injection_site_reaction: "injection-site irritation",
  other: "a side effect",
};

function primaryType(types: string[]): string {
  return types.find((type) => type && type !== "other") ?? types[0] ?? "other";
}

export function sideEffectLabel(types: string[]): string {
  return TYPE_LABELS[primaryType(types)] ?? "a side effect";
}

export function buildPepSideEffectTip(
  effect: PepSideEffectTipInput,
): PepSideEffectTip {
  const type = primaryType(effect.types);
  const label = sideEffectLabel(effect.types);

  if (effect.severity >= 4) {
    return {
      label,
      clinicianPrompt: true,
      supportTip:
        "Pep noticed this was marked high severity. Please check in with your clinician or seek care if symptoms feel urgent.",
    };
  }

  const genericSupportTip =
    "Pep noticed a side effect. A quick symptom log today would help me track the pattern with you.";
  const supportTipByType: Record<string, string> = {
    nausea:
      "Pep noticed nausea. Smaller meals today and a quick log after eating can help me track the pattern.",
    constipation:
      "Pep saw constipation. Water, fiber, and a quick symptom log today would help me track the pattern.",
    diarrhea:
      "Pep noticed diarrhea. Hydration matters today; log how it changes so we can track the pattern.",
    fatigue:
      "Pep noticed fatigue. A quick energy check-in today will help me see if this is becoming a pattern.",
    headache:
      "Pep noticed a headache. Water and a quick symptom log today would help me track the pattern.",
    reflux:
      "Pep noticed reflux. Smaller meals and a quick note after eating can help me spot the pattern.",
    bloating:
      "Pep noticed bloating. A simple meal and symptom log today can help me track what changed.",
    sulfur_burps:
      "Pep noticed sulfur burps. Log meals and symptoms today so I can watch the pattern with you.",
    appetite_suppression:
      "Pep noticed low appetite. Protein-first bites and a quick meal log can help me track the day.",
    injection_site_reaction:
      "Pep noticed injection-site irritation. Keep a simple symptom log so we can track the pattern.",
    hair_loss:
      "Pep noticed hair changes. Logging protein and symptoms can help us track the pattern over time.",
    other: genericSupportTip,
  };

  return {
    label,
    clinicianPrompt: false,
    supportTip: supportTipByType[type] ?? genericSupportTip,
  };
}
