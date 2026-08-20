// The photo half of "Add your own".
//
// The rule under test is that the photo is OPTIONAL EVERYWHERE: a refused
// permission, a cancelled picker and a failed upload must all still leave a
// saveable item, because the alternative is throwing away everything the user
// typed over a picture they did not have to add.

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewItemSheet } from "./NewItemSheet";
import { one } from "../tests/byLabel";
import * as ImagePicker from "expo-image-picker";
import { api } from "../services/api";

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Image: "Image",
  Modal: "Modal",
  Pressable: "Pressable",
  TextInput: "TextInput",
  View: "View",
}));

vi.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
}));

vi.mock("expo-haptics", () => ({ selectionAsync: vi.fn(() => Promise.resolve()) }));

vi.mock("../services/api", () => ({
  api: {
    uploadMediaPhoto: vi.fn(),
    discardMedia: vi.fn(),
  },
}));

vi.mock("./index", () => ({
  AppText: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("AppText", null, children),
  Button: (props: { label: string; onPress: () => void; disabled?: boolean }) =>
    React.createElement("Button", props),
}));

vi.mock("../theme", () => ({
  useTheme: () => ({
    colors: {
      surface: "#fff",
      surfaceAlt: "#eee",
      textPrimary: "#000",
      textSecondary: "#666",
      textTertiary: "#999",
    },
  }),
}));

const picker = vi.mocked(ImagePicker);
const apiMock = vi.mocked(api);

const onSave = vi.fn();
const MEDIA_A = "507f1f77bcf86cd799439011";
const MEDIA_B = "507f1f77bcf86cd799439012";

async function render(initialKind: "food" | "drink" = "food") {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <NewItemSheet visible initialKind={initialKind} onCancel={vi.fn()} onSave={onSave} />,
    );
  });
  return tree;
}

const field = (tree: TestRenderer.ReactTestRenderer, label: string) =>
  one(tree, label, "TextInput");

/** Fills in the minimum a food needs, so only the photo is ever in question. */
async function fillFood(tree: TestRenderer.ReactTestRenderer) {
  await act(async () => {
    field(tree, "Name").props.onChangeText("Desk lunch");
    field(tree, "How much one is").props.onChangeText("1 box");
    field(tree, "Protein (g)").props.onChangeText("30");
  });
}

const saveButton = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root.findAll((n) => String(n.type) === "Button")[0]!;

const texts = (tree: TestRenderer.ReactTestRenderer): string => {
  const out: string[] = [];
  const walk = (n: TestRenderer.ReactTestInstance) => {
    for (const c of n.children) {
      if (typeof c === "string") out.push(c);
      else walk(c);
    }
  };
  walk(tree.root);
  return out.join("|");
};

beforeEach(() => {
  vi.clearAllMocks();
  picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true } as never);
  picker.launchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri: "file:///tmp/a.jpg", mimeType: "image/jpeg" }],
  } as never);
  apiMock.uploadMediaPhoto.mockResolvedValue({
    mediaId: MEDIA_A,
    status: "ready",
  } as never);
  apiMock.discardMedia.mockResolvedValue(undefined as never);
});

/** Second and later picks land on distinct media ids, as the server's would. */
function pickReturns(uri: string, mediaId: string) {
  picker.launchImageLibraryAsync.mockResolvedValue({
    canceled: false,
    assets: [{ uri, mimeType: "image/jpeg" }],
  } as never);
  apiMock.uploadMediaPhoto.mockResolvedValue({
    mediaId,
    status: "ready",
  } as never);
}

const hide = async (tree: TestRenderer.ReactTestRenderer) => {
  await act(async () => {
    tree.update(
      <NewItemSheet visible={false} initialKind="food" onCancel={vi.fn()} onSave={onSave} />,
    );
  });
};

describe("attaching a photo to an item the user typed", () => {
  it("uploads what was picked and saves only the opaque media id", async () => {
    const tree = await render();
    await fillFood(tree);
    await act(async () => {
      one(tree, "Add a photo").props.onPress();
    });

    expect(apiMock.uploadMediaPhoto).toHaveBeenCalledWith({
      intent: "favourite_photo",
      uri: "file:///tmp/a.jpg",
      contentType: "image/jpeg",
    });

    await act(async () => {
      saveButton(tree).props.onPress();
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ photoMediaId: MEDIA_A, photoUri: "file:///tmp/a.jpg" }),
    );
    expect(onSave.mock.calls[0]![0]).not.toHaveProperty("photoS3Key");
  });

  it("shows the local file immediately, without waiting on the round trip", async () => {
    const tree = await render();
    await act(async () => {
      one(tree, "Add a photo").props.onPress();
    });
    const imgs = tree.root.findAll((n) => String(n.type) === "Image");
    expect(imgs.some((i) => (i.props.source as { uri?: string })?.uri === "file:///tmp/a.jpg")).toBe(true);
    // And the control now offers to replace it rather than add a second one.
    expect(one(tree, "Change the photo")).toBeTruthy();
  });

  it("passes the picked type through, so a PNG is not stored as a JPEG", async () => {
    picker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/a.png", mimeType: "image/png" }],
    } as never);
    const tree = await render();
    await act(async () => {
      one(tree, "Add a photo").props.onPress();
    });
    expect(apiMock.uploadMediaPhoto).toHaveBeenCalledWith({
      intent: "favourite_photo",
      uri: "file:///tmp/a.png",
      contentType: "image/png",
    });
  });

  it("passes HEIC through for server-side normalization", async () => {
    picker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/a.heic", mimeType: "image/heic" }],
    } as never);
    const tree = await render();
    await act(async () => {
      one(tree, "Add a photo").props.onPress();
    });
    expect(apiMock.uploadMediaPhoto).toHaveBeenCalledWith({
      intent: "favourite_photo",
      uri: "file:///tmp/a.heic",
      contentType: "image/heic",
    });
  });

  it("still saves the item when the upload fails, minus the photo", async () => {
    apiMock.uploadMediaPhoto.mockRejectedValue(new Error("network"));
    const tree = await render();
    await fillFood(tree);
    await act(async () => {
      one(tree, "Add a photo").props.onPress();
    });

    expect(texts(tree)).toMatch(/did not upload/i);
    expect(saveButton(tree).props.disabled).toBe(false);
    await act(async () => {
      saveButton(tree).props.onPress();
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.not.objectContaining({ photoMediaId: expect.anything() }),
    );
  });

  it("says so and uploads nothing when photo access is refused", async () => {
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: false } as never);
    const tree = await render();
    await fillFood(tree);
    await act(async () => {
      one(tree, "Add a photo").props.onPress();
    });

    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
    expect(texts(tree)).toMatch(/photos access/i);
    expect(saveButton(tree).props.disabled).toBe(false);
  });

  it("does nothing at all when the picker is cancelled", async () => {
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null } as never);
    const tree = await render();
    await act(async () => {
      one(tree, "Add a photo").props.onPress();
    });
    expect(apiMock.uploadMediaPhoto).not.toHaveBeenCalled();
    expect(tree.root.findAll((n) => String(n.type) === "Image")).toHaveLength(0);
  });

  it("is offered on a drink too — the vessel drawing is a fallback, not the rule", async () => {
    const tree = await render("drink");
    expect(one(tree, "Add a photo")).toBeTruthy();
  });

  it("clears the last item's photo when the sheet is reopened", async () => {
    const tree = await render();
    await act(async () => {
      one(tree, "Add a photo").props.onPress();
    });
    await act(async () => {
      tree.update(
        <NewItemSheet visible={false} initialKind="food" onCancel={vi.fn()} onSave={onSave} />,
      );
    });
    await act(async () => {
      tree.update(<NewItemSheet visible initialKind="food" onCancel={vi.fn()} onSave={onSave} />);
    });
    expect(tree.root.findAll((n) => String(n.type) === "Image")).toHaveLength(0);
    expect(one(tree, "Add a photo")).toBeTruthy();
  });
});

describe("photos that end up attached to nothing", () => {
  it("throws away the one it replaced when a second is picked", async () => {
    const tree = await render();
    await act(async () => {
      one(tree, "Add a photo").props.onPress();
    });

    pickReturns("file:///tmp/b.jpg", MEDIA_B);
    await act(async () => {
      one(tree, "Change the photo").props.onPress();
    });

    expect(apiMock.discardMedia).toHaveBeenCalledWith(MEDIA_A);
    expect(apiMock.discardMedia).not.toHaveBeenCalledWith(MEDIA_B);
  });

  it("keeps the previous confirmed photo when its replacement upload fails", async () => {
    const tree = await render();
    await fillFood(tree);
    await act(async () => {
      one(tree, "Add a photo").props.onPress();
    });

    picker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///tmp/b.jpg", mimeType: "image/jpeg" }],
    } as never);
    apiMock.uploadMediaPhoto.mockRejectedValueOnce(new Error("network"));
    await act(async () => {
      one(tree, "Change the photo").props.onPress();
    });

    expect(apiMock.discardMedia).not.toHaveBeenCalledWith(MEDIA_A);
    await act(async () => {
      saveButton(tree).props.onPress();
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        photoMediaId: MEDIA_A,
        photoUri: "file:///tmp/a.jpg",
      }),
    );
  });

  it("throws away the pending one when the sheet closes unsaved", async () => {
    const tree = await render();
    await act(async () => {
      one(tree, "Add a photo").props.onPress();
    });
    await hide(tree);

    expect(apiMock.discardMedia).toHaveBeenCalledWith(MEDIA_A);
  });

  it("keeps the photo of an item that was actually saved", async () => {
    const tree = await render();
    await fillFood(tree);
    await act(async () => {
      one(tree, "Add a photo").props.onPress();
    });
    await act(async () => {
      saveButton(tree).props.onPress();
    });
    await hide(tree);

    expect(onSave).toHaveBeenCalled();
    expect(apiMock.discardMedia).not.toHaveBeenCalled();
  });

  it("throws away only the last one when several were picked and none saved", async () => {
    const tree = await render();
    await act(async () => {
      one(tree, "Add a photo").props.onPress();
    });
    pickReturns("file:///tmp/b.jpg", MEDIA_B);
    await act(async () => {
      one(tree, "Change the photo").props.onPress();
    });
    await hide(tree);

    expect(apiMock.discardMedia.mock.calls.map((c) => c[0])).toEqual([
      MEDIA_A,
      MEDIA_B,
    ]);
  });

  it("throws away the pending one when the screen unmounts under it", async () => {
    const tree = await render();
    await act(async () => {
      one(tree, "Add a photo").props.onPress();
    });
    await act(async () => {
      tree.unmount();
    });

    expect(apiMock.discardMedia).toHaveBeenCalledWith(MEDIA_A);
  });

  it("discards nothing when no photo was ever picked", async () => {
    const tree = await render();
    await fillFood(tree);
    await hide(tree);
    expect(apiMock.discardMedia).not.toHaveBeenCalled();
  });

  it("discards nothing when the upload never landed a key", async () => {
    apiMock.uploadMediaPhoto.mockRejectedValue(new Error("network"));
    const tree = await render();
    await act(async () => {
      one(tree, "Add a photo").props.onPress();
    });
    await hide(tree);
    expect(apiMock.discardMedia).not.toHaveBeenCalled();
  });

  it("survives a cleanup that fails — it is housekeeping, not the user's problem", async () => {
    apiMock.discardMedia.mockRejectedValue(new Error("s3 down"));
    const tree = await render();
    await act(async () => {
      one(tree, "Add a photo").props.onPress();
    });
    await expect(hide(tree)).resolves.toBeUndefined();
  });
});
