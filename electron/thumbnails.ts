import { app, nativeImage } from "electron";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ThumbnailRequest } from "../src/types";
import { readDeviceFile, runAdb, runCommand } from "./adb";

const MAX_REMOTE_IMAGE_SIZE = 48 * 1024 * 1024;
const MAX_REMOTE_VIDEO_SIZE = 48 * 1024 * 1024;

function cachePathFor(request: ThumbnailRequest): string {
  const key = createHash("sha256")
    .update(
      `${request.side}:${request.serial ?? ""}:${request.path}:${request.modifiedAt ?? 0}`,
    )
    .digest("hex");
  return path.join(app.getPath("userData"), "thumbs", `${key}.png`);
}

async function imageToThumbnail(buffer: Buffer): Promise<Buffer | null> {
  const image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) return null;
  return image
    .resize({
      width: 160,
      height: 160,
      quality: "good",
    })
    .toPNG();
}

async function quickLookThumbnail(sourcePath: string): Promise<Buffer | null> {
  const outputDirectory = await fs.mkdtemp(
    path.join(app.getPath("temp"), "bridge-preview-"),
  );
  try {
    await runCommand(
      "/usr/bin/qlmanage",
      ["-t", "-s", "240", "-o", outputDirectory, sourcePath],
      { timeoutMs: 60_000, maxBytes: 2 * 1024 * 1024 },
    );
    const generated = (await fs.readdir(outputDirectory)).find((name) =>
      name.endsWith(".png"),
    );
    if (!generated) return null;
    return imageToThumbnail(await fs.readFile(path.join(outputDirectory, generated)));
  } finally {
    await fs.rm(outputDirectory, { recursive: true, force: true });
  }
}

export async function getThumbnail(
  request: ThumbnailRequest,
): Promise<string | null> {
  if (request.kind !== "image" && request.kind !== "video") return null;
  const cachePath = cachePathFor(request);
  await fs.mkdir(path.dirname(cachePath), { recursive: true });

  try {
    const cached = await fs.readFile(cachePath);
    return `data:image/png;base64,${cached.toString("base64")}`;
  } catch {
    // Generate and cache it below.
  }

  let thumbnail: Buffer | null = null;
  if (request.side === "local") {
    if (request.kind === "image") {
      try {
        const image = await nativeImage.createThumbnailFromPath(request.path, {
          width: 160,
          height: 160,
        });
        thumbnail = image.isEmpty() ? null : image.toPNG();
      } catch {
        thumbnail = null;
      }
    } else {
      thumbnail = await quickLookThumbnail(request.path);
    }
  } else {
    if (!request.serial) return null;
    if (
      request.kind === "image" &&
      (request.size ?? 0) <= MAX_REMOTE_IMAGE_SIZE
    ) {
      const buffer = await readDeviceFile(
        request.serial,
        request.path,
        MAX_REMOTE_IMAGE_SIZE,
      );
      thumbnail = await imageToThumbnail(buffer);
    } else if (
      request.kind === "video" &&
      (request.size ?? 0) <= MAX_REMOTE_VIDEO_SIZE
    ) {
      const tempDirectory = await fs.mkdtemp(
        path.join(app.getPath("temp"), "bridge-video-"),
      );
      const localVideo = path.join(tempDirectory, path.posix.basename(request.path));
      try {
        await runAdb(
          request.serial,
          ["pull", request.path, localVideo],
          { timeoutMs: 5 * 60_000 },
        );
        thumbnail = await quickLookThumbnail(localVideo);
      } finally {
        await fs.rm(tempDirectory, { recursive: true, force: true });
      }
    }
  }

  if (!thumbnail) return null;
  await fs.writeFile(cachePath, thumbnail);
  return `data:image/png;base64,${thumbnail.toString("base64")}`;
}
