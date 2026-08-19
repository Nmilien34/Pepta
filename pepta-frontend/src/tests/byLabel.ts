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

function matches(node: ReactTestInstance, type: string, label: string): boolean {
  return String(node.type) === type && node.props.accessibilityLabel === label;
}

/**
 * Every node of `type` carrying exactly this label. Use when a duplicate is
 * genuinely expected; prefer `one` everywhere else.
 */
export function all(
  tree: LabelQuery,
  label: string,
  type = 'Pressable',
): ReactTestInstance[] {
  return tree.root.findAll((n) => matches(n, type, label));
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
  type = 'Pressable',
): ReactTestInstance {
  const found = all(tree, label, type);
  if (found.length === 0) {
    throw new Error(`No ${type} labelled "${label}"`);
  }
  if (found.length > 1) {
    throw new Error(
      `${found.length} ${type}s share the label "${label}" — a screen reader ` +
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
  type = 'Pressable',
): ReactTestInstance | undefined {
  const found = all(tree, label, type);
  if (found.length > 1) {
    throw new Error(
      `${found.length} ${type}s share the label "${label}" — give them distinct labels.`,
    );
  }
  return found[0];
}

/**
 * Every accessibility label on screen that more than one control answers to.
 * Run this over a rendered screen to catch the defect wholesale rather than
 * one lookup at a time.
 */
export function duplicateLabels(tree: LabelQuery, type = 'Pressable'): string[] {
  const seen = new Map<string, number>();
  for (const node of tree.root.findAll((n) => String(n.type) === type)) {
    const label = node.props.accessibilityLabel;
    if (typeof label !== 'string' || label.length === 0) continue;
    seen.set(label, (seen.get(label) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([label]) => label);
}
