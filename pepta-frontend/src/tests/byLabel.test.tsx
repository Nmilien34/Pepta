// The guard has to be able to fail, or it is decoration. These render a
// deliberate duplicate and assert it is caught.

import React from "react";
import { describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

vi.mock("react-native", () => {
  const passthrough = (name: string) =>
    Object.assign(
      ({ children, ...props }: { children?: React.ReactNode }) =>
        React.createElement(name, props, children),
      { displayName: name },
    );
  return { Pressable: passthrough("Pressable"), View: passthrough("View") };
});

import { Pressable, View } from "react-native";
import { all, duplicateLabels, maybeOne, one } from "./byLabel";

function render(labels: string[]) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <View>
        {labels.map((label, i) => (
          <Pressable key={i} accessibilityLabel={label} />
        ))}
      </View>,
    );
  });
  return tree;
}

describe("one", () => {
  it("returns the single match", () => {
    expect(one(render(["Save", "Delete"]), "Save")).toBeDefined();
  });

  it("THROWS on a duplicate rather than picking the first", () => {
    // The exact failure this exists to catch.
    expect(() => one(render(["Remove X", "Remove X"]), "Remove X")).toThrow(/share the label/);
  });

  it("names the label in the error, so the fix is obvious", () => {
    expect(() => one(render(["Edit", "Edit"]), "Edit")).toThrow(/"Edit"/);
  });

  it("throws when there is none, rather than returning undefined", () => {
    expect(() => one(render(["Save"]), "Nope")).toThrow(/No Pressable/);
  });
});

describe("maybeOne", () => {
  it("returns undefined for an absent label — a real assertion", () => {
    expect(maybeOne(render(["Save"]), "Nope")).toBeUndefined();
  });

  it("still throws on a duplicate, so absence tests cannot go green wrongly", () => {
    expect(() => maybeOne(render(["Remove X", "Remove X"]), "Remove X")).toThrow(/distinct labels/);
  });
});

describe("duplicateLabels", () => {
  it("is empty on a clean screen", () => {
    expect(duplicateLabels(render(["Save", "Delete", "Edit"]))).toEqual([]);
  });

  it("reports every label that more than one control answers to", () => {
    expect(duplicateLabels(render(["Save", "Save", "Edit", "Edit", "Delete"])).sort()).toEqual([
      "Edit",
      "Save",
    ]);
  });

  it("ignores controls with no label rather than grouping them together", () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <View>
          <Pressable />
          <Pressable />
        </View>,
      );
    });
    expect(duplicateLabels(tree)).toEqual([]);
  });
});

describe("all", () => {
  it("returns every match, for the rare case a duplicate is intended", () => {
    expect(all(render(["Row", "Row", "Other"]), "Row")).toHaveLength(2);
  });
});
