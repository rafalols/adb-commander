import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type {
  DeviceInfo,
  DirectoryListing,
  FileEntry,
  FileKind,
} from "../src/types";

const RECORD_SEPARATOR = "\x1e";
const FIELD_SEPARATOR = "\x1c";
const MAX_OUTPUT_BYTES = 128 * 1024 * 1024;

function resolveAdbPath(): string {
  const candidates = [
    process.env.ADB_PATH,
    process.env.ANDROID_HOME
      ? path.join(process.env.ANDROID_HOME, "platform-tools", "adb")
      : undefined,
    process.env.ANDROID_SDK_ROOT
      ? path.join(process.env.ANDROID_SDK_ROOT, "platform-tools", "adb")
      : undefined,
    path.join(homedir(), "Library", "Android", "sdk", "platform-tools", "adb"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => existsSync(candidate)) ?? "adb";
}

export const adbPath = resolveAdbPath();

export interface ManifestEntry {
  relativePath: string;
  kind: "file" | "directory";
  size: number;
  modifiedAt: number;
}

interface CommandOptions {
  timeoutMs?: number;
  maxBytes?: number;
  signal?: AbortSignal;
}

export function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new DOMException("Transfer cancelled.", "AbortError"));
      return;
    }
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill("SIGTERM");
      reject(new DOMException("Transfer cancelled.", "AbortError"));
    };
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill("SIGTERM");
        reject(new Error(`Command timed out: ${command}`));
      }
    }, options.timeoutMs ?? 30_000);
    options.signal?.addEventListener("abort", abort, { once: true });

    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > (options.maxBytes ?? MAX_OUTPUT_BYTES)) {
        child.kill("SIGTERM");
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      options.signal?.removeEventListener("abort", abort);
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", abort);
      clearTimeout(timeout);
      if (outputBytes > (options.maxBytes ?? MAX_OUTPUT_BYTES)) {
        reject(new Error("ADB returned too much data."));
        return;
      }
      if (code !== 0) {
        const message = Buffer.concat(stderr).toString("utf8").trim();
        reject(new Error(message || `${command} exited with code ${code}`));
        return;
      }
      resolve(Buffer.concat(stdout));
    });
  });
}

export async function runAdb(
  serial: string | undefined,
  args: string[],
  options?: CommandOptions,
): Promise<Buffer> {
  const serialArgs = serial ? ["-s", serial] : [];
  return runCommand(adbPath, [...serialArgs, ...args], options);
}

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

export function remoteCommandString(
  command: string,
  args: string[] = [],
): string {
  return [command, ...args].map(shellQuote).join(" ");
}

export function runRemoteCommand(
  serial: string,
  command: string,
  args: string[] = [],
  options?: CommandOptions,
): Promise<Buffer> {
  return runAdb(
    serial,
    ["shell", remoteCommandString(command, args)],
    options,
  );
}

export function runRemoteScript(
  serial: string,
  script: string,
  args: string[] = [],
  options?: CommandOptions,
): Promise<Buffer> {
  const command = [
    "sh",
    "-c",
    shellQuote(script),
    "bridge",
    ...args.map(shellQuote),
  ].join(" ");
  return runAdb(serial, ["shell", command], options);
}

function extensionOf(name: string): string {
  const extension = path.posix.extname(name).slice(1).toLowerCase();
  return extension;
}

export function kindFromName(
  name: string,
  isDirectory = false,
): FileKind {
  if (isDirectory) return "directory";
  const extension = extensionOf(name);
  if (
    ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "avif"].includes(
      extension,
    )
  ) {
    return "image";
  }
  if (["mp4", "mov", "mkv", "webm", "avi", "m4v", "3gp"].includes(extension)) {
    return "video";
  }
  if (["mp3", "m4a", "aac", "wav", "flac", "ogg", "opus"].includes(extension)) {
    return "audio";
  }
  if (["zip", "tar", "gz", "7z", "rar", "apk", "tgz"].includes(extension)) {
    return "archive";
  }
  return "file";
}

export async function listDevices(): Promise<DeviceInfo[]> {
  const output = (await runAdb(undefined, ["devices", "-l"])).toString("utf8");
  const lines = output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean);

  return Promise.all(
    lines.map(async (line) => {
      const [serial, state = "unknown", ...metadataParts] = line.split(/\s+/);
      const metadata = Object.fromEntries(
        metadataParts
          .map((part) => part.split(/:(.*)/s))
          .filter((parts) => parts.length >= 2)
          .map(([key, value]) => [key, value]),
      );
      const fallbackModel = (metadata.model ?? "Android").replaceAll("_", " ");
      let manufacturer = "";
      let model = fallbackModel;
      let androidVersion = "";

      if (state === "device") {
        try {
          const properties = (
            await runRemoteScript(
              serial,
              "printf '%s\\n%s\\n%s' \"$(getprop ro.product.manufacturer)\" \"$(getprop ro.product.model)\" \"$(getprop ro.build.version.release)\"",
            )
          )
            .toString("utf8")
            .replaceAll("\r", "")
            .split("\n");
          manufacturer = properties[0]?.trim() ?? "";
          model = properties[1]?.trim() || fallbackModel;
          androidVersion = properties[2]?.trim() ?? "";
        } catch {
          // The useful metadata from `adb devices -l` is still returned.
        }
      }

      return {
        serial,
        state,
        model,
        manufacturer,
        product: metadata.product?.replaceAll("_", " "),
        androidVersion,
        connection: serial.includes(":") ? "network" : "usb",
      } satisfies DeviceInfo;
    }),
  );
}

const LIST_SCRIPT = `
root="$1"
for item in "$root"/* "$root"/.[!.]* "$root"/..?*; do
  [ -e "$item" ] || continue
  if [ -d "$item" ]; then kind="directory"; else kind="file"; fi
  size="$(stat -c %s "$item" 2>/dev/null || echo 0)"
  modified="$(stat -c %Y "$item" 2>/dev/null || echo 0)"
  name="\${item##*/}"
  printf '%s\\034%s\\034%s\\034%s\\036' "$kind" "$size" "$modified" "$name"
done
`;

function parseDeviceRecords(output: string, root: string): FileEntry[] {
  return output
    .split(RECORD_SEPARATOR)
    .filter(Boolean)
    .map((record) => {
      const [rawKind, rawSize, rawModified, ...nameParts] =
        record.split(FIELD_SEPARATOR);
      const name = nameParts.join(FIELD_SEPARATOR);
      const isDirectory = rawKind === "directory";
      const entryPath = path.posix.join(root, name);
      return {
        id: `device:${entryPath}`,
        name,
        path: entryPath,
        kind: kindFromName(name, isDirectory),
        extension: extensionOf(name),
        size: Number(rawSize) || 0,
        modifiedAt: (Number(rawModified) || 0) * 1000,
        hidden: name.startsWith("."),
      };
    });
}

async function getDeviceStorage(
  serial: string,
  remotePath: string,
): Promise<{ freeBytes?: number; totalBytes?: number }> {
  try {
    const output = (
      await runRemoteCommand(serial, "df", ["-k", remotePath])
    ).toString("utf8");
    const lastLine = output.trim().split(/\r?\n/).at(-1)?.trim();
    const columns = lastLine?.split(/\s+/) ?? [];
    const totalKb = Number(columns[1]);
    const freeKb = Number(columns[3]);
    return {
      totalBytes: Number.isFinite(totalKb) ? totalKb * 1024 : undefined,
      freeBytes: Number.isFinite(freeKb) ? freeKb * 1024 : undefined,
    };
  } catch {
    return {};
  }
}

export async function listDeviceDirectory(
  serial: string,
  requestedPath = "/sdcard",
): Promise<DirectoryListing> {
  const remotePath = path.posix.resolve("/", requestedPath);
  const [output, storage] = await Promise.all([
    runRemoteScript(serial, LIST_SCRIPT, [remotePath], { timeoutMs: 45_000 }),
    getDeviceStorage(serial, remotePath),
  ]);
  const parent =
    remotePath === "/" ? null : path.posix.dirname(remotePath) || "/";

  return {
    path: remotePath,
    parent,
    homePath: "/sdcard",
    entries: parseDeviceRecords(output.toString("utf8"), remotePath),
    ...storage,
  };
}

const MANIFEST_SCRIPT = `
base="$1"
walk() {
  current="$1"
  for item in "$current"/* "$current"/.[!.]* "$current"/..?*; do
    [ -e "$item" ] || continue
    relative="\${item#"$base"/}"
    if [ -d "$item" ]; then
      printf 'directory\\0340\\034%s\\034%s\\036' "$(stat -c %Y "$item" 2>/dev/null || echo 0)" "$relative"
      walk "$item"
    elif [ -f "$item" ]; then
      printf 'file\\034%s\\034%s\\034%s\\036' "$(stat -c %s "$item" 2>/dev/null || echo 0)" "$(stat -c %Y "$item" 2>/dev/null || echo 0)" "$relative"
    fi
  done
}
walk "$base"
`;

export async function getDeviceManifest(
  serial: string,
  remoteRoot: string,
): Promise<ManifestEntry[]> {
  const output = await runRemoteScript(
    serial,
    MANIFEST_SCRIPT,
    [remoteRoot],
    { timeoutMs: 10 * 60_000 },
  );
  return output
    .toString("utf8")
    .split(RECORD_SEPARATOR)
    .filter(Boolean)
    .map((record) => {
      const [kind, rawSize, rawModified, ...relativeParts] =
        record.split(FIELD_SEPARATOR);
      return {
        kind: kind === "directory" ? "directory" : "file",
        size: Number(rawSize) || 0,
        modifiedAt: (Number(rawModified) || 0) * 1000,
        relativePath: relativeParts.join(FIELD_SEPARATOR),
      };
    });
}

export async function deviceHasTar(serial: string): Promise<boolean> {
  try {
    await runRemoteScript(serial, "command -v tar >/dev/null");
    return true;
  } catch {
    return false;
  }
}

export async function createDeviceFolder(
  serial: string,
  remotePath: string,
): Promise<void> {
  await runRemoteCommand(serial, "mkdir", ["-p", remotePath]);
}

export async function renameDevicePath(
  serial: string,
  from: string,
  to: string,
): Promise<void> {
  await runRemoteCommand(serial, "mv", [from, to]);
}

export async function readDeviceFile(
  serial: string,
  remotePath: string,
  maxBytes = 32 * 1024 * 1024,
): Promise<Buffer> {
  return runAdb(
    serial,
    ["exec-out", remoteCommandString("cat", [remotePath])],
    {
    timeoutMs: 90_000,
    maxBytes,
    },
  );
}
