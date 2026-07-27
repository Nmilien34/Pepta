// The peptide library — Pepta's reference content.
//
// EDITORIAL RULES (these are what separate us from every competitor library):
//   1. Every entry carries an EVIDENCE level, and the copy must match it.
//      fda_approved → say the approved indication. human_trials → name the
//      trial/result. preclinical → say "animal models" out loud. community →
//      say that no controlled evidence exists.
//   2. Sources are real, checkable, and specific. No "studies show".
//   3. The protocol block reports what users COMMONLY LOG. It is never a
//      recommendation, never a starting dose, and is always labeled as
//      community practice.
//   4. No efficacy verbs for unapproved compounds ("heals", "repairs",
//      "boosts"). Use "studied for", "reported", "in animal models".
//   5. Regulatory status is stated where it materially affects access, and
//      dated — this area moved three times between 2023 and 2026.
//
// Content verified July 2026. `reviewedAt` tracks the review pass so stale
// entries are visible rather than silently rotting.

export type EvidenceLevel =
  | 'fda_approved'
  | 'human_trials'
  | 'preclinical'
  | 'community';

export type LibraryCategory =
  | 'healing'
  | 'weight_loss'
  | 'growth_hormone'
  | 'cognitive'
  | 'longevity'
  | 'immune'
  | 'sexual_health'
  | 'skin';

export type LibraryGoal =
  | 'recovery'
  | 'weight_loss'
  | 'performance'
  | 'longevity'
  | 'cognitive'
  | 'immune'
  | 'skin'
  | 'sleep';

export interface LibrarySource {
  title: string;
  detail: string;
  url?: string;
}

export interface LibraryEntry {
  id: string;
  name: string;
  /** Other names users search by (brand names, synonyms). */
  aka?: string[];
  /** Scannable nickname, the pattern competitors use well. */
  epithet: string;
  category: LibraryCategory;
  goals: LibraryGoal[];
  evidence: EvidenceLevel;
  /** One line for the list card. */
  summary: string;
  /** Detail prose — what it is, in plain language, claim-matched to evidence. */
  about: string;
  /** Where the evidence actually stands. Always present. */
  evidenceNote: string;
  /** What users commonly log. Community practice, never advice. */
  protocol?: {
    dose?: string;
    timing?: string;
    cycle?: string;
    route?: string;
  };
  /** Safety signals worth knowing before a prescriber conversation. */
  safety?: string;
  /** Access/legal status where it matters (dated). */
  regulatory?: string;
  sources: LibrarySource[];
  /** Reconstitution applies (shows the mix-calculator link). */
  reconstituted?: boolean;
}

export interface LibraryStack {
  id: string;
  name: string;
  tagline: string;
  entryIds: string[];
  /** Why the community pairs these — descriptive, not prescriptive. */
  rationale: string;
  goals: LibraryGoal[];
}

export const EVIDENCE_META: Record<
  EvidenceLevel,
  { label: string; short: string; blurb: string }
> = {
  fda_approved: {
    label: 'FDA APPROVED',
    short: 'Approved',
    blurb:
      'Approved by the FDA for at least one indication, with completed human trials behind it.',
  },
  human_trials: {
    label: 'HUMAN TRIALS',
    short: 'In trials',
    blurb:
      'Tested in humans in registered trials, but not FDA-approved for this use.',
  },
  preclinical: {
    label: 'PRECLINICAL',
    short: 'Animal data',
    blurb:
      'Evidence comes from animal or lab studies. Human efficacy has not been established.',
  },
  community: {
    label: 'COMMUNITY REPORTED',
    short: 'Anecdotal',
    blurb:
      'No controlled human evidence. What is known comes from user reports.',
  },
};

export const CATEGORY_META: Record<
  LibraryCategory,
  { label: string; icon: string; tint: string; fg: string }
> = {
  healing: { label: 'Healing & recovery', icon: 'heart', tint: '#E1F5EE', fg: '#0F6E56' },
  weight_loss: { label: 'Weight & metabolic', icon: 'flame', tint: '#FFEDE4', fg: '#B4531F' },
  growth_hormone: { label: 'Growth hormone', icon: 'trending-down', tint: '#EFEBFF', fg: '#7C5CFC' },
  cognitive: { label: 'Cognitive', icon: 'bulb', tint: '#E7F4FF', fg: '#1273C4' },
  longevity: { label: 'Longevity', icon: 'restore', tint: '#FFF6E0', fg: '#8A6300' },
  immune: { label: 'Immune', icon: 'shield-check', tint: '#E8F8EE', fg: '#1E8E40' },
  sexual_health: { label: 'Sexual health', icon: 'heart-pulse', tint: '#FDE9F1', fg: '#A8306B' },
  skin: { label: 'Skin & hair', icon: 'sparkles', tint: '#F3ECFF', fg: '#6D45C9' },
};

export const GOAL_META: Record<LibraryGoal, string> = {
  recovery: 'Recovery',
  weight_loss: 'Weight loss',
  performance: 'Performance',
  longevity: 'Longevity',
  cognitive: 'Cognitive',
  immune: 'Immune',
  skin: 'Skin',
  sleep: 'Sleep',
};

// Compounding categories moved repeatedly; this is the shared note so the
// wording can't drift between entries.
const COMPOUNDING_2026 =
  'Compounding status has moved repeatedly: several peptides were placed on the FDA’s Category 2 bulks list in Sept 2023, and 12 were reinstated to Category 1 in April 2026. Category 1 means a pharmacy may compound it — it is not FDA approval.';

export const LIBRARY_ENTRIES: LibraryEntry[] = [
  // ---------------------------------------------------------------- healing
  {
    id: 'bpc-157',
    name: 'BPC-157',
    aka: ['Body Protection Compound 157', 'Pentadecapeptide BPC 157'],
    epithet: 'The Healer',
    category: 'healing',
    goals: ['recovery'],
    evidence: 'preclinical',
    summary: 'A gastric-protein fragment studied in animals for tendon, ligament and gut-lining repair.',
    about:
      'A 15-amino-acid sequence derived from a protein found in human gastric juice. In rodent studies it accelerated healing of tendon, ligament, muscle and intestinal tissue, and researchers have proposed effects on new blood-vessel growth and nitric-oxide signalling. It is one of the most widely discussed peptides in athlete communities — and one of the least studied in humans.',
    evidenceNote:
      'A 2025 systematic review in orthopaedic sports medicine screened 544 articles and found 35 preclinical animal studies but only 1 clinical study. The authors reported no clinical safety data — human safety is genuinely unknown. No randomized placebo-controlled efficacy trial has been completed for any indication.',
    protocol: {
      dose: '250–500 mcg per dose',
      timing: 'Once or twice daily; many log AM and PM',
      cycle: '4–8 weeks on',
      route: 'Subcutaneous injection (oral forms exist)',
    },
    safety:
      'Human safety data is essentially absent. Because it is not an approved drug, product identity and purity depend entirely on the source.',
    regulatory: COMPOUNDING_2026,
    sources: [
      {
        title: 'Emerging use of BPC-157 in orthopaedic sports medicine (2025)',
        detail: 'Systematic review — 35 preclinical studies, 1 clinical study, no clinical safety data.',
        url: 'https://journals.sagepub.com/doi/abs/10.1177/15563316251355551',
      },
      {
        title: 'FDA 503A bulk drug substances list',
        detail: 'Primary source for current compounding category.',
        url: 'https://www.fda.gov/media/94164/download',
      },
    ],
    reconstituted: true,
  },
  {
    id: 'tb-500',
    name: 'TB-500',
    aka: ['Thymosin beta-4', 'TB4'],
    epithet: 'The Repair Agent',
    category: 'healing',
    goals: ['recovery', 'performance'],
    evidence: 'preclinical',
    summary: 'A synthetic fragment of thymosin beta-4, studied in animals for tissue repair and cell migration.',
    about:
      'TB-500 is a synthetic peptide related to thymosin beta-4, a naturally occurring protein involved in actin regulation and cell migration. Animal work has examined wound healing, corneal repair and cardiac tissue after injury. Human trials of thymosin beta-4 itself have been run for dry eye and wound indications, but TB-500 as sold is not the studied pharmaceutical product.',
    evidenceNote:
      'Preclinical for the athletic-recovery uses it is marketed for. Thymosin beta-4 has entered human trials in ophthalmology and wound care, but those results do not transfer to injected TB-500 for tendon or muscle recovery.',
    protocol: {
      dose: '2–5 mg per week is commonly logged',
      timing: 'Often split into 2 doses per week',
      cycle: '4–6 weeks, then a break',
      route: 'Subcutaneous injection',
    },
    safety: 'Banned in competitive sport under WADA. No established human safety profile for athletic use.',
    regulatory: COMPOUNDING_2026,
    sources: [
      {
        title: 'Thymosin beta-4 in tissue repair — research overview',
        detail: 'Mechanistic and animal-model literature on actin regulation and cell migration.',
      },
      {
        title: 'WADA Prohibited List',
        detail: 'TB-500 falls under prohibited growth factors/peptides in sport.',
        url: 'https://www.wada-ama.org/en/prohibited-list',
      },
    ],
    reconstituted: true,
  },
  {
    id: 'ara-290',
    name: 'ARA-290',
    aka: ['Cibinetide'],
    epithet: 'The Nerve Protector',
    category: 'healing',
    goals: ['recovery', 'cognitive'],
    evidence: 'human_trials',
    summary: 'An erythropoietin-derived peptide trialled in humans for small-fibre neuropathy.',
    about:
      'ARA-290 (cibinetide) is an 11-amino-acid peptide derived from erythropoietin that targets the innate repair receptor without EPO’s red-blood-cell effects. It has been studied for neuropathic pain and small-fibre neuropathy, notably in sarcoidosis and type 2 diabetes.',
    evidenceNote:
      'Genuinely trialled in humans: randomized controlled studies in sarcoidosis-associated small-fibre neuropathy reported improvements in corneal nerve-fibre measures and pain scores. It is not FDA-approved, and development has not produced an approved product.',
    protocol: {
      dose: '2–4 mg per dose is commonly logged',
      timing: 'Daily during a course',
      cycle: '4 weeks is a commonly logged block',
      route: 'Subcutaneous injection',
    },
    regulatory: COMPOUNDING_2026,
    sources: [
      {
        title: 'Cibinetide in sarcoidosis small-fibre neuropathy — RCT',
        detail: 'Randomized human trial reporting corneal nerve-fibre and pain outcomes.',
      },
    ],
    reconstituted: true,
  },
  {
    id: 'kpv',
    name: 'KPV',
    aka: ['Lysine-Proline-Valine'],
    epithet: 'The Inflammation Tamer',
    category: 'healing',
    goals: ['recovery', 'immune'],
    evidence: 'preclinical',
    summary: 'A three-amino-acid fragment of α-MSH studied in animal colitis models for anti-inflammatory effects.',
    about:
      'KPV is the C-terminal tripeptide of alpha-melanocyte-stimulating hormone. In cell and rodent models it reduced inflammatory signalling in the gut, which is why it is discussed for inflammatory bowel conditions and skin inflammation.',
    evidenceNote:
      'Animal and in-vitro data only. No completed human efficacy trials; the gut-inflammation findings come from mouse colitis models.',
    protocol: {
      dose: '200–500 mcg per dose is commonly logged',
      timing: 'Daily',
      cycle: '4 weeks on is commonly logged',
      route: 'Subcutaneous injection or oral capsule',
    },
    regulatory: COMPOUNDING_2026,
    sources: [
      {
        title: 'KPV in experimental colitis',
        detail: 'Rodent and cell-model anti-inflammatory findings.',
      },
    ],
    reconstituted: true,
  },
  {
    id: 'll-37',
    name: 'LL-37',
    aka: ['Cathelicidin', 'hCAP18'],
    epithet: 'The Natural Defender',
    category: 'healing',
    goals: ['immune', 'recovery'],
    evidence: 'preclinical',
    summary: 'A human antimicrobial peptide studied for wound healing and biofilm disruption.',
    about:
      'LL-37 is the only human cathelicidin — an antimicrobial peptide the body produces as part of innate immunity. Laboratory work shows activity against bacteria and biofilms plus immunomodulatory and wound-healing signalling.',
    evidenceNote:
      'Strong mechanistic and lab evidence; clinical evidence for injectable use is not established. Human trials have been limited and indication-specific.',
    protocol: {
      dose: '100–500 mcg is commonly logged',
      timing: 'Daily during a short course',
      cycle: 'Short courses (1–4 weeks) are typical',
      route: 'Subcutaneous injection',
    },
    safety: 'Injection-site reactions are commonly reported. Pro-inflammatory at higher concentrations in lab models.',
    sources: [
      { title: 'Cathelicidin LL-37 in innate immunity and wound repair', detail: 'Mechanistic review literature.' },
    ],
    reconstituted: true,
  },
  {
    id: 'larazotide',
    name: 'Larazotide',
    aka: ['Larazotide acetate', 'AT-1001'],
    epithet: 'The Gut Gatekeeper',
    category: 'healing',
    goals: ['recovery'],
    evidence: 'human_trials',
    summary: 'A tight-junction regulator taken to phase 3 for celiac disease — where it missed its endpoint.',
    about:
      'Larazotide is an orally administered peptide designed to reduce intestinal permeability by regulating tight junctions. It reached the largest late-stage trial program of any "leaky gut" candidate.',
    evidenceNote:
      'A genuine phase 3 program in celiac disease did not meet its primary endpoint, and development was halted. That negative result is the most useful fact about it — earlier phase 2 signals did not hold up.',
    protocol: { route: 'Oral' },
    sources: [
      {
        title: 'Larazotide acetate phase 3 celiac program',
        detail: 'Late-stage trial discontinued after missing primary endpoint.',
      },
    ],
  },
  {
    id: 'teduglutide',
    name: 'Teduglutide',
    aka: ['Gattex', 'Revestive'],
    epithet: 'The Gut Regenerator',
    category: 'healing',
    goals: ['recovery'],
    evidence: 'fda_approved',
    summary: 'An FDA-approved GLP-2 analog for short bowel syndrome.',
    about:
      'Teduglutide is a GLP-2 analog that promotes growth of intestinal mucosa, increasing the absorptive surface of the gut. It is an approved prescription medicine, not a research peptide.',
    evidenceNote:
      'FDA-approved for short bowel syndrome in patients dependent on parenteral support, based on completed randomized trials. Approval is for that indication — not general "gut health".',
    protocol: { route: 'Subcutaneous injection, prescribed' },
    safety:
      'Carries real prescribing considerations including colorectal polyp screening requirements. Prescriber-managed only.',
    sources: [
      { title: 'Gattex (teduglutide) FDA prescribing information', detail: 'Approved indication, trials and monitoring requirements.' },
    ],
  },

  // ----------------------------------------------------------- weight loss
  {
    id: 'semaglutide',
    name: 'Semaglutide',
    aka: ['Ozempic', 'Wegovy', 'Rybelsus'],
    epithet: 'The Standard',
    category: 'weight_loss',
    goals: ['weight_loss'],
    evidence: 'fda_approved',
    summary: 'A GLP-1 receptor agonist approved for type 2 diabetes and for weight management.',
    about:
      'Semaglutide mimics GLP-1, slowing gastric emptying and reducing appetite signalling. It is approved as Ozempic (type 2 diabetes), Wegovy (weight management) and Rybelsus (oral, diabetes), and has cardiovascular-outcome data behind it.',
    evidenceNote:
      'The STEP program established roughly 15% mean body-weight reduction at 68 weeks in adults with obesity, and SELECT reported reduced major cardiovascular events in people with established cardiovascular disease and overweight/obesity.',
    protocol: {
      dose: 'Label titration: 0.25 mg → up to 2.4 mg weekly (Wegovy)',
      timing: 'Once weekly, any time of day, with or without food',
      route: 'Subcutaneous injection (or oral tablet)',
    },
    safety:
      'Boxed warning for thyroid C-cell tumors seen in rodents; contraindicated with personal/family history of medullary thyroid carcinoma or MEN2. GI effects are the most common reason people stop.',
    sources: [
      { title: 'Wegovy prescribing information (FDA)', detail: 'Approved dosing, titration and warnings.' },
      { title: 'STEP 1 trial, NEJM 2021', detail: '~14.9% mean weight loss at 68 weeks vs 2.4% placebo.' },
      { title: 'SELECT trial, NEJM 2023', detail: 'Cardiovascular outcome benefit in non-diabetic patients with CVD.' },
    ],
  },
  {
    id: 'tirzepatide',
    name: 'Tirzepatide',
    aka: ['Mounjaro', 'Zepbound'],
    epithet: 'The Dual Agonist',
    category: 'weight_loss',
    goals: ['weight_loss'],
    evidence: 'fda_approved',
    summary: 'A GIP + GLP-1 dual agonist approved for type 2 diabetes and weight management.',
    about:
      'Tirzepatide activates both the GIP and GLP-1 receptors. The dual mechanism produced larger average weight reduction than GLP-1-only comparators in head-to-head trial programs, and it is approved as Mounjaro (diabetes) and Zepbound (weight management, and obstructive sleep apnea with obesity).',
    evidenceNote:
      'SURMOUNT-1 reported roughly 20.9% mean weight reduction at the highest dose over 72 weeks. SURPASS trials established glycemic efficacy in type 2 diabetes.',
    protocol: {
      dose: 'Label titration: 2.5 mg → up to 15 mg weekly',
      timing: 'Once weekly, any time of day, with or without food',
      route: 'Subcutaneous injection',
    },
    safety:
      'Same boxed warning class as other incretin therapies (rodent thyroid C-cell tumors). GI effects are dose-related and most common during titration.',
    sources: [
      { title: 'Zepbound prescribing information (FDA)', detail: 'Approved indications, titration schedule, warnings.' },
      { title: 'SURMOUNT-1, NEJM 2022', detail: '~20.9% mean weight reduction at 15 mg over 72 weeks.' },
    ],
  },
  {
    id: 'retatrutide',
    name: 'Retatrutide',
    aka: ['LY3437943'],
    epithet: 'The Triple Agonist',
    category: 'weight_loss',
    goals: ['weight_loss'],
    evidence: 'human_trials',
    summary: 'A GLP-1 + GIP + glucagon triple agonist with phase 3 results — not yet approved.',
    about:
      'Retatrutide adds glucagon-receptor activity to the GIP/GLP-1 combination, which appears to increase energy expenditure alongside appetite reduction. It is the most-watched obesity candidate in late-stage development.',
    evidenceNote:
      'Phase 3 TRIUMPH results reported mean weight reduction around 28–30% at the highest doses (TRIUMPH-1: ~28.3% at 80 weeks on 12 mg). It is investigational — anything sold as "retatrutide" outside a trial is not an approved product and has not been through pharmacy-grade quality control.',
    protocol: { route: 'Subcutaneous injection (investigational)' },
    safety:
      'Not approved anywhere. Trial data comes from monitored settings with protocol titration; unsupervised use has none of those guardrails.',
    sources: [
      {
        title: 'TRIUMPH-1 phase 3 results (2026)',
        detail: '~28.3% mean weight loss at 80 weeks, 12 mg dose.',
        url: 'https://www.ajmc.com/view/retatrutide-achieves-up-to-30-3-average-weight-loss-in-phase-3-triumph-1-trial',
      },
      {
        title: 'Lilly TRIUMPH phase 3 announcement',
        detail: 'Company release on pivotal obesity trial outcomes.',
        url: 'https://investor.lilly.com/news-releases/news-release-details/lillys-triple-agonist-retatrutide-delivered-powerful-weight-loss',
      },
    ],
  },
  {
    id: 'cagrilintide',
    name: 'Cagrilintide',
    aka: ['CagriSema (with semaglutide)'],
    epithet: 'The Amylin Partner',
    category: 'weight_loss',
    goals: ['weight_loss'],
    evidence: 'human_trials',
    summary: 'A long-acting amylin analog trialled alongside semaglutide as CagriSema.',
    about:
      'Cagrilintide is an amylin analog — a different satiety pathway from GLP-1 — developed to be combined with semaglutide. The combination is known as CagriSema.',
    evidenceNote:
      'The phase 3 REDEFINE-1 trial reported roughly 20% mean weight reduction over 68 weeks, outperforming either component alone. Not approved at time of writing.',
    protocol: { route: 'Subcutaneous injection (investigational)' },
    sources: [
      { title: 'REDEFINE-1 phase 3', detail: '~20% mean weight reduction at 68 weeks for cagrilintide + semaglutide.' },
    ],
  },
  {
    id: 'liraglutide',
    name: 'Liraglutide',
    aka: ['Saxenda', 'Victoza'],
    epithet: 'The Daily One',
    category: 'weight_loss',
    goals: ['weight_loss'],
    evidence: 'fda_approved',
    summary: 'A daily GLP-1 agonist approved for diabetes and weight management.',
    about:
      'Liraglutide was the first GLP-1 approved for chronic weight management. It is dosed daily rather than weekly, which some people prefer for smoother side-effect control and easier stopping.',
    evidenceNote:
      'The SCALE program supported approval for weight management, with mean reductions in the 5–8% range — smaller than semaglutide or tirzepatide in their respective trials.',
    protocol: {
      dose: 'Label titration: 0.6 mg → up to 3.0 mg daily (Saxenda)',
      timing: 'Once daily, any time of day',
      route: 'Subcutaneous injection',
    },
    sources: [
      { title: 'Saxenda prescribing information (FDA)', detail: 'Approved titration and indication.' },
      { title: 'SCALE trial program', detail: 'Weight-management efficacy and safety data.' },
    ],
  },
  {
    id: 'aod-9604',
    name: 'AOD-9604',
    epithet: 'The Fat-Loss Fragment',
    category: 'weight_loss',
    goals: ['weight_loss'],
    evidence: 'human_trials',
    summary: 'A growth-hormone fragment that was trialled for obesity and did not beat placebo.',
    about:
      'AOD-9604 is a fragment of human growth hormone (residues 176–191) developed on the theory that it could drive fat metabolism without GH’s effects on blood sugar or tissue growth.',
    evidenceNote:
      'It went through human obesity trials and failed to produce significant weight loss versus placebo. That negative result is the key fact — it is still widely marketed for fat loss.',
    protocol: {
      dose: '300 mcg per day is commonly logged',
      timing: 'Often logged fasted, morning',
      route: 'Subcutaneous injection',
    },
    regulatory: COMPOUNDING_2026,
    sources: [
      { title: 'AOD-9604 clinical development', detail: 'Human obesity trials did not show significant weight loss vs placebo.' },
    ],
    reconstituted: true,
  },

  // ------------------------------------------------------- growth hormone
  {
    id: 'tesamorelin',
    name: 'Tesamorelin',
    aka: ['Egrifta'],
    epithet: 'The Approved One',
    category: 'growth_hormone',
    goals: ['performance', 'longevity'],
    evidence: 'fda_approved',
    summary: 'The only FDA-approved GHRH analog — for HIV-associated lipodystrophy.',
    about:
      'Tesamorelin is a stabilized analog of growth-hormone-releasing hormone. It raises the body’s own GH pulses rather than supplying GH directly, and is approved to reduce excess visceral abdominal fat in people with HIV-associated lipodystrophy.',
    evidenceNote:
      'FDA-approved in 2010 on the strength of phase 3 randomized trials showing visceral-fat reduction and IGF-1 increases. Approval is specific to HIV lipodystrophy; general anti-aging or body-composition use is off-label and not supported by that evidence.',
    protocol: {
      dose: '2 mg daily is the approved dose',
      timing: 'Daily, commonly logged at bedtime',
      route: 'Subcutaneous injection',
    },
    safety: 'Raises IGF-1 — monitoring matters, particularly with any cancer history. Prescriber-managed.',
    sources: [
      { title: 'Egrifta (tesamorelin) FDA prescribing information', detail: 'Approved indication, dosing, monitoring.' },
      { title: 'Phase 3 visceral-fat trials', detail: 'Randomized data supporting the approval.' },
    ],
    reconstituted: true,
  },
  {
    id: 'sermorelin',
    name: 'Sermorelin',
    aka: ['GHRH 1-29', 'Geref (discontinued)'],
    epithet: 'The Original GHRH',
    category: 'growth_hormone',
    goals: ['performance', 'sleep', 'longevity'],
    evidence: 'human_trials',
    summary: 'A GHRH fragment once approved as Geref; now a Category 1 compounded prescription.',
    about:
      'Sermorelin is the first 29 amino acids of GHRH — the shortest fragment that still stimulates the pituitary. It was formerly FDA-approved as Geref for diagnosing GH deficiency, and the brand was discontinued commercially rather than for safety.',
    evidenceNote:
      'Has historical phase 2/3 data supporting GH elevation in GH-deficient adults and children. Current compounded use for adult wellness is off that historical base, not new trials.',
    protocol: {
      dose: '100–300 mcg is commonly logged',
      timing: 'Nightly before bed, fasted — the community convention around GH pulses',
      cycle: '3–6 months is a commonly logged block',
      route: 'Subcutaneous injection',
    },
    regulatory: 'Available through compounding pharmacies as a Category 1 substance; the branded product was discontinued.',
    sources: [
      { title: 'Geref (sermorelin) historical FDA labeling', detail: 'Prior approval for GH-deficiency diagnosis.' },
    ],
    reconstituted: true,
  },
  {
    id: 'ipamorelin',
    name: 'Ipamorelin',
    epithet: 'The Gentle Pulse',
    category: 'growth_hormone',
    goals: ['recovery', 'sleep', 'performance'],
    evidence: 'preclinical',
    summary: 'A selective GH secretagogue known for not raising cortisol or prolactin in early studies.',
    about:
      'Ipamorelin is a pentapeptide ghrelin-receptor agonist. Its appeal is selectivity: unlike earlier GHRPs, early studies reported GH release without meaningful increases in cortisol, prolactin or appetite.',
    evidenceNote:
      'Early human pharmacology exists — GH release has been measured in people — but the recovery and body-composition claims rest on preclinical and animal work. No completed efficacy trials support those uses, so treat the selectivity claim as an early-study finding rather than a proven clinical profile.',
    protocol: {
      dose: '200–300 mcg per dose is commonly logged',
      timing: 'Before bed and/or fasted — community practice around natural GH pulses',
      cycle: '8–12 weeks on is commonly logged',
      route: 'Subcutaneous injection',
    },
    regulatory:
      'Removed from the FDA’s Category 2 list in Sept 2024 and compoundable as Category 1 as of the 2026 reinstatements. Not FDA-approved.',
    sources: [
      { title: 'Ipamorelin pharmacology — selectivity studies', detail: 'GH release without cortisol/prolactin rise in early work.' },
      { title: 'FDA 503A bulks list updates (2024–2026)', detail: 'Category movement affecting compounded access.' },
    ],
    reconstituted: true,
  },
  {
    id: 'cjc-1295',
    name: 'CJC-1295 (no DAC)',
    aka: ['Mod GRF 1-29', 'CJC-1295 without DAC'],
    epithet: 'The GH Pulse Trigger',
    category: 'growth_hormone',
    goals: ['recovery', 'performance', 'sleep'],
    evidence: 'preclinical',
    summary: 'A modified GHRH analog commonly paired with a ghrelin agonist for pulsatile GH release.',
    about:
      'CJC-1295 without DAC (also called Modified GRF 1-29) is a GHRH analog engineered for stability. Without the DAC extension its action is short, which is why it is paired with a ghrelin-receptor agonist like ipamorelin — the two act on different receptors.',
    evidenceNote:
      'Early human pharmacology has shown GH and IGF-1 increases, but the recovery, body-composition and anti-aging claims rest on preclinical and animal work — no completed efficacy trials support them.',
    protocol: {
      dose: '100 mcg is commonly logged, often alongside ipamorelin',
      timing: 'Before bed, fasted — the community convention',
      cycle: '8–12 weeks on',
      route: 'Subcutaneous injection',
    },
    regulatory:
      'Removed from Category 2 in Sept 2024 and among the peptides reinstated to Category 1 in 2026. Not FDA-approved.',
    sources: [
      { title: 'CJC-1295 human pharmacokinetics', detail: 'GH/IGF-1 response and half-life characterization.' },
    ],
    reconstituted: true,
  },
  {
    id: 'ghrp-2',
    name: 'GHRP-2',
    epithet: 'The Appetite Amplifier',
    category: 'growth_hormone',
    goals: ['performance', 'recovery'],
    evidence: 'preclinical',
    summary: 'A potent GH secretagogue that also raises appetite and, at higher doses, cortisol and prolactin.',
    about:
      'GHRP-2 is a synthetic ghrelin-receptor agonist that reliably triggers GH release. Its trade-off versus ipamorelin is selectivity: appetite stimulation is pronounced, and cortisol and prolactin can rise.',
    evidenceNote:
      'Well characterized as a GH secretagogue in human pharmacology studies, but the physique and recovery uses rest on preclinical and animal data — no completed efficacy trials.',
    protocol: {
      dose: '100–200 mcg per dose is commonly logged',
      timing: 'Fasted; before bed or pre-workout',
      route: 'Subcutaneous injection',
    },
    safety: 'Appetite increase is the most commonly reported effect — relevant if weight loss is the goal.',
    sources: [
      { title: 'GHRP-2 endocrine pharmacology', detail: 'GH, cortisol and prolactin response characterization.' },
    ],
    reconstituted: true,
  },
  {
    id: 'mk-677',
    name: 'MK-677',
    aka: ['Ibutamoren', 'MK-0677'],
    epithet: 'The Oral Secretagogue',
    category: 'growth_hormone',
    goals: ['performance', 'sleep'],
    evidence: 'human_trials',
    summary: 'An oral, non-peptide ghrelin-receptor agonist with real phase 2 data — and real metabolic signals.',
    about:
      'MK-677 is an orally active compound (not a peptide) that raises GH and IGF-1 by acting on the ghrelin receptor. Merck ran phase 2 trials in the 1990s–2000s but did not pursue registration.',
    evidenceNote:
      'Legitimate phase 2 human data exists showing sustained GH/IGF-1 elevation. It is not FDA-approved for any indication, and the trial record includes increased appetite, fluid retention, and reduced insulin sensitivity — the reasons it is unsuitable for unsupervised use.',
    protocol: {
      dose: '10–25 mg daily is commonly logged',
      timing: 'Once daily, commonly before bed',
      cycle: '8–16 weeks with breaks is commonly logged',
      route: 'Oral',
    },
    safety:
      'Documented in trials: appetite increase, edema, elevated fasting glucose and reduced insulin sensitivity. A congestive-heart-failure trial was stopped early over safety concerns.',
    sources: [
      { title: 'MK-677 phase 2 trials', detail: 'GH/IGF-1 elevation with appetite, edema and glucose signals.' },
      { title: 'MK-677 regulatory status (2026)', detail: 'Not FDA-approved; sold as a research chemical.' },
    ],
  },

  // ------------------------------------------------------------ cognitive
  {
    id: 'semax',
    name: 'Semax',
    epithet: 'The Focus Peptide',
    category: 'cognitive',
    goals: ['cognitive'],
    evidence: 'human_trials',
    summary: 'An ACTH-fragment nootropic approved in Russia, not in the US.',
    about:
      'Semax is a synthetic fragment of ACTH(4-10) developed in Russia, where it is registered for stroke and cognitive indications. Research describes effects on BDNF and attention.',
    evidenceNote:
      'Human studies exist, but largely from Russian clinical literature that has not been replicated to Western regulatory standards. Not FDA-approved; US availability is as a research chemical or compounded preparation.',
    protocol: {
      dose: '250–600 mcg daily is commonly logged',
      timing: 'Morning; intranasal is the common route',
      cycle: '10–14 day courses are commonly logged',
      route: 'Intranasal',
    },
    regulatory: 'Reinstated to Category 1 compounding in 2026. Approved in Russia; not approved in the US.',
    sources: [
      { title: 'Semax — Russian clinical literature', detail: 'Stroke and cognitive indications; limited Western replication.' },
    ],
  },
  {
    id: 'selank',
    name: 'Selank',
    epithet: 'The Calm Regulator',
    category: 'cognitive',
    goals: ['cognitive'],
    evidence: 'human_trials',
    summary: 'A tuftsin-derived anxiolytic peptide from the same Russian research program as Semax.',
    about:
      'Selank is a synthetic analog of the immunopeptide tuftsin, studied for anxiety without the sedation or dependence profile of benzodiazepines.',
    evidenceNote:
      'Russian clinical studies report anxiolytic effects; the evidence has the same replication gap as Semax. Not FDA-approved.',
    protocol: {
      dose: '250–500 mcg daily is commonly logged',
      timing: 'Morning or as needed',
      route: 'Intranasal',
    },
    regulatory: 'Reinstated to Category 1 compounding in 2026. Not FDA-approved.',
    sources: [
      { title: 'Selank anxiolytic studies', detail: 'Russian clinical research on anxiety endpoints.' },
    ],
  },

  // ------------------------------------------------------------ longevity
  {
    id: 'epitalon',
    name: 'Epitalon',
    aka: ['Epithalon', 'Epithalamin'],
    epithet: 'The Telomere Theory',
    category: 'longevity',
    goals: ['longevity'],
    evidence: 'preclinical',
    summary: 'A four-amino-acid peptide studied in Russian research for telomerase and aging markers.',
    about:
      'Epitalon is a synthetic tetrapeptide based on a pineal-gland extract. Interest centers on reports of telomerase activation and effects on melatonin rhythm in animal and early human work from a single research lineage.',
    evidenceNote:
      'Evidence is preclinical plus older Russian studies that have not been independently replicated. Telomerase activation in cell culture is not evidence of extended human healthspan.',
    protocol: {
      dose: '5–10 mg per dose is commonly logged',
      timing: 'Daily during a short course',
      cycle: '10–20 day courses, 1–2× per year, is the commonly logged pattern',
      route: 'Subcutaneous injection',
    },
    regulatory: 'Among the peptides reinstated to Category 1 compounding in 2026. Not FDA-approved.',
    sources: [
      { title: 'Epitalon/epithalamin research program', detail: 'Animal and early human work on aging markers.' },
    ],
    reconstituted: true,
  },
  {
    id: 'thymosin-alpha-1',
    name: 'Thymosin alpha-1',
    aka: ['Tα1', 'Thymalfasin', 'Zadaxin'],
    epithet: 'The Immune Modulator',
    category: 'immune',
    goals: ['immune', 'longevity'],
    evidence: 'human_trials',
    summary: 'Approved in ~35 countries for hepatitis B and C — not approved in the US.',
    about:
      'Thymosin alpha-1 is a peptide produced by the thymus that modulates T-cell function. As thymalfasin (Zadaxin) it is an approved medicine in many countries, and it was studied during COVID-19 for immune modulation.',
    evidenceNote:
      'Real human trial evidence and approvals outside the US, primarily for chronic hepatitis B and C and as a vaccine adjuvant. Not FDA-approved in the United States.',
    protocol: {
      dose: '1.6 mg per dose is commonly logged',
      timing: 'Twice weekly is the commonly logged pattern',
      cycle: '4–12 weeks',
      route: 'Subcutaneous injection',
    },
    regulatory: 'Among the peptides reinstated to Category 1 compounding in 2026. Approved abroad, not in the US.',
    sources: [
      { title: 'Zadaxin (thymalfasin) international approvals', detail: 'Approved for chronic hepatitis B/C in ~35 countries.' },
      { title: 'Thymosin alpha-1 immune-modulation trials', detail: 'Human studies in hepatitis and critical illness.' },
    ],
    reconstituted: true,
  },
  {
    id: 'mots-c',
    name: 'MOTS-c',
    epithet: 'The Mitochondrial Signal',
    category: 'longevity',
    goals: ['longevity', 'performance'],
    evidence: 'preclinical',
    summary: 'A mitochondria-derived peptide studied in animals for metabolic and exercise-capacity effects.',
    about:
      'MOTS-c is encoded in mitochondrial DNA and acts as a signaling peptide affecting metabolic homeostasis, insulin sensitivity and exercise capacity in rodent models.',
    evidenceNote:
      'Animal and mechanistic data; human trials have not established efficacy. Observational human work has looked at MOTS-c levels and aging, which is correlation, not an effect of supplementation.',
    protocol: {
      dose: '5–10 mg per week is commonly logged',
      timing: 'Often split across the week',
      cycle: '4–6 weeks',
      route: 'Subcutaneous injection',
    },
    regulatory: 'Among the peptides reinstated to Category 1 compounding in 2026. Not FDA-approved.',
    sources: [
      { title: 'MOTS-c in metabolic regulation', detail: 'Rodent studies on insulin sensitivity and exercise capacity.' },
    ],
    reconstituted: true,
  },
  {
    id: 'glutathione',
    name: 'Glutathione',
    epithet: 'The Master Antioxidant',
    category: 'longevity',
    goals: ['longevity', 'immune'],
    evidence: 'human_trials',
    summary: 'The body’s principal antioxidant tripeptide; supplementation evidence is mixed by route.',
    about:
      'Glutathione is a tripeptide (glutamate-cysteine-glycine) central to cellular antioxidant defense and detoxification. It is depleted in many disease states, which is the rationale for supplementing it.',
    evidenceNote:
      'Human studies exist but results depend heavily on route — oral bioavailability is poor, and IV/nebulized use is where most clinical study sits. Skin-lightening marketing outpaces the evidence.',
    protocol: {
      dose: 'Varies widely by route',
      timing: 'Commonly logged with a compounded protocol',
      route: 'IV, subcutaneous, oral or liposomal',
    },
    sources: [
      { title: 'Glutathione supplementation bioavailability studies', detail: 'Route-dependent absorption findings.' },
    ],
  },

  // -------------------------------------------------------- sexual health
  {
    id: 'pt-141',
    name: 'PT-141',
    aka: ['Bremelanotide', 'Vyleesi'],
    epithet: 'The Desire Pathway',
    category: 'sexual_health',
    goals: ['performance'],
    evidence: 'fda_approved',
    summary: 'Approved as Vyleesi for hypoactive sexual desire disorder in premenopausal women.',
    about:
      'Bremelanotide is a melanocortin-receptor agonist that acts on central desire pathways rather than blood flow — a different mechanism from PDE5 inhibitors like sildenafil.',
    evidenceNote:
      'FDA-approved in 2019 as Vyleesi for acquired, generalized HSDD in premenopausal women, based on completed randomized trials. Research-chemical "PT-141" is the same core compound but is not the approved product and is marketed for uses the FDA never reviewed.',
    protocol: {
      dose: '1.75 mg is the approved Vyleesi dose',
      timing: 'As needed, ~45 minutes before anticipated activity',
      route: 'Subcutaneous autoinjector',
    },
    safety:
      'Nausea is the most common effect in trials; transient blood-pressure increases mean it is not for uncontrolled hypertension or cardiovascular disease.',
    sources: [
      { title: 'Vyleesi (bremelanotide) FDA prescribing information', detail: 'Approved indication, dose, warnings.' },
      { title: 'RECONNECT trials', detail: 'Randomized data supporting the HSDD approval.' },
    ],
  },

  // ------------------------------------------------------------------ skin
  {
    id: 'ghk-cu',
    name: 'GHK-Cu',
    aka: ['Copper peptide', 'Copper tripeptide-1'],
    epithet: 'The Skin Signal',
    category: 'skin',
    goals: ['skin', 'recovery'],
    evidence: 'human_trials',
    summary: 'A copper-binding tripeptide with real topical cosmetic data — injectable use is unstudied.',
    about:
      'GHK-Cu is a naturally occurring copper-binding tripeptide whose levels decline with age. It is a long-standing cosmetic ingredient, studied topically for skin firmness, wrinkles and wound healing.',
    evidenceNote:
      'Topical formulations have human cosmetic-endpoint studies behind them. Injected use for systemic "anti-aging" is not supported by those studies and has no completed trials.',
    protocol: {
      dose: 'Topical formulations vary; injected use is commonly logged at 1–2 mg',
      timing: 'Topical: daily. Injected: commonly logged before bed',
      route: 'Topical (studied) or subcutaneous injection (unstudied)',
    },
    safety: 'Injection-site irritation is commonly reported with subcutaneous use.',
    regulatory: 'Among the peptides reinstated to Category 1 compounding in 2026. Not an FDA-approved drug.',
    sources: [
      { title: 'GHK-Cu topical skin studies', detail: 'Human cosmetic-endpoint data for firmness and wrinkle measures.' },
    ],
    reconstituted: true,
  },
  {
    id: 'melanotan-2',
    name: 'Melanotan II',
    aka: ['MT-2'],
    epithet: 'The Tanning Peptide',
    category: 'skin',
    goals: ['skin'],
    evidence: 'community',
    summary: 'A melanocortin agonist used for tanning, with documented case-report harms.',
    about:
      'Melanotan II is a non-selective melanocortin-receptor agonist that increases melanin production. It is widely sold for cosmetic tanning and is not an approved medicine anywhere.',
    evidenceNote:
      'No approved indication and no completed efficacy trials for cosmetic use. The published human literature is largely case reports — including changes in mole appearance, and reports of melanoma diagnosed after use.',
    safety:
      'Case reports document new and changing moles, and melanoma diagnoses following use. Nausea and flushing are common. Regulators in several countries have issued consumer warnings.',
    protocol: { route: 'Subcutaneous injection' },
    sources: [
      { title: 'Melanotan case reports — pigmented lesions', detail: 'Dermatology literature on mole changes and melanoma reports.' },
      { title: 'National regulator consumer warnings', detail: 'Advisories against unapproved tanning injections.' },
    ],
    reconstituted: true,
  },
];

export const LIBRARY_STACKS: LibraryStack[] = [
  {
    id: 'wolverine',
    name: 'Wolverine',
    tagline: 'BPC-157 + TB-500',
    entryIds: ['bpc-157', 'tb-500'],
    rationale:
      'The most commonly discussed recovery pairing in athlete communities — the two are combined on the theory that they act on different repair pathways. Both are preclinical: no human trial supports the combination.',
    goals: ['recovery'],
  },
  {
    id: 'gh-support',
    name: 'GH support',
    tagline: 'Ipamorelin + CJC-1295',
    entryIds: ['ipamorelin', 'cjc-1295'],
    rationale:
      'A GHRH analog plus a ghrelin-receptor agonist, paired because they act on two different receptors in the GH axis. Commonly logged before bed and fasted. Neither is FDA-approved.',
    goals: ['recovery', 'sleep', 'performance'],
  },
  {
    id: 'gut-repair',
    name: 'Gut focus',
    tagline: 'BPC-157 + KPV',
    entryIds: ['bpc-157', 'kpv'],
    rationale:
      'Both have gut-focused animal data — BPC-157 for mucosal healing, KPV for inflammatory signalling. Combined by users targeting GI symptoms; evidence for both is preclinical.',
    goals: ['recovery'],
  },
  {
    id: 'glp1-standard',
    name: 'The approved path',
    tagline: 'Semaglutide or Tirzepatide',
    entryIds: ['semaglutide', 'tirzepatide'],
    rationale:
      'Not a stack — the two FDA-approved options for weight management, side by side, so the trial evidence is easy to compare before a prescriber conversation.',
    goals: ['weight_loss'],
  },
];

export function entryById(id: string): LibraryEntry | null {
  return LIBRARY_ENTRIES.find((entry) => entry.id === id) ?? null;
}
