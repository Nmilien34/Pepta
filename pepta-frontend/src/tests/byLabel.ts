// Finding a control by its accessibility label — and refusing to guess.
//
// WHY THIS EXISTS. A screen test that looks up a Pressable by label and takes
// the first match will happily pass against the WRONG control when two share a
// label. That happened on Favourites: swipe-to-remove and the Edit remove both
// answered to "Remove X from favourites", and a test asserting the Edit
// control was absent went green against the swipe one. A false green is worse
// than a failure, because nothing ever tells you.
//
// So ambiguity throws. That is not only a test concern: two controls with one
// label is a real accessibility defect, because a screen reader announces the
// same phrase for two different actions and the user cannot tell them apart.
// Making it loud in tests is the cheapest place to catch it.

import type { ReactTestInstance } from 'react-test-renderer';

export interface LabelQuery {
  root: ReactTestInstance;
}

/** `type: null` matches any node type — some screens label a non-Pressable. */
function matches(node: ReactTestInstance, type: string | null, label: string): boolean {
  if (type !== null && String(node.type) !== type) return false;
  return node.props.accessibilityLabel === label;
}

/**
 * Every node of `type` carrying exactly this label. Use when a duplicate is
 * genuinely expected; prefer `one` everywhere else.
 */
export function all(
  tree: LabelQuery,
  label: string,
  type: string | null = 'Pressable',
): ReactTestInstance[] {
  const found = tree.root.findAll((n) => matches(n, type, label));
  if (type !== null) return found;

  // ONE CONTROL, COUNTED ONCE. With no type filter, react-test-renderer
  // returns both the composite (<Pressable/>) and the host element it renders
  // — same props, same label, one actual control. Counting them as two would
  // make every unfiltered lookup report a phantom duplicate.
  //
  // Host elements have a string type. Prefer those; fall back to the whole set
  // for a label that only ever sits on a composite.
  const hosts = found.filter((n) => typeof n.type === 'string');
  return hosts.length > 0 ? hosts : found;
}

/**
 * The single control with this label.
 *
 * Throws when two share it — naming the label, because the fix is almost
 * always to distinguish them rather than to loosen the query.
 */
export function one(
  tree: LabelQuery,
  label: string,
  type: string | null = 'Pressable',
): ReactTestInstance {
  const found = all(tree, label, type);
  if (found.length === 0) {
    throw new Error(`No ${type ?? 'node'} labelled "${label}"`);
  }
  if (found.length > 1) {
    throw new Error(
      `${found.length} ${type ?? 'node'}s share the label "${label}" — a screen reader ` +
        `cannot tell them apart, and a test looking one up would silently ` +
        `match whichever comes first. Give them distinct labels.`,
    );
  }
  return found[0]!;
}

/** The single control, or undefined when there is none. Still throws on two. */
export function maybeOne(
  tree: LabelQuery,
  label: string,
  type: string | null = 'Pressable',
): ReactTestInstance | undefined {
  const found = all(tree, label, type);
  if (found.length > 1) {
    throw new Error(
      `${found.length} ${type ?? 'node'}s share the label "${label}" — give them distinct labels.`,
    );
  }
  return found[0];
}

/**
 * Every accessibility label on screen that more than one control answers to.
 * Run this over a rendered screen to catch the defect wholesale rather than
 * one lookup at a time.
 */
export function duplicateLabels(
  tree: LabelQuery,
  type: string | null = 'Pressable',
): string[] {
  const labels = new Set<string>();
  for (const node of tree.root.findAll((n) => type === null || String(n.type) === type)) {
    const label = node.props.accessibilityLabel;
    if (typeof label === 'string' && label.length > 0) labels.add(label);
  }
  // Counted through `all`, so the composite/host pair is one control here too
  // — otherwise this reports a phantom duplicate for every labelled control.
  return [...labels].filter((label) => all(tree, label, type).length > 1);
}

/**
 * The single control with this label that also satisfies `extra` — for screens
 * whose helpers additionally filter on accessibilityRole or on onPress being
 * wired.
 *
 * Still refuses to guess: two survivors throw, for the same reason as `one`.
 */
export function oneWhere(
  tree: LabelQuery,
  label: string,
  extra: (node: ReactTestInstance) => boolean,
  type: string | null = null,
): ReactTestInstance {
  const found = all(tree, label, type).filter(extra);
  if (found.length === 0) {
    throw new Error(`No node labelled "${label}" matching the extra filter`);
  }
  if (found.length > 1) {
    throw new Error(
      `${found.length} nodes share the label "${label}" and pass the same ` +
        `filter — give them distinct labels.`,
    );
  }
  return found[0]!;
}
