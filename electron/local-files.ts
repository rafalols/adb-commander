import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { DirectoryListing, FileEntry } from "../src/types";
import { kindFromName, type ManifestEntry } from "./adb";

function extensionOf(name: string): string {
  return path.extname(name).slice(1).toLowerCase();
}

export async function listLocalDirectory(
  requestedPath = homedir(),
): Promise<DirectoryListing> {
  const localPath = path.resolve(requestedPath);
  const directoryEntries = await fs.readdir(localPath, { withFileTypes: true });
  const entries = (
    await Promise.all(
      directoryEntries.map(async (entry): Promise<FileEntry | null> => {
        const entryPath = path.join(localPath, entry.name);
        try {
          const stats = await fs.stat(entryPath);
          return {
            id: `local:${entryPath}`,
            name: entry.name,
            path: entryPath,
            kind: kindFromName(entry.name, stats.isDirectory()),
            extension: extensionOf(entry.name),
            size: stats.isDirectory() ? 0 : stats.size,
            modifiedAt: stats.mtimeMs,
            hidden: entry.name.startsWith("."),
          };
        } catch {
          return null;
        }
      }),
    )
  ).filter((entry): entry is FileEntry => entry !== null);

  let totalBytes: number | undefined;
  let freeBytes: number | undefined;
  try {
    const storage = await fs.statfs(localPath);
    totalBytes = storage.blocks * storage.bsize;
    freeBytes = storage.bavail * storage.bsize;
  } catch {
    // Storage usage is supplementary; listing should still work.
  }

  return {
    path: localPath,
    parent: path.dirname(localPath) === localPath ? null : path.dirname(localPath),
    homePath: homedir(),
    entries,
    totalBytes,
    freeBytes,
  };
}

export async function getLocalManifest(
  root: string,
): Promise<ManifestEntry[]> {
  const manifest: ManifestEntry[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      const relativePath = path.relative(root, absolutePath);
      if (entry.isSymbolicLink()) continue;
      const stats = await fs.stat(absolutePath);
      if (entry.isDirectory()) {
        manifest.push({
          relativePath,
          kind: "directory",
          size: 0,
          modifiedAt: stats.mtimeMs,
        });
        await walk(absolutePath);
      } else if (entry.isFile()) {
        manifest.push({
          relativePath,
          kind: "file",
          size: stats.size,
          modifiedAt: stats.mtimeMs,
        });
      }
    }
  }

  await walk(root);
  return manifest;
}

export async function createLocalFolder(localPath: string): Promise<void> {
  await fs.mkdir(localPath, { recursive: false });
}

export async function renameLocalPath(
  from: string,
  to: string,
): Promise<void> {
  await fs.rename(from, to);
}
