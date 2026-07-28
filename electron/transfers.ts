import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  FileKind,
  IncrementalUpdateAnalysis,
  IncrementalUpdateRequest,
  TransferAnalysis,
  TransferProgress,
  TransferRequest,
  UpdateWarningReason,
} from "../src/types";
import {
  adbPath,
  createDeviceFolder,
  deviceHasTar,
  getDeviceManifest,
  type ManifestEntry,
  remoteCommandString,
  runAdb,
  runRemoteCommand,
} from "./adb";
import { getLocalManifest, listLocalDirectory } from "./local-files";
import { listDeviceDirectory } from "./adb";

type ProgressEmitter = (progress: TransferProgress) => void;
const activeTransfers = new Map<string, AbortController>();
const retryableTransfers = new Map<string, TransferRequest>();
const MAX_RETRYABLE_TRANSFERS = 40;

function rememberTransfer(id: string, request: TransferRequest): void {
  retryableTransfers.set(id, structuredClone(request));
  while (retryableTransfers.size > MAX_RETRYABLE_TRANSFERS) {
    const oldest = retryableTransfers.keys().next().value;
    if (typeof oldest !== "string") break;
    retryableTransfers.delete(oldest);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function titleForRequest(request: TransferRequest): string {
  const count = request.sources.length;
  return request.direction === "push"
    ? `To Android · ${count} ${count === 1 ? "item" : "items"}`
    : `To Mac · ${count} ${count === 1 ? "item" : "items"}`;
}

function pipeProcesses(
  sourceCommand: string,
  sourceArgs: string[],
  destinationCommand: string,
  destinationArgs: string[],
  signal: AbortSignal,
  onBytes?: (bytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Transfer cancelled.", "AbortError"));
      return;
    }
    const source = spawn(sourceCommand, sourceArgs, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const destination = spawn(destinationCommand, destinationArgs, {
      shell: false,
      stdio: ["pipe", "ignore", "pipe"],
    });
    const errors: Buffer[] = [];
    let sourceCode: number | null = null;
    let destinationCode: number | null = null;
    let settled = false;
    let bytes = 0;

    const finish = () => {
      if (sourceCode === null || destinationCode === null || settled) return;
      settled = true;
      if (sourceCode === 0 && destinationCode === 0) {
        resolve();
      } else {
        reject(
          new Error(
            Buffer.concat(errors).toString("utf8").trim() ||
              "The tar transfer failed.",
          ),
        );
      }
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      source.kill("SIGTERM");
      destination.kill("SIGTERM");
      reject(error);
    };
    const abort = () => {
      if (settled) return;
      settled = true;
      source.kill("SIGTERM");
      destination.kill("SIGTERM");
      reject(new DOMException("Transfer cancelled.", "AbortError"));
    };

    signal.addEventListener("abort", abort, { once: true });
    source.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    destination.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    source.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      onBytes?.(bytes);
    });
    source.stdout.on("error", fail);
    destination.stdin.on("error", fail);
    source.on("error", fail);
    destination.on("error", fail);
    source.stdout.pipe(destination.stdin);
    source.on("close", (code) => {
      sourceCode = code;
      finish();
    });
    destination.on("close", (code) => {
      destinationCode = code;
      signal.removeEventListener("abort", abort);
      finish();
    });
  });
}

async function isRemoteDirectory(
  serial: string,
  remotePath: string,
): Promise<boolean> {
  try {
    await runAdb(serial, [
      "shell",
      remoteCommandString("test", ["-d", remotePath]),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function remotePathExists(
  serial: string,
  remotePath: string,
): Promise<boolean> {
  try {
    await runAdb(serial, [
      "shell",
      remoteCommandString("test", ["-e", remotePath]),
    ]);
    return true;
  } catch {
    return false;
  }
}

async function localPathExists(localPath: string): Promise<boolean> {
  try {
    await fs.access(localPath);
    return true;
  } catch {
    return false;
  }
}

async function remoteFileSize(
  serial: string,
  remotePath: string,
): Promise<number> {
  try {
    const output = await runRemoteCommand(serial, "stat", ["-c", "%s", remotePath]);
    return Number(output.toString("utf8").trim()) || 0;
  } catch {
    return 0;
  }
}

export async function analyzeTransfer(
  request: TransferRequest,
): Promise<TransferAnalysis> {
  let fileCount = 0;
  let directoryCount = 0;
  let totalBytes = 0;
  const sourceBytes: TransferAnalysis["sourceBytes"] = [];
  const conflicts: TransferAnalysis["conflicts"] = [];

  for (const source of request.sources) {
    const name =
      request.direction === "push"
        ? path.basename(source)
        : path.posix.basename(source);
    const destination =
      request.direction === "push"
        ? path.posix.join(request.destination, name)
        : path.join(request.destination, name);
    let kind: FileKind = "file";
    let bytesForSource = 0;

    if (request.direction === "push") {
      const stats = await fs.stat(source);
      if (stats.isDirectory()) {
        kind = "directory";
        directoryCount += 1;
        const manifest = await getLocalManifest(source);
        fileCount += manifest.filter((entry) => entry.kind === "file").length;
        directoryCount += manifest.filter(
          (entry) => entry.kind === "directory",
        ).length;
        bytesForSource = manifest.reduce(
          (sum, entry) => sum + (entry.kind === "file" ? entry.size : 0),
          0,
        );
      } else {
        fileCount += 1;
        bytesForSource = stats.size;
      }
      if (await remotePathExists(request.deviceSerial, destination)) {
        conflicts.push({ source, destination, name, kind });
      }
    } else {
      const directory = await isRemoteDirectory(request.deviceSerial, source);
      if (directory) {
        kind = "directory";
        directoryCount += 1;
        const manifest = await getDeviceManifest(request.deviceSerial, source);
        fileCount += manifest.filter((entry) => entry.kind === "file").length;
        directoryCount += manifest.filter(
          (entry) => entry.kind === "directory",
        ).length;
        bytesForSource = manifest.reduce(
          (sum, entry) => sum + (entry.kind === "file" ? entry.size : 0),
          0,
        );
      } else {
        fileCount += 1;
        bytesForSource = await remoteFileSize(request.deviceSerial, source);
      }
      if (await localPathExists(destination)) {
        conflicts.push({ source, destination, name, kind });
      }
    }
    totalBytes += bytesForSource;
    sourceBytes.push({ source, bytes: bytesForSource });
  }

  const destinationListing =
    request.direction === "push"
      ? await listDeviceDirectory(request.deviceSerial, request.destination)
      : await listLocalDirectory(request.destination);
  const destinationFreeBytes = destinationListing.freeBytes;
  return {
    direction: request.direction,
    sourceCount: request.sources.length,
    fileCount,
    directoryCount,
    totalBytes,
    sourceBytes,
    destinationFreeBytes,
    insufficientSpace:
      destinationFreeBytes !== undefined && totalBytes > destinationFreeBytes,
    conflicts,
  };
}

async function transferOne(
  request: TransferRequest,
  source: string,
  signal: AbortSignal,
  onBytes?: (bytes: number) => void,
): Promise<{ strategy: string; skipped: boolean }> {
  const name =
    request.direction === "push"
      ? path.basename(source)
      : path.posix.basename(source);
  const destinationPath =
    request.direction === "push"
      ? path.posix.join(request.destination, name)
      : path.join(request.destination, name);
  const exists =
    request.direction === "push"
      ? await remotePathExists(request.deviceSerial, destinationPath)
      : await localPathExists(destinationPath);
  if (exists && request.conflictPolicy === "skip") {
    return { strategy: "skipped existing item", skipped: true };
  }

  if (request.direction === "push") {
    const stats = await fs.stat(source);
    const useTar =
      request.preferTar !== false &&
      stats.isDirectory() &&
      (await deviceHasTar(request.deviceSerial));

    if (useTar) {
      await createDeviceFolder(request.deviceSerial, request.destination);
      await pipeProcesses(
        "/usr/bin/tar",
        ["-C", path.dirname(source), "-cf", "-", path.basename(source)],
        adbPath,
        [
          "-s",
          request.deviceSerial,
          "shell",
          remoteCommandString("tar", [
            "-C",
            request.destination,
            "-xf",
            "-",
          ]),
        ],
        signal,
        onBytes,
      );
      return { strategy: "tar fast path", skipped: false };
    }

    await runAdb(
      request.deviceSerial,
      ["push", "-a", source, request.destination],
      { timeoutMs: 24 * 60 * 60_000, signal },
    );
    return { strategy: "adb push", skipped: false };
  }

  const useTar =
    request.preferTar !== false &&
    (await isRemoteDirectory(request.deviceSerial, source)) &&
    (await deviceHasTar(request.deviceSerial));

  if (useTar) {
    await fs.mkdir(request.destination, { recursive: true });
    await pipeProcesses(
      adbPath,
      [
        "-s",
        request.deviceSerial,
        "exec-out",
        remoteCommandString("tar", [
          "-C",
          path.posix.dirname(source),
          "-cf",
          "-",
          path.posix.basename(source),
        ]),
      ],
      "/usr/bin/tar",
      ["-C", request.destination, "-xf", "-"],
      signal,
      onBytes,
    );
    return { strategy: "tar fast path", skipped: false };
  }

  await runAdb(
    request.deviceSerial,
    ["pull", "-a", source, request.destination],
    { timeoutMs: 24 * 60 * 60_000, signal },
  );
  return { strategy: "adb pull", skipped: false };
}

export function startTransfer(
  request: TransferRequest,
  emit: ProgressEmitter,
): string {
  const id = randomUUID();
  const title = titleForRequest(request);
  const startedAt = Date.now();
  const controller = new AbortController();
  activeTransfers.set(id, controller);
  rememberTransfer(id, request);

  void (async () => {
    emit({
      id,
      title,
      detail: "Preparing transfer",
      direction: request.direction,
      status: "running",
      percent: 2,
      canRetry: true,
    });
    try {
      const analysis = await analyzeTransfer(request);
      const bytesBySource = new Map(
        analysis.sourceBytes.map((metric) => [metric.source, metric.bytes]),
      );
      let bytesTransferred = 0;
      let lastLiveEmit = 0;
      for (let index = 0; index < request.sources.length; index += 1) {
        if (controller.signal.aborted) {
          throw new DOMException("Transfer cancelled.", "AbortError");
        }
        const source = request.sources[index]!;
        const name =
          request.direction === "push"
            ? path.basename(source)
            : path.posix.basename(source);
        emit({
          id,
          title,
          detail: `Copying ${name}`,
          direction: request.direction,
          status: "running",
          percent: Math.max(4, Math.round((index / request.sources.length) * 92)),
          currentFile: name,
          bytesTransferred,
          totalBytes: analysis.totalBytes,
          speedBytesPerSecond:
            bytesTransferred / Math.max(1, (Date.now() - startedAt) / 1000),
          canRetry: true,
        });
        const itemStartedBytes = bytesTransferred;
        const itemTotalBytes = bytesBySource.get(source) ?? 0;
        const result = await transferOne(
          request,
          source,
          controller.signal,
          (itemBytes) => {
            const now = Date.now();
            if (now - lastLiveEmit < 250) return;
            lastLiveEmit = now;
            const nextBytes = Math.min(
              analysis.totalBytes,
              itemStartedBytes + Math.min(itemBytes, itemTotalBytes),
            );
            const speed =
              nextBytes / Math.max(1, (now - startedAt) / 1000);
            emit({
              id,
              title,
              detail: `Copying ${name}`,
              direction: request.direction,
              status: "running",
              percent:
                analysis.totalBytes > 0
                  ? Math.min(96, Math.max(4, Math.round((nextBytes / analysis.totalBytes) * 96)))
                  : Math.max(4, Math.round((index / request.sources.length) * 92)),
              currentFile: name,
              bytesTransferred: nextBytes,
              totalBytes: analysis.totalBytes,
              speedBytesPerSecond: speed,
              estimatedSecondsRemaining:
                speed > 0
                  ? Math.max(0, (analysis.totalBytes - nextBytes) / speed)
                  : undefined,
              canRetry: true,
            });
          },
        );
        if (!result.skipped) {
          bytesTransferred = Math.min(
            analysis.totalBytes,
            bytesTransferred + itemTotalBytes,
          );
        }
        const speed =
          bytesTransferred / Math.max(1, (Date.now() - startedAt) / 1000);
        emit({
          id,
          title,
          detail: `${name} · ${result.strategy}`,
          direction: request.direction,
          status: "running",
          percent:
            analysis.totalBytes > 0
              ? Math.min(
                  96,
                  Math.round(
                    (bytesTransferred / analysis.totalBytes) * 96,
                  ),
                )
              : Math.round(
                  ((index + 1) / request.sources.length) * 96,
                ),
          currentFile: name,
          bytesTransferred,
          totalBytes: analysis.totalBytes,
          speedBytesPerSecond: speed,
          estimatedSecondsRemaining:
            speed > 0
              ? Math.max(0, (analysis.totalBytes - bytesTransferred) / speed)
              : undefined,
          canRetry: true,
        });
      }

      emit({
        id,
        title,
        detail: `Complete · ${Math.max(1, Math.round((Date.now() - startedAt) / 1000))} s`,
        direction: request.direction,
        status: "completed",
        percent: 100,
        bytesTransferred: analysis.totalBytes,
        totalBytes: analysis.totalBytes,
        speedBytesPerSecond:
          analysis.totalBytes / Math.max(1, (Date.now() - startedAt) / 1000),
        estimatedSecondsRemaining: 0,
        canRetry: true,
      });
    } catch (error) {
      emit({
        id,
        title,
        detail: isAbortError(error) ? "Transfer cancelled" : "Transfer stopped",
        direction: request.direction,
        status: isAbortError(error) ? "cancelled" : "failed",
        percent: isAbortError(error) ? 0 : 100,
        canRetry: true,
        error: isAbortError(error)
          ? undefined
          : error instanceof Error
            ? error.message
            : String(error),
      });
    } finally {
      activeTransfers.delete(id);
    }
  })();

  return id;
}

export function cancelTransfer(id: string): boolean {
  const controller = activeTransfers.get(id);
  if (!controller) return false;
  controller.abort();
  return true;
}

export function retryTransfer(id: string, emit: ProgressEmitter): string {
  const request = retryableTransfers.get(id);
  if (!request) {
    throw new Error("This transfer is no longer available to retry.");
  }
  return startTransfer(request, emit);
}

function normalizedRelative(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function fileChanged(
  source: { size: number; modifiedAt: number },
  destination?: { size: number; modifiedAt: number },
): boolean {
  if (!destination) return true;
  return (
    source.size !== destination.size ||
    Math.abs(source.modifiedAt - destination.modifiedAt) > 2_000
  );
}

const UPDATE_PLAN_TTL_MS = 5 * 60_000;
const MAX_PREPARED_UPDATES = 4;
const LARGE_UPDATE_BYTES = 5 * 1024 ** 3;
const LARGE_SCAN_FILES = 10_000;

interface PreparedUpdate {
  analysis: IncrementalUpdateAnalysis;
  request: IncrementalUpdateRequest;
  directories: ManifestEntry[];
  changedFiles: ManifestEntry[];
}

const preparedUpdates = new Map<string, PreparedUpdate>();

function isBroadRoot(request: IncrementalUpdateRequest): boolean {
  const deviceRoot = path.posix.normalize(request.deviceRoot);
  const localRoot = path.resolve(request.localRoot);
  return deviceRoot === "/" || deviceRoot === "/sdcard" || localRoot === "/";
}

function removeExpiredUpdates(): void {
  const now = Date.now();
  for (const [id, prepared] of preparedUpdates) {
    if (prepared.analysis.expiresAt <= now) preparedUpdates.delete(id);
  }
}

function makeRoomForUpdate(): void {
  while (preparedUpdates.size >= MAX_PREPARED_UPDATES) {
    const oldestId = preparedUpdates.keys().next().value;
    if (typeof oldestId !== "string") return;
    preparedUpdates.delete(oldestId);
  }
}

export async function analyzeIncrementalUpdate(
  request: IncrementalUpdateRequest,
): Promise<IncrementalUpdateAnalysis> {
  removeExpiredUpdates();

  const [localManifest, deviceManifest] = await Promise.all([
    getLocalManifest(request.localRoot),
    getDeviceManifest(request.deviceSerial, request.deviceRoot),
  ]);
  const localByPath = new Map(
    localManifest.map((entry) => [
      normalizedRelative(entry.relativePath),
      entry,
    ]),
  );
  const deviceByPath = new Map(
    deviceManifest.map((entry) => [
      normalizedRelative(entry.relativePath),
      entry,
    ]),
  );
  const sourceManifest =
    request.direction === "push" ? localManifest : deviceManifest;
  const files = sourceManifest.filter((entry) => entry.kind === "file");
  const directories = sourceManifest.filter(
    (entry) => entry.kind === "directory",
  );
  const changedFiles = files.filter((source) => {
    const relative = normalizedRelative(source.relativePath);
    const destination =
      request.direction === "push"
        ? deviceByPath.get(relative)
        : localByPath.get(relative);
    return fileChanged(source, destination);
  });
  const changedBytes = changedFiles.reduce(
    (total, entry) => total + entry.size,
    0,
  );
  const warningReasons: UpdateWarningReason[] = [];
  if (changedBytes > LARGE_UPDATE_BYTES) {
    warningReasons.push("changed-bytes");
  }
  if (files.length > LARGE_SCAN_FILES) {
    warningReasons.push("many-files");
  }
  if (isBroadRoot(request)) {
    warningReasons.push("broad-root");
  }

  const id = randomUUID();
  const analysis: IncrementalUpdateAnalysis = {
    id,
    direction: request.direction,
    localRoot: request.localRoot,
    deviceRoot: request.deviceRoot,
    scannedFiles: files.length,
    sourceDirectories: directories.length,
    changedFiles: changedFiles.length,
    unchangedFiles: files.length - changedFiles.length,
    changedBytes,
    totalSourceBytes: files.reduce((total, entry) => total + entry.size, 0),
    warningReasons,
    expiresAt: Date.now() + UPDATE_PLAN_TTL_MS,
  };
  makeRoomForUpdate();
  preparedUpdates.set(id, {
    analysis,
    request,
    directories,
    changedFiles,
  });
  return analysis;
}

export function startIncrementalUpdate(
  analysisId: string,
  emit: ProgressEmitter,
): string {
  removeExpiredUpdates();
  const prepared = preparedUpdates.get(analysisId);
  if (!prepared) {
    throw new Error(
      "This update analysis expired. Analyze the folders again.",
    );
  }
  preparedUpdates.delete(analysisId);

  const { analysis, changedFiles, directories, request } = prepared;
  const id = randomUUID();
  const controller = new AbortController();
  activeTransfers.set(id, controller);
  const title =
    request.direction === "push"
      ? "Incremental update · Mac → Android"
      : "Incremental update · Android → Mac";

  void (async () => {
    emit({
      id,
      title,
      detail: "Preparing changed files",
      direction: request.direction,
      status: "running",
      percent: 3,
      totalBytes: analysis.changedBytes,
      bytesTransferred: 0,
      canRetry: false,
    });

    try {
      for (const directory of directories) {
        if (controller.signal.aborted) {
          throw new DOMException("Transfer cancelled.", "AbortError");
        }
        const relative = normalizedRelative(directory.relativePath);
        if (request.direction === "push") {
          await createDeviceFolder(
            request.deviceSerial,
            path.posix.join(request.deviceRoot, relative),
          );
        } else {
          await fs.mkdir(path.join(request.localRoot, relative), {
            recursive: true,
          });
        }
      }

      let bytesTransferred = 0;
      const startedAt = Date.now();
      for (let index = 0; index < changedFiles.length; index += 1) {
        if (controller.signal.aborted) {
          throw new DOMException("Transfer cancelled.", "AbortError");
        }
        const file = changedFiles[index]!;
        const relative = normalizedRelative(file.relativePath);
        const speed =
          bytesTransferred / Math.max(1, (Date.now() - startedAt) / 1000);
        emit({
          id,
          title,
          detail: relative,
          direction: request.direction,
          status: "running",
          percent:
            8 + Math.round((index / Math.max(1, changedFiles.length)) * 88),
          totalBytes: analysis.changedBytes,
          bytesTransferred,
          currentFile: relative,
          speedBytesPerSecond: speed,
          estimatedSecondsRemaining:
            speed > 0
              ? Math.max(0, (analysis.changedBytes - bytesTransferred) / speed)
              : undefined,
          canRetry: false,
        });

        if (request.direction === "push") {
          const remoteTarget = path.posix.join(request.deviceRoot, relative);
          await createDeviceFolder(
            request.deviceSerial,
            path.posix.dirname(remoteTarget),
          );
          await runAdb(
            request.deviceSerial,
            [
              "push",
              "-a",
              path.join(request.localRoot, file.relativePath),
              remoteTarget,
            ],
            { timeoutMs: 24 * 60 * 60_000, signal: controller.signal },
          );
        } else {
          const localTarget = path.join(request.localRoot, file.relativePath);
          await fs.mkdir(path.dirname(localTarget), { recursive: true });
          await runAdb(
            request.deviceSerial,
            [
              "pull",
              "-a",
              path.posix.join(request.deviceRoot, file.relativePath),
              localTarget,
            ],
            { timeoutMs: 24 * 60 * 60_000, signal: controller.signal },
          );
        }
        bytesTransferred += file.size;
      }

      emit({
        id,
        title,
        detail: `${changedFiles.length} copied · ${analysis.unchangedFiles} unchanged`,
        direction: request.direction,
        status: "completed",
        percent: 100,
        totalBytes: analysis.changedBytes,
        bytesTransferred: analysis.changedBytes,
        estimatedSecondsRemaining: 0,
        speedBytesPerSecond:
          analysis.changedBytes /
          Math.max(1, (Date.now() - startedAt) / 1000),
        canRetry: false,
      });
    } catch (error) {
      emit({
        id,
        title,
        detail: isAbortError(error)
          ? "Incremental update cancelled"
          : "Incremental update stopped",
        direction: request.direction,
        status: isAbortError(error) ? "cancelled" : "failed",
        percent: isAbortError(error) ? 0 : 100,
        totalBytes: analysis.changedBytes,
        canRetry: false,
        error: isAbortError(error)
          ? undefined
          : error instanceof Error
            ? error.message
            : String(error),
      });
    } finally {
      activeTransfers.delete(id);
    }
  })();

  return id;
}
