import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const mocks = vi.hoisted(() => ({
  createPresignedPost: vi.fn(),
}));

vi.mock("@aws-sdk/s3-presigned-post", () => ({
  createPresignedPost: mocks.createPresignedPost,
}));

vi.mock("../../config/env", () => ({
  env: {
    aws: {
      region: "us-east-1",
      bucketName: "private-pepta-test",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    },
  },
}));

import {
  createPresignedPostUpload,
  getS3ObjectBytes,
  headS3Object,
  putS3Object,
} from "../../services/s3.service";

const send = vi.spyOn(S3Client.prototype, "send");

describe("S3 media upload policy", () => {
  beforeEach(() => {
    send.mockReset();
    mocks.createPresignedPost.mockReset().mockResolvedValue({
      url: "https://private-pepta-test.s3.amazonaws.com",
      fields: { key: "generated-key" },
    });
  });

  it("pins the object key, type, encryption, and byte range", async () => {
    const result = await createPresignedPostUpload({
      key: "pepta/media-staging/user/media.png",
      contentType: "image/png",
      maxBytes: 5 * 1024 * 1024,
    });

    expect(mocks.createPresignedPost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        Bucket: "private-pepta-test",
        Key: "pepta/media-staging/user/media.png",
        Expires: 10 * 60,
        Fields: {
          key: "pepta/media-staging/user/media.png",
          "Content-Type": "image/png",
          "x-amz-server-side-encryption": "AES256",
        },
        Conditions: [
          ["content-length-range", 1, 5 * 1024 * 1024],
          { key: "pepta/media-staging/user/media.png" },
          { "Content-Type": "image/png" },
          { "x-amz-server-side-encryption": "AES256" },
        ],
      }),
    );
    expect(result).toEqual({
      uploadUrl: "https://private-pepta-test.s3.amazonaws.com",
      fields: { key: "generated-key" },
    });
  });

  it("heads the generated private object and returns measured metadata", async () => {
    send.mockResolvedValueOnce({
      ContentType: "image/png",
      ContentLength: 2048,
    } as never);

    await expect(headS3Object("pepta/media-staging/user/media.png")).resolves.toEqual({
      contentType: "image/png",
      contentLength: 2048,
    });
    const command = send.mock.calls[0]![0];
    expect(command).toBeInstanceOf(HeadObjectCommand);
    expect((command as HeadObjectCommand).input).toEqual({
      Bucket: "private-pepta-test",
      Key: "pepta/media-staging/user/media.png",
    });
  });

  it("downloads object bytes through the SDK byte transformer", async () => {
    const transformToByteArray = vi.fn().mockResolvedValue(Uint8Array.of(1, 2, 3));
    send.mockResolvedValueOnce({ Body: { transformToByteArray } } as never);

    await expect(getS3ObjectBytes("pepta/media-staging/user/media.png")).resolves.toEqual(
      Uint8Array.of(1, 2, 3),
    );
    expect(send.mock.calls[0]![0]).toBeInstanceOf(GetObjectCommand);
  });

  it("writes canonical objects with explicit AES256 encryption", async () => {
    send.mockResolvedValueOnce({} as never);

    await putS3Object({
      key: "pepta/media/user/media.jpg",
      body: Uint8Array.of(1, 2, 3),
      contentType: "image/jpeg",
    });

    const command = send.mock.calls[0]![0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect((command as PutObjectCommand).input.ServerSideEncryption).toBe("AES256");
  });
});
