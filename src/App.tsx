import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  CircleHelp,
  Copy,
  File,
  FileAudio,
  FileImage,
  Film,
  Folder,
  FolderOpen,
  FolderPlus,
  Grid3X3,
  Home,
  Info,
  List,
  LoaderCircle,
  Monitor,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Smartphone,
  Sparkles,
  Usb,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import {
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  BridgeApi,
  ConflictPolicy,
  DeviceInfo,
  DirectoryListing,
  FileEntry,
  FileKind,
  IncrementalUpdateAnalysis,
  IncrementalUpdateRequest,
  PanelSide,
  ThumbnailRequest,
  TransferAnalysis,
  TransferDirection,
  TransferProgress,
  TransferRequest,
} from "./types";
import { type Language, useI18n } from "./i18n";

const EMPTY_LISTING: DirectoryListing = {
  path: "",
  parent: null,
  entries: [],
};

const demoLocalEntries: FileEntry[] = [
  {
    id: "local:Downloads",
    name: "Downloads",
    path: "/Users/alex/Downloads",
    kind: "directory",
    extension: "",
    size: 0,
    modifiedAt: Date.now() - 84_000,
    hidden: false,
  },
  {
    id: "local:Photos",
    name: "Photos",
    path: "/Users/alex/Photos",
    kind: "directory",
    extension: "",
    size: 0,
    modifiedAt: Date.now() - 420_000,
    hidden: false,
  },
  {
    id: "local:trip",
    name: "mountains-raw.jpg",
    path: "/Users/alex/mountains-raw.jpg",
    kind: "image",
    extension: "jpg",
    size: 8_340_322,
    modifiedAt: Date.now() - 3_600_000,
    hidden: false,
  },
  {
    id: "local:video",
    name: "product-demo.mp4",
    path: "/Users/alex/product-demo.mp4",
    kind: "video",
    extension: "mp4",
    size: 186_202_110,
    modifiedAt: Date.now() - 7_200_000,
    hidden: false,
  },
  {
    id: "local:brief",
    name: "campaign-brief.pdf",
    path: "/Users/alex/campaign-brief.pdf",
    kind: "file",
    extension: "pdf",
    size: 2_811_042,
    modifiedAt: Date.now() - 86_400_000,
    hidden: false,
  },
];

const demoDeviceEntries: FileEntry[] = [
  {
    id: "device:DCIM",
    name: "DCIM",
    path: "/sdcard/DCIM",
    kind: "directory",
    extension: "",
    size: 0,
    modifiedAt: Date.now() - 52_000,
    hidden: false,
  },
  {
    id: "device:Download",
    name: "Download",
    path: "/sdcard/Download",
    kind: "directory",
    extension: "",
    size: 0,
    modifiedAt: Date.now() - 103_000,
    hidden: false,
  },
  {
    id: "device:Movies",
    name: "Movies",
    path: "/sdcard/Movies",
    kind: "directory",
    extension: "",
    size: 0,
    modifiedAt: Date.now() - 8_400_000,
    hidden: false,
  },
  {
    id: "device:camera",
    name: "IMG_20260726_142803.jpg",
    path: "/sdcard/IMG_20260726_142803.jpg",
    kind: "image",
    extension: "jpg",
    size: 5_912_123,
    modifiedAt: Date.now() - 1_420_000,
    hidden: false,
  },
  {
    id: "device:clip",
    name: "VID_20260725_183402.mp4",
    path: "/sdcard/VID_20260725_183402.mp4",
    kind: "video",
    extension: "mp4",
    size: 42_810_992,
    modifiedAt: Date.now() - 29_400_000,
    hidden: false,
  },
];

const demoProgressListeners = new Set<
  (progress: TransferProgress) => void
>();
const demoTransferRequests = new Map<string, TransferRequest>();
const demoTransferTimers = new Map<string, number>();

const demoBridge: BridgeApi = {
  async listDevices() {
    return [
      {
        serial: "DEMO-ADB-2026",
        state: "device",
        manufacturer: "Google",
        model: "Pixel 9 Pro",
        androidVersion: "16",
        connection: "usb",
      },
    ];
  },
  async listLocal(path = "/Users/alex") {
    return {
      path,
      parent: path === "/" ? null : "/Users",
      homePath: "/Users/alex",
      entries: demoLocalEntries,
      totalBytes: 512 * 1024 ** 3,
      freeBytes: 183 * 1024 ** 3,
    };
  },
  async listDevice(_serial, path = "/sdcard") {
    return {
      path,
      parent: path === "/" ? null : "/",
      homePath: "/sdcard",
      entries: demoDeviceEntries,
      totalBytes: 128 * 1024 ** 3,
      freeBytes: 47 * 1024 ** 3,
    };
  },
  async analyzeTransfer(request) {
    const entries =
      request.direction === "push" ? demoLocalEntries : demoDeviceEntries;
    const selected = entries.filter((entry) =>
      request.sources.includes(entry.path),
    );
    const destinationEntries =
      request.direction === "push" ? demoDeviceEntries : demoLocalEntries;
    return {
      direction: request.direction,
      sourceCount: selected.length,
      fileCount: selected.filter((entry) => entry.kind !== "directory").length,
      directoryCount: selected.filter((entry) => entry.kind === "directory")
        .length,
      totalBytes: selected.reduce((sum, entry) => sum + entry.size, 0),
      sourceBytes: selected.map((entry) => ({
        source: entry.path,
        bytes: entry.size,
      })),
      destinationFreeBytes:
        request.direction === "push" ? 47 * 1024 ** 3 : 183 * 1024 ** 3,
      insufficientSpace: false,
      conflicts: selected
        .filter((entry) =>
          destinationEntries.some((item) => item.name === entry.name),
        )
        .map((entry) => ({
          source: entry.path,
          destination: joinPath(
            request.direction === "push" ? "device" : "local",
            request.destination,
            entry.name,
          ),
          name: entry.name,
          kind: entry.kind,
        })),
    };
  },
  async transfer(request) {
    const id = crypto.randomUUID();
    demoTransferRequests.set(id, request);
    const base: TransferProgress = {
      id,
      title:
        request.direction === "push"
          ? "To Android · demo"
          : "To Mac · demo",
      detail: "Copying with tar fast path",
      direction: request.direction,
      status: "running",
      percent: 24,
      currentFile: request.sources[0]?.split("/").at(-1),
      totalBytes: 42 * 1024 ** 2,
      bytesTransferred: 10 * 1024 ** 2,
      speedBytesPerSecond: 18 * 1024 ** 2,
      estimatedSecondsRemaining: 2,
      canRetry: true,
    };
    demoProgressListeners.forEach((listener) => listener(base));
    const completionTimer = window.setTimeout(() => {
      demoProgressListeners.forEach((listener) =>
        listener({
          ...base,
          detail: "Complete · demo mode",
          percent: 100,
          status: "completed",
          bytesTransferred: base.totalBytes,
          estimatedSecondsRemaining: 0,
        }),
      );
      demoTransferTimers.delete(id);
    }, 1200);
    demoTransferTimers.set(id, completionTimer);
    return { id };
  },
  async cancelTransfer(id) {
    const request = demoTransferRequests.get(id);
    if (!request) return false;
    const timer = demoTransferTimers.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    demoTransferTimers.delete(id);
    demoProgressListeners.forEach((listener) =>
      listener({
        id,
        title: request.direction === "push" ? "To Android" : "To Mac",
        detail: "Transfer cancelled",
        direction: request.direction,
        status: "cancelled",
        percent: 0,
        canRetry: true,
      }),
    );
    return true;
  },
  async retryTransfer(id) {
    const request = demoTransferRequests.get(id);
    if (!request) throw new Error("This transfer cannot be retried.");
    return demoBridge.transfer(request);
  },
  async analyzeIncrementalUpdate(request) {
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    return {
      id: crypto.randomUUID(),
      direction: request.direction,
      localRoot: request.localRoot,
      deviceRoot: request.deviceRoot,
      scannedFiles: 1_248,
      sourceDirectories: 86,
      changedFiles: 37,
      unchangedFiles: 1_211,
      changedBytes: 3.8 * 1024 ** 3,
      totalSourceBytes: 41.2 * 1024 ** 3,
      warningReasons: ["broad-root"],
      expiresAt: Date.now() + 5 * 60_000,
    };
  },
  async startIncrementalUpdate(_analysisId) {
    const id = crypto.randomUUID();
    const progress: TransferProgress = {
      id,
      title: "Incremental update · Mac → Android",
      detail: "Copying 37 changed files",
      direction: "push",
      status: "running",
      percent: 24,
      totalBytes: 3.8 * 1024 ** 3,
    };
    demoProgressListeners.forEach((listener) => listener(progress));
    window.setTimeout(() => {
      demoProgressListeners.forEach((listener) =>
        listener({
          ...progress,
          detail: "37 copied · 1,211 unchanged",
          status: "completed",
          percent: 100,
          bytesTransferred: progress.totalBytes,
        }),
      );
    }, 1200);
    return { id };
  },
  async createFolder() {},
  async rename() {},
  async getThumbnail() {
    return null;
  },
  async openLocal() {},
  async revealLocal() {},
  onTransferProgress(listener) {
    demoProgressListeners.add(listener);
    return () => demoProgressListeners.delete(listener);
  },
};

const demoMode = new URLSearchParams(window.location.search).get("demo") === "1";
const bridge = window.bridge ?? demoBridge;

const KIND_ICON: Record<FileKind, ComponentType<{ size?: number }>> = {
  directory: Folder,
  image: FileImage,
  video: Film,
  archive: Archive,
  audio: FileAudio,
  file: File,
};

function formatBytes(bytes?: number): string {
  if (bytes === undefined) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function formatDuration(seconds?: number): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return "—";
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 60) return `${rounded}s`;
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${minutes}m ${remainder}s`;
}

function formatDate(timestamp: number, _language: Language): string {
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return `today, ${date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
  return date.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function joinPath(side: PanelSide, root: string, name: string): string {
  if (side === "device") {
    return `${root === "/" ? "" : root}/${name}`.replace(/\/+/g, "/");
  }
  return `${root.endsWith("/") ? root : `${root}/`}${name}`.replace(
    /\/+/g,
    "/",
  );
}

function pathCrumbs(fullPath: string): Array<{ label: string; path: string }> {
  const segments = fullPath.split("/").filter(Boolean);
  const crumbs = [{ label: "/", path: "/" }];
  segments.forEach((segment, index) => {
    crumbs.push({
      label: segment,
      path: `/${segments.slice(0, index + 1).join("/")}`,
    });
  });
  return crumbs;
}

function FileGlyph({
  entry,
  side,
  serial,
}: {
  entry: FileEntry;
  side: PanelSide;
  serial?: string;
}) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(false);
  const glyphRef = useRef<HTMLSpanElement>(null);
  const Icon = KIND_ICON[entry.kind];

  useEffect(() => {
    const element = glyphRef.current;
    if (!element || (entry.kind !== "image" && entry.kind !== "video")) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([intersection]) => {
        if (intersection?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [entry.kind, entry.path]);

  useEffect(() => {
    let cancelled = false;
    if (entry.kind !== "image" && entry.kind !== "video") {
      setLoaded(true);
      return;
    }
    if (!visible) return;
    const request: ThumbnailRequest = {
      side,
      path: entry.path,
      kind: entry.kind,
      serial,
      size: entry.size,
      modifiedAt: entry.modifiedAt,
    };
    void bridge
      .getThumbnail(request)
      .then((value) => {
        if (!cancelled) setThumbnail(value);
      })
      .catch(() => null)
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [
    entry.kind,
    entry.modifiedAt,
    entry.path,
    entry.size,
    serial,
    side,
    visible,
  ]);

  if (thumbnail) {
    return (
      <span className="file-glyph media-glyph" ref={glyphRef}>
        <img src={thumbnail} alt="" />
        {entry.kind === "video" && (
          <span className="video-marker">
            <Film size={9} />
          </span>
        )}
      </span>
    );
  }

  return (
    <span className={`file-glyph kind-${entry.kind}`} ref={glyphRef}>
      {!loaded && (entry.kind === "image" || entry.kind === "video") ? (
        <LoaderCircle className="spin" size={17} />
      ) : (
        <Icon size={18} />
      )}
    </span>
  );
}

interface FilePanelProps {
  side: PanelSide;
  listing: DirectoryListing;
  loading: boolean;
  active: boolean;
  selected: Set<string>;
  cursorId: string | null;
  query: string;
  showHidden: boolean;
  grid: boolean;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  searchRequestId: number;
  serial?: string;
  onActivate(): void;
  onNavigate(path: string): void;
  onRefresh(): void;
  onSelect(entry: FileEntry, event: ReactMouseEvent): void;
  onQuery(value: string): void;
  onSort(column: SortColumn, direction: SortDirection): void;
  onToggleHidden(): void;
  onToggleGrid(): void;
  onNewFolder(): void;
  onRename(): void;
  onOpen?(entry: FileEntry): void;
  onContextMenu(entry: FileEntry, event: ReactMouseEvent): void;
}

type SortColumn = "name" | "type" | "size" | "modified";
type SortDirection = "asc" | "desc";

function visibleEntriesFor(
  listing: DirectoryListing,
  query: string,
  showHidden: boolean,
  sortColumn: SortColumn,
  sortDirection: SortDirection,
): FileEntry[] {
  return listing.entries
    .filter((entry) => showHidden || !entry.hidden)
    .filter((entry) =>
      entry.name.toLocaleLowerCase("en").includes(query.toLocaleLowerCase("en")),
    )
    .sort((a, b) => {
      if (a.kind === "directory" && b.kind !== "directory") return -1;
      if (a.kind !== "directory" && b.kind === "directory") return 1;
      let comparison = 0;
      if (sortColumn === "type") {
        const aType = a.kind === "directory" ? "Folder" : a.extension || "File";
        const bType = b.kind === "directory" ? "Folder" : b.extension || "File";
        comparison = aType.localeCompare(bType, "en", {
          numeric: true,
          sensitivity: "base",
        });
      } else if (sortColumn === "size") {
        comparison = a.size - b.size;
      } else if (sortColumn === "modified") {
        comparison = a.modifiedAt - b.modifiedAt;
      } else {
        comparison = a.name.localeCompare(b.name, "en", {
          numeric: true,
          sensitivity: "base",
        });
      }
      if (comparison === 0 && sortColumn !== "name") {
        comparison = a.name.localeCompare(b.name, "en", {
          numeric: true,
          sensitivity: "base",
        });
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
}

function FilePanel({
  side,
  listing,
  loading,
  active,
  selected,
  cursorId,
  query,
  showHidden,
  grid,
  sortColumn,
  sortDirection,
  searchRequestId,
  serial,
  onActivate,
  onNavigate,
  onRefresh,
  onSelect,
  onQuery,
  onSort,
  onToggleHidden,
  onToggleGrid,
  onNewFolder,
  onRename,
  onOpen,
  onContextMenu,
}: FilePanelProps) {
  const { language, t } = useI18n();
  const searchRef = useRef<HTMLInputElement>(null);
  const lastSearchRequestRef = useRef(searchRequestId);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  const toggleSort = (column: SortColumn) => {
    if (column === sortColumn) {
      onSort(column, sortDirection === "asc" ? "desc" : "asc");
    } else {
      onSort(column, "asc");
    }
  };

  const entries = useMemo(
    () =>
      visibleEntriesFor(
        listing,
        query,
        showHidden,
        sortColumn,
        sortDirection,
      ),
    [
      language,
      listing.entries,
      query,
      showHidden,
      sortColumn,
      sortDirection,
    ],
  );
  useEffect(() => {
    if (!cursorId) return;
    rowRefs.current.get(cursorId)?.scrollIntoView({ block: "nearest" });
  }, [cursorId, entries]);
  useEffect(() => {
    if (lastSearchRequestRef.current === searchRequestId) return;
    lastSearchRequestRef.current = searchRequestId;
    searchRef.current?.focus();
    searchRef.current?.select();
  }, [searchRequestId]);
  const sortColumns: Array<{ column: SortColumn; label: string }> = [
    { column: "name", label: t("name") },
    { column: "type", label: t("type") },
    { column: "size", label: t("size") },
    { column: "modified", label: t("modified") },
  ];
  const crumbs = pathCrumbs(listing.path);
  const selectedSize = listing.entries
    .filter((entry) => selected.has(entry.id))
    .reduce((total, entry) => total + entry.size, 0);

  return (
    <section
      className={`file-panel ${active ? "active" : ""}`}
      onMouseDown={onActivate}
      aria-label={side === "local" ? t("filesOnMac") : t("filesOnAndroid")}
    >
      <div className="panel-heading">
        <div className="panel-title">
          <span className={`panel-device-icon ${side}`}>
            {side === "local" ? <Monitor size={17} /> : <Smartphone size={17} />}
          </span>
          <div>
            <strong>{side === "local" ? t("thisMac") : t("android")}</strong>
            <span>
              {side === "local" ? t("localStorage") : t("sharedStorage")}
            </span>
          </div>
        </div>
        <div className="panel-actions">
          <button
            className="icon-button"
            onClick={onNewFolder}
            aria-label={t("newFolder")}
            title={`${t("newFolder")} (F7)`}
          >
            <FolderPlus size={16} />
          </button>
          <button
            className="icon-button"
            onClick={onRename}
            disabled={selected.size > 1 || (selected.size === 0 && !cursorId)}
            aria-label={t("rename")}
            title={`${t("rename")} (F2)`}
          >
            <Pencil size={15} />
          </button>
          <button
            className="icon-button"
            onClick={onToggleHidden}
            aria-label={
              showHidden ? t("hideHiddenFiles") : t("showHiddenFiles")
            }
            title={
              showHidden ? t("hideHiddenFiles") : t("showHiddenFiles")
            }
          >
            <span className="hidden-dot">{showHidden ? "••" : "•"}</span>
          </button>
          <button
            className="icon-button"
            onClick={onToggleGrid}
            aria-label={grid ? t("listView") : t("gridView")}
            title={grid ? t("listView") : t("gridView")}
          >
            {grid ? <List size={16} /> : <Grid3X3 size={16} />}
          </button>
          <button
            className="icon-button"
            onClick={onRefresh}
            aria-label={t("refresh")}
            title={t("refresh")}
          >
            <RefreshCw className={loading ? "spin" : ""} size={16} />
          </button>
        </div>
      </div>

      <div className="path-bar">
        <button
          className="path-up"
          disabled={!listing.parent}
          onClick={() => listing.parent && onNavigate(listing.parent)}
          aria-label={t("parentFolder")}
          title={t("parentFolder")}
        >
          <ChevronUp size={16} />
        </button>
        <div className="breadcrumbs">
          {crumbs.map((crumb, index) => (
            <span className="crumb-group" key={crumb.path}>
              {index > 0 && <ChevronRight size={12} />}
              <button
                className={index === crumbs.length - 1 ? "current" : ""}
                onClick={() => onNavigate(crumb.path)}
                aria-label={crumb.path}
                title={crumb.path}
              >
                {index === 0 ? <Home size={13} /> : crumb.label}
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="panel-search">
        <Search size={14} />
        <input
          ref={searchRef}
          data-panel-search={side}
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={t("filterPlaceholder")}
          aria-label={t("filterFiles")}
        />
        {query && (
          <button
            onClick={() => onQuery("")}
            aria-label={t("clearFilter")}
            title={t("clearFilter")}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {!grid && (
        <div className="file-columns">
          {sortColumns.map(({ column, label }) => {
            const active = sortColumn === column;
            const nextDirection: SortDirection =
              active && sortDirection === "asc" ? "desc" : "asc";
            const tooltip = t(
              nextDirection === "asc" ? "sortAscending" : "sortDescending",
              { column: label },
            );
            return (
              <button
                type="button"
                className={active ? "active" : ""}
                key={column}
                onClick={() => toggleSort(column)}
                aria-label={tooltip}
                aria-pressed={active}
                title={tooltip}
              >
                <span>{label}</span>
                {active &&
                  (sortDirection === "asc" ? (
                    <ChevronUp size={11} />
                  ) : (
                    <ChevronDown size={11} />
                  ))}
              </button>
            );
          })}
        </div>
      )}

      <div
        className={`file-list ${grid ? "grid" : ""}`}
        data-side={side}
      >
        {loading && entries.length === 0 ? (
          <div className="panel-empty">
            <LoaderCircle className="spin" size={22} />
            <span>{t("loadingContents")}</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="panel-empty">
            <FolderOpen size={28} />
            <strong>
              {query ? t("noMatchingFiles") : t("emptyFolder")}
            </strong>
            <span>
              {query
                ? t("clearFilterHint")
                : t("emptyFolderHint")}
            </span>
          </div>
        ) : (
          entries.map((entry) => {
            const isSelected = selected.has(entry.id);
            const isCursor = cursorId === entry.id;
            return (
              <button
                type="button"
                className={`file-row ${isSelected ? "selected" : ""} ${isCursor ? "cursor" : ""}`}
                key={entry.id}
                ref={(element) => {
                  if (element) rowRefs.current.set(entry.id, element);
                  else rowRefs.current.delete(entry.id);
                }}
                tabIndex={-1}
                aria-current={isCursor ? "true" : undefined}
                aria-pressed={isSelected}
                onClick={(event) => onSelect(entry, event)}
                onContextMenu={(event) => onContextMenu(entry, event)}
                onDoubleClick={() => {
                  if (entry.kind === "directory") onNavigate(entry.path);
                  else onOpen?.(entry);
                }}
                title={entry.path}
              >
                <span className="file-name">
                  <FileGlyph entry={entry} side={side} serial={serial} />
                  <span className="file-label">
                    <strong>{entry.name}</strong>
                    {grid && (
                      <small>
                        {entry.kind === "directory"
                          ? t("folder")
                          : `${entry.extension.toUpperCase()} · ${formatBytes(entry.size)}`}
                      </small>
                    )}
                  </span>
                </span>
                {!grid && (
                  <>
                    <span className="file-type">
                      {entry.kind === "directory"
                        ? t("folder")
                        : entry.extension.toUpperCase() || t("file")}
                    </span>
                    <span className="file-size">
                      {entry.kind === "directory" ? "—" : formatBytes(entry.size)}
                    </span>
                    <span className="file-date">
                      {formatDate(entry.modifiedAt, language)}
                    </span>
                  </>
                )}
                {grid && isSelected && (
                  <span className="grid-check">
                    <Check size={12} />
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      <footer className="panel-footer">
        <span>
          {selected.size > 0
            ? t("selectedSummary", {
                count: selected.size,
                size: formatBytes(selectedSize),
              })
            : t("itemCount", { count: entries.length })}
        </span>
        <span>
          {listing.freeBytes !== undefined
            ? t("freeSpace", { size: formatBytes(listing.freeBytes) })
            : t("capacityUnavailable")}
        </span>
      </footer>
    </section>
  );
}

function TransferRail({
  hasDevice,
  localCount,
  deviceCount,
  onCopy,
  onAnalyzeUpdate,
}: {
  hasDevice: boolean;
  localCount: number;
  deviceCount: number;
  onCopy(direction: TransferDirection): void;
  onAnalyzeUpdate(direction: TransferDirection): void;
}) {
  const { t } = useI18n();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const chooseUpdate = (direction: TransferDirection) => {
    setAdvancedOpen(false);
    onAnalyzeUpdate(direction);
  };

  return (
    <aside className="transfer-rail" aria-label={t("transferActions")}>
      <span className="rail-line" />
      <button
        className="transfer-button primary"
        disabled={!hasDevice || localCount === 0}
        onClick={() => onCopy("push")}
        title={t("copyToAndroid")}
        aria-label={t("copyToAndroid")}
      >
        <ArrowRight size={18} />
        {localCount > 0 && <b>{localCount}</b>}
      </button>
      <button
        className="transfer-button"
        disabled={!hasDevice || deviceCount === 0}
        onClick={() => onCopy("pull")}
        title={t("copyToMac")}
        aria-label={t("copyToMac")}
      >
        <ArrowLeft size={18} />
        {deviceCount > 0 && <b>{deviceCount}</b>}
      </button>
      <div className="rail-divider" />
      <button
        className={`advanced-button ${advancedOpen ? "active" : ""}`}
        disabled={!hasDevice}
        onClick={() => setAdvancedOpen((current) => !current)}
        title={t("advancedTransfers")}
        aria-label={t("advancedTransfers")}
        aria-expanded={advancedOpen}
      >
        <Sparkles size={15} />
      </button>
      {advancedOpen && (
        <div className="advanced-menu" role="menu">
          <div className="advanced-menu-heading">
            <span>
              <Sparkles size={14} />
            </span>
            <div>
              <strong>{t("incrementalUpdate")}</strong>
              <small>{t("analyzeFirst")}</small>
            </div>
          </div>
          <p>{t("updateDescription")}</p>
          <button role="menuitem" onClick={() => chooseUpdate("push")}>
            <span>
              <Monitor size={15} />
              <ArrowRight size={12} />
              <Smartphone size={15} />
            </span>
            <div>
              <strong>{t("updateToAndroid")}</strong>
              <small>{t("macToAndroid")}</small>
            </div>
            <ChevronRight size={14} />
          </button>
          <button role="menuitem" onClick={() => chooseUpdate("pull")}>
            <span>
              <Smartphone size={15} />
              <ArrowRight size={12} />
              <Monitor size={15} />
            </span>
            <div>
              <strong>{t("updateToMac")}</strong>
              <small>{t("androidToMac")}</small>
            </div>
            <ChevronRight size={14} />
          </button>
          <div className="advanced-safe-note">
            <Info size={12} />
            {t("noFilesDeleted")}
          </div>
        </div>
      )}
      <span className="rail-line" />
    </aside>
  );
}

interface EntryContextMenuState {
  side: PanelSide;
  entry: FileEntry;
  x: number;
  y: number;
}

function EntryContextMenu({
  state,
  deviceName,
  hasDevice,
  onReveal,
  onTransfer,
}: {
  state: EntryContextMenuState;
  deviceName: string;
  hasDevice: boolean;
  onReveal(): void;
  onTransfer(direction: TransferDirection): void;
}) {
  const { t } = useI18n();
  const EntryIcon = KIND_ICON[state.entry.kind];

  return (
    <div
      className="entry-context-menu"
      role="menu"
      aria-label={t("fileActions")}
      style={{ left: state.x, top: state.y }}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="entry-context-heading">
        <span className={`file-glyph kind-${state.entry.kind}`}>
          <EntryIcon size={16} />
        </span>
        <strong>{state.entry.name}</strong>
      </div>
      {state.side === "local" ? (
        <>
          <button role="menuitem" onClick={onReveal}>
            <FolderOpen size={15} />
            <span>{t("showInFinder")}</span>
          </button>
          {hasDevice && (
            <button role="menuitem" onClick={() => onTransfer("push")}>
              <Smartphone size={15} />
              <span>{t("transferToDevice", { device: deviceName })}</span>
            </button>
          )}
        </>
      ) : (
        <button
          role="menuitem"
          disabled={!hasDevice}
          onClick={() => onTransfer("pull")}
        >
          <Monitor size={15} />
          <span>{t("contextCopyToMac")}</span>
        </button>
      )}
    </div>
  );
}

function TransferQueue({
  transfers,
  onClear,
  onCancel,
  onRetry,
  onShowError,
  queueRef,
}: {
  transfers: TransferProgress[];
  onClear(): void;
  onCancel(id: string): void;
  onRetry(id: string): void;
  onShowError(transfer: TransferProgress): void;
  queueRef: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  const activeCount = transfers.filter(
    (transfer) => transfer.status === "running",
  ).length;
  return (
    <section
      className="queue"
      ref={queueRef}
      tabIndex={-1}
      aria-label={t("transfers")}
    >
      <header className="queue-heading">
        <div>
          <span className="queue-icon">
            <Zap size={14} />
          </span>
          <strong>{t("transfers")}</strong>
          {activeCount > 0 && (
            <b>{t("activeTransfers", { count: activeCount })}</b>
          )}
        </div>
        <div className="queue-meta">
          <span>
            <Sparkles size={13} />
            {t("tarFastPath")}
          </span>
          {transfers.length > 0 && (
            <button onClick={onClear}>{t("clearCompleted")}</button>
          )}
        </div>
      </header>
      <div className="queue-items">
        {transfers.length === 0 ? (
          <div className="queue-empty">
            <ArrowLeftRight size={18} />
            <span>
              <strong>{t("queueReady")}</strong>
              {t("queueHint")}
            </span>
            <kbd>F5</kbd>
            <small>{t("copyFromActive")}</small>
          </div>
        ) : (
          transfers.slice(0, 5).map((transfer) => (
            <article className="queue-item" key={transfer.id}>
              <span
                className={`queue-status status-${transfer.status}`}
                aria-hidden="true"
              >
                {transfer.status === "running" && (
                  <LoaderCircle className="spin" size={15} />
                )}
                {transfer.status === "completed" && <Check size={15} />}
                {transfer.status === "failed" && <CircleAlert size={15} />}
                {transfer.status === "cancelled" && <X size={15} />}
              </span>
              <div className="queue-copy">
                <div>
                  <strong>{transfer.title}</strong>
                  <span>{transfer.detail}</span>
                </div>
                {(transfer.currentFile ||
                  transfer.speedBytesPerSecond !== undefined) && (
                  <div className="queue-live-meta">
                    {transfer.currentFile && <span>{transfer.currentFile}</span>}
                    {transfer.speedBytesPerSecond !== undefined && (
                      <small>
                        {t("speedAndEta", {
                          speed: formatBytes(transfer.speedBytesPerSecond),
                          eta: formatDuration(
                            transfer.estimatedSecondsRemaining,
                          ),
                        })}
                      </small>
                    )}
                  </div>
                )}
                <div className="progress-track">
                  <span style={{ width: `${transfer.percent}%` }} />
                </div>
              </div>
              <div className="queue-tail">
                <span className="queue-percent">
                  {transfer.status === "failed"
                    ? t("failed")
                    : transfer.status === "cancelled"
                      ? t("cancelled")
                      : `${transfer.percent}%`}
                </span>
                <div className="queue-actions">
                  {transfer.status === "running" && (
                    <button
                      onClick={() => onCancel(transfer.id)}
                      aria-label={t("cancelTransfer")}
                      title={t("cancelTransfer")}
                    >
                      <X size={12} />
                    </button>
                  )}
                  {(transfer.status === "failed" ||
                    transfer.status === "cancelled") &&
                    transfer.canRetry && (
                      <button
                        onClick={() => onRetry(transfer.id)}
                        aria-label={t("retryTransfer")}
                        title={t("retryTransfer")}
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                  {transfer.error && (
                    <button
                      onClick={() => onShowError(transfer)}
                      aria-label={t("showError")}
                      title={t("showError")}
                    >
                      <Info size={12} />
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

interface DialogState {
  kind: "folder" | "rename";
  side: PanelSide;
  initialValue: string;
}

function NameDialog({
  state,
  busy,
  onClose,
  onSubmit,
}: {
  state: DialogState;
  busy: boolean;
  onClose(): void;
  onSubmit(value: string): void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(state.initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="dialog"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) onSubmit(value.trim());
        }}
      >
        <span className="dialog-icon">
          {state.kind === "folder" ? <FolderPlus size={20} /> : <Pencil size={18} />}
        </span>
        <div className="dialog-title">
          <strong>
            {state.kind === "folder" ? t("createFolder") : t("rename")}
          </strong>
          <span>
            {state.side === "local"
              ? t("onThisMac")
              : t("onSelectedAndroid")}
          </span>
        </div>
        <label>
          {t("name")}
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="off"
          />
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            {t("cancel")}
          </button>
          <button className="confirm" disabled={!value.trim() || busy}>
            {busy && <LoaderCircle className="spin" size={14} />}
            {state.kind === "folder" ? t("create") : t("save")}
          </button>
        </div>
      </form>
    </div>
  );
}

interface CopyPreviewState {
  request: TransferRequest;
  analysis: TransferAnalysis | null;
}

function CopyDialog({
  state,
  onClose,
  onConfirm,
}: {
  state: CopyPreviewState;
  onClose(): void;
  onConfirm(
    policy: ConflictPolicy,
    decisions: Record<string, ConflictPolicy>,
  ): void;
}) {
  const { t } = useI18n();
  const [policy, setPolicy] = useState<ConflictPolicy>("overwrite");
  const [decisions, setDecisions] = useState<
    Record<string, ConflictPolicy>
  >({});
  const { analysis, request } = state;
  const destinationLabel =
    request.direction === "push" ? "Android" : "This Mac";
  const sourceLabel = request.direction === "push" ? "This Mac" : "Android";
  const conflictCount = analysis?.conflicts.length ?? 0;
  const currentConflict =
    analysis?.conflicts.find((conflict) => decisions[conflict.source] === undefined) ??
    analysis?.conflicts[0];
  const decideCurrent = (decision: ConflictPolicy) => {
    if (!currentConflict) return;
    setDecisions((current) => ({
      ...current,
      [currentConflict.source]: decision,
    }));
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="update-dialog copy-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="copy-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          const targetButton =
            event.target instanceof HTMLElement
              ? event.target.closest("button")
              : null;
          if (
            event.key === "Enter" &&
            analysis &&
            (!targetButton || targetButton.classList.contains("confirm"))
          ) {
            event.preventDefault();
            onConfirm(policy, decisions);
          }
        }}
      >
        <header className="update-dialog-heading">
          <span className="dialog-icon">
            <Copy size={19} />
          </span>
          <div>
            <strong id="copy-dialog-title">{t("copyTitle")}</strong>
            <span>
              {sourceLabel} → {destinationLabel}
            </span>
          </div>
          <button
            className="update-close"
            onClick={onClose}
            aria-label={t("close")}
            title={t("close")}
          >
            <X size={15} />
          </button>
        </header>

        {!analysis ? (
          <div className="update-analyzing">
            <span>
              <LoaderCircle className="spin" size={24} />
            </span>
            <div>
              <strong>{t("analyzingTransfer")}</strong>
            </div>
          </div>
        ) : (
          <>
            <div className="update-route">
              <div>
                <small>{t("sourceFolder")}</small>
                <strong>{sourceLabel}</strong>
              </div>
              <ArrowRight size={16} />
              <div>
                <small>{t("destinationFolder")}</small>
                <strong title={request.destination}>
                  {request.destination}
                </strong>
              </div>
            </div>
            <div className="update-review-label">{t("reviewUpdate")}</div>
            <div className="update-metrics copy-metrics">
              <div>
                <span>{analysis.sourceCount}</span>
                <small>{t("itemsToCopy")}</small>
              </div>
              <div>
                <span>{analysis.fileCount}</span>
                <small>{t("filesToCopy")}</small>
              </div>
              <div>
                <span>{analysis.directoryCount}</span>
                <small>{t("foldersToCopy")}</small>
              </div>
              <div className={conflictCount > 0 ? "changed" : ""}>
                <span>{formatBytes(analysis.totalBytes)}</span>
                <small>{t("dataToCopy")}</small>
              </div>
            </div>

            {analysis.insufficientSpace && (
              <div className="update-warning">
                <CircleAlert size={18} />
                <div>
                  <strong>{t("notEnoughSpace")}</strong>
                  <p>
                    {t("spaceComparison", {
                      needed: formatBytes(analysis.totalBytes),
                      free: formatBytes(analysis.destinationFreeBytes),
                    })}
                  </p>
                </div>
              </div>
            )}

            <div className={`conflict-review ${conflictCount > 0 ? "has-conflicts" : ""}`}>
              <div>
                <strong>
                  {conflictCount > 0
                    ? t("conflictHint", { count: conflictCount })
                    : t("noConflicts")}
                </strong>
                {conflictCount > 0 && (
                  <span>
                    {currentConflict
                      ? t("conflictDecision", { name: currentConflict.name })
                      : analysis.conflicts
                          .slice(0, 3)
                          .map((conflict) => conflict.name)
                          .join(" · ")}
                  </span>
                )}
              </div>
              {conflictCount > 0 && (
                <div className="conflict-policy" role="group" aria-label={t("conflicts")}>
                  <button
                    className={
                      currentConflict &&
                      (decisions[currentConflict.source] ?? policy) ===
                        "overwrite"
                        ? "selected"
                        : ""
                    }
                    onClick={() => decideCurrent("overwrite")}
                  >
                    {t("replace")}
                  </button>
                  <button
                    className={
                      currentConflict &&
                      (decisions[currentConflict.source] ?? policy) === "skip"
                        ? "selected"
                        : ""
                    }
                    onClick={() => decideCurrent("skip")}
                  >
                    {t("skip")}
                  </button>
                  {conflictCount > 1 && (
                    <>
                      <button
                        className={
                          policy === "overwrite" &&
                          Object.keys(decisions).length === 0
                            ? "selected"
                            : ""
                        }
                        onClick={() => {
                          setPolicy("overwrite");
                          setDecisions({});
                        }}
                      >
                        {t("replaceAll")}
                      </button>
                      <button
                        className={
                          policy === "skip" &&
                          Object.keys(decisions).length === 0
                            ? "selected"
                            : ""
                        }
                        onClick={() => {
                          setPolicy("skip");
                          setDecisions({});
                        }}
                      >
                        {t("skipAll")}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="update-safe-note">
              <Info size={14} />
              <span>{t("copySafeNote")}</span>
            </div>
          </>
        )}

        <div className="update-dialog-actions">
          <button type="button" onClick={onClose}>
            {t("cancel")}
          </button>
          <button
            key={analysis ? "ready" : "loading"}
            type="button"
            className="confirm"
            disabled={!analysis}
            autoFocus={Boolean(analysis)}
            onClick={() => onConfirm(policy, decisions)}
          >
            <ArrowRight size={14} />
            {t("startCopy")}
          </button>
        </div>
      </section>
    </div>
  );
}

function HelpDialog({ onClose }: { onClose(): void }) {
  const { t } = useI18n();
  const sections = [
    ["navigation", t("helpNavigation")],
    ["selection", t("helpSelection")],
    ["operations", t("helpOperations")],
    ["search", t("helpSearch")],
  ] as const;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className="dialog-icon">
            <CircleHelp size={20} />
          </span>
          <div>
            <strong id="help-dialog-title">{t("keyboardWorkflow")}</strong>
            <p>{t("helpIntro")}</p>
          </div>
          <button onClick={onClose} aria-label={t("close")}>
            <X size={15} />
          </button>
        </header>
        <div className="help-sections">
          {sections.map(([key, description]) => (
            <article key={key}>
              <strong>{t(key)}</strong>
              <p>{description}</p>
            </article>
          ))}
        </div>
        <footer>
          <kbd>F1</kbd>
          <span>{t("help")}</span>
          <button autoFocus onClick={onClose}>{t("close")}</button>
        </footer>
      </section>
    </div>
  );
}

function ErrorDialog({
  transfer,
  onClose,
}: {
  transfer: TransferProgress;
  onClose(): void;
}) {
  const { t } = useI18n();
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="error-dialog"
        role="alertdialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CircleAlert size={24} />
        <div>
          <strong>{t("transferError")}</strong>
          <span>{transfer.title}</span>
          <pre>{transfer.error}</pre>
        </div>
        <button autoFocus onClick={onClose}>{t("close")}</button>
      </section>
    </div>
  );
}

interface UpdatePreviewState {
  request: IncrementalUpdateRequest;
  analysis: IncrementalUpdateAnalysis | null;
  starting: boolean;
}

function UpdateDialog({
  state,
  onClose,
  onConfirm,
}: {
  state: UpdatePreviewState;
  onClose(): void;
  onConfirm(): void;
}) {
  const { language, t } = useI18n();
  const { analysis, request, starting } = state;
  const sourcePath =
    request.direction === "push" ? request.localRoot : request.deviceRoot;
  const destinationPath =
    request.direction === "push" ? request.deviceRoot : request.localRoot;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="update-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="update-dialog-heading">
          <span className="dialog-icon">
            <Sparkles size={20} />
          </span>
          <div>
            <strong id="update-dialog-title">{t("incrementalUpdate")}</strong>
            <span>
              {request.direction === "push"
                ? t("macToAndroid")
                : t("androidToMac")}
            </span>
          </div>
          <button
            className="update-close"
            onClick={onClose}
            aria-label={t("close")}
            title={t("close")}
            disabled={starting}
          >
            <X size={15} />
          </button>
        </header>

        {!analysis ? (
          <div className="update-analyzing">
            <span>
              <LoaderCircle className="spin" size={24} />
            </span>
            <div>
              <strong>{t("analyzingFolders")}</strong>
              <p>{t("analyzingFoldersHint")}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="update-route">
              <div>
                <small>{t("sourceFolder")}</small>
                <strong title={sourcePath}>{sourcePath}</strong>
              </div>
              <ArrowRight size={16} />
              <div>
                <small>{t("destinationFolder")}</small>
                <strong title={destinationPath}>{destinationPath}</strong>
              </div>
            </div>

            <div className="update-review-label">{t("reviewUpdate")}</div>
            <div className="update-metrics">
              <div>
                <span>{analysis.scannedFiles.toLocaleString(language)}</span>
                <small>{t("scannedFiles")}</small>
              </div>
              <div className="changed">
                <span>{analysis.changedFiles.toLocaleString(language)}</span>
                <small>{t("changedFiles")}</small>
              </div>
              <div>
                <span>{formatBytes(analysis.changedBytes)}</span>
                <small>{t("dataToCopy")}</small>
              </div>
              <div>
                <span>{analysis.unchangedFiles.toLocaleString(language)}</span>
                <small>{t("unchangedFiles")}</small>
              </div>
            </div>

            {analysis.warningReasons.length > 0 && (
              <div className="update-warning">
                <CircleAlert size={18} />
                <div>
                  <strong>{t("largeUpdateWarning")}</strong>
                  <ul>
                    {analysis.warningReasons.map((reason) => (
                      <li key={reason}>
                        {reason === "changed-bytes"
                          ? t("changedDataWarning", {
                              size: formatBytes(analysis.changedBytes),
                            })
                          : reason === "many-files"
                            ? t("manyFilesWarning", {
                                count:
                                  analysis.scannedFiles.toLocaleString(language),
                              })
                            : t("broadRootWarning")}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div className="update-safe-note">
              <Check size={14} />
              <span>{t("noFilesDeleted")}</span>
            </div>
          </>
        )}

        <div className="update-dialog-actions">
          <button type="button" onClick={onClose} disabled={starting}>
            {analysis?.changedFiles === 0 ? t("close") : t("cancel")}
          </button>
          {analysis && (
            <button
              type="button"
              className="confirm"
              disabled={analysis.changedFiles === 0 || starting}
              autoFocus
              onClick={onConfirm}
            >
              {starting ? (
                <LoaderCircle className="spin" size={14} />
              ) : analysis.changedFiles === 0 ? (
                <Check size={14} />
              ) : (
                <ArrowRight size={14} />
              )}
              {analysis.changedFiles === 0
                ? t("everythingUpToDate")
                : t("copyChangedFiles")}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function BridgeUnavailable() {
  const { t } = useI18n();
  return (
    <main className="bridge-unavailable">
      <div className="bridge-unavailable-card">
        <span className="bridge-unavailable-icon">
          <CircleAlert size={24} />
        </span>
        <div>
          <strong>{t("desktopBridgeMissing")}</strong>
          <p>{t("desktopBridgeMissingBody")}</p>
        </div>
        <button onClick={() => window.location.reload()}>
          <RefreshCw size={15} />
          {t("tryAgain")}
        </button>
        <small>
          {t("demoModeHint", { query: "?demo=1" })}
        </small>
      </div>
    </main>
  );
}

interface PanelPreferences {
  showHidden: boolean;
  grid: boolean;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
}

interface AppPreferences {
  localPath?: string;
  devicePath?: string;
  selectedSerial?: string;
  local: PanelPreferences;
  device: PanelPreferences;
}

interface NavigationHistory {
  paths: string[];
  index: number;
}

interface LoadOptions {
  recordHistory?: boolean;
  preserveSelection?: boolean;
  preserveCursor?: boolean;
}

const PREFERENCES_KEY = "adb-commander-preferences-v1";
const DEFAULT_PANEL_PREFERENCES: PanelPreferences = {
  showHidden: false,
  grid: false,
  sortColumn: "name",
  sortDirection: "asc",
};
const DEFAULT_PREFERENCES: AppPreferences = {
  local: { ...DEFAULT_PANEL_PREFERENCES },
  device: { ...DEFAULT_PANEL_PREFERENCES },
};

function loadPreferences(): AppPreferences {
  try {
    const stored = window.localStorage.getItem(PREFERENCES_KEY);
    if (!stored) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(stored) as Partial<AppPreferences>;
    return {
      localPath:
        typeof parsed.localPath === "string" ? parsed.localPath : undefined,
      devicePath:
        typeof parsed.devicePath === "string" ? parsed.devicePath : undefined,
      selectedSerial:
        typeof parsed.selectedSerial === "string"
          ? parsed.selectedSerial
          : undefined,
      local: {
        ...DEFAULT_PANEL_PREFERENCES,
        ...(parsed.local ?? {}),
      },
      device: {
        ...DEFAULT_PANEL_PREFERENCES,
        ...(parsed.device ?? {}),
      },
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function addHistoryPath(
  current: NavigationHistory,
  nextPath: string,
): NavigationHistory {
  if (current.paths[current.index] === nextPath) return current;
  const paths = [...current.paths.slice(0, current.index + 1), nextPath].slice(
    -60,
  );
  return { paths, index: paths.length - 1 };
}

function BridgeCommanderApp() {
  const { language, t } = useI18n();
  const initialPreferencesRef = useRef<AppPreferences>(loadPreferences());
  const initialPreferences = initialPreferencesRef.current;
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedSerial, setSelectedSerial] = useState(
    initialPreferences.selectedSerial ?? "",
  );
  const [localListing, setLocalListing] =
    useState<DirectoryListing>(EMPTY_LISTING);
  const [deviceListing, setDeviceListing] =
    useState<DirectoryListing>(EMPTY_LISTING);
  const [localLoading, setLocalLoading] = useState(true);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [deviceLoadingList, setDeviceLoadingList] = useState(true);
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set());
  const [deviceSelected, setDeviceSelected] = useState<Set<string>>(new Set());
  const [localCursor, setLocalCursor] = useState<string | null>(null);
  const [deviceCursor, setDeviceCursor] = useState<string | null>(null);
  const localSelectionAnchorRef = useRef<string | null>(null);
  const deviceSelectionAnchorRef = useRef<string | null>(null);
  const [activeSide, setActiveSide] = useState<PanelSide>("local");
  const [localQuery, setLocalQuery] = useState("");
  const [deviceQuery, setDeviceQuery] = useState("");
  const [localHidden, setLocalHidden] = useState(
    initialPreferences.local.showHidden,
  );
  const [deviceHidden, setDeviceHidden] = useState(
    initialPreferences.device.showHidden,
  );
  const [localGrid, setLocalGrid] = useState(initialPreferences.local.grid);
  const [deviceGrid, setDeviceGrid] = useState(initialPreferences.device.grid);
  const [localSortColumn, setLocalSortColumn] = useState<SortColumn>(
    initialPreferences.local.sortColumn,
  );
  const [localSortDirection, setLocalSortDirection] = useState<SortDirection>(
    initialPreferences.local.sortDirection,
  );
  const [deviceSortColumn, setDeviceSortColumn] = useState<SortColumn>(
    initialPreferences.device.sortColumn,
  );
  const [deviceSortDirection, setDeviceSortDirection] =
    useState<SortDirection>(initialPreferences.device.sortDirection);
  const [searchRequest, setSearchRequest] = useState({ local: 0, device: 0 });
  const [transfers, setTransfers] = useState<TransferProgress[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [updatePreview, setUpdatePreview] =
    useState<UpdatePreviewState | null>(null);
  const [copyPreview, setCopyPreview] = useState<CopyPreviewState | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [errorTransfer, setErrorTransfer] =
    useState<TransferProgress | null>(null);
  const [entryContextMenu, setEntryContextMenu] =
    useState<EntryContextMenuState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<{
    tone: "info" | "error" | "success";
    text: string;
  } | null>(null);
  const localHomeRef = useRef("");
  const deviceHomeRef = useRef("/sdcard");
  const [localHistory, setLocalHistory] = useState<NavigationHistory>({
    paths: [],
    index: -1,
  });
  const [deviceHistory, setDeviceHistory] = useState<NavigationHistory>({
    paths: [],
    index: -1,
  });
  const queueRef = useRef<HTMLElement>(null);
  const deviceSelectRef = useRef<HTMLSelectElement>(null);
  const typeAheadRef = useRef({ text: "", timer: 0 });
  const restoredDevicePathRef = useRef(false);
  const loadedDeviceSerialRef = useRef("");
  const updateAnalysisAttemptRef = useRef(0);
  const copyAnalysisAttemptRef = useRef(0);

  const selectedDevice = devices.find(
    (device) => device.serial === selectedSerial,
  );
  const selectedDeviceName = selectedDevice
    ? [selectedDevice.manufacturer, selectedDevice.model]
        .filter(Boolean)
        .join(" ")
    : t("android");

  const localEntries = useMemo(
    () =>
      visibleEntriesFor(
        localListing,
        localQuery,
        localHidden,
        localSortColumn,
        localSortDirection,
      ),
    [
      localHidden,
      localListing,
      localQuery,
      localSortColumn,
      localSortDirection,
    ],
  );
  const deviceEntries = useMemo(
    () =>
      visibleEntriesFor(
        deviceListing,
        deviceQuery,
        deviceHidden,
        deviceSortColumn,
        deviceSortDirection,
      ),
    [
      deviceHidden,
      deviceListing,
      deviceQuery,
      deviceSortColumn,
      deviceSortDirection,
    ],
  );

  const showToast = useCallback(
    (text: string, tone: "info" | "error" | "success" = "info") => {
      setToast({ text, tone });
      window.setTimeout(() => setToast(null), 4200);
    },
    [],
  );

  useEffect(() => {
    document.documentElement.lang = "en";
    window.localStorage.removeItem("adb-commander-language");
  }, []);

  useEffect(() => {
    setLocalCursor((current) =>
      current && localEntries.some((entry) => entry.id === current)
        ? current
        : localEntries[0]?.id ?? null,
    );
  }, [localEntries]);

  useEffect(() => {
    setDeviceCursor((current) =>
      current && deviceEntries.some((entry) => entry.id === current)
        ? current
        : deviceEntries[0]?.id ?? null,
    );
  }, [deviceEntries]);

  useEffect(() => {
    const preferences: AppPreferences = {
      localPath: localListing.path || initialPreferences.localPath,
      devicePath: deviceListing.path || initialPreferences.devicePath,
      selectedSerial,
      local: {
        showHidden: localHidden,
        grid: localGrid,
        sortColumn: localSortColumn,
        sortDirection: localSortDirection,
      },
      device: {
        showHidden: deviceHidden,
        grid: deviceGrid,
        sortColumn: deviceSortColumn,
        sortDirection: deviceSortDirection,
      },
    };
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  }, [
    deviceGrid,
    deviceHidden,
    deviceListing.path,
    deviceSortColumn,
    deviceSortDirection,
    initialPreferences.devicePath,
    initialPreferences.localPath,
    localGrid,
    localHidden,
    localListing.path,
    localSortColumn,
    localSortDirection,
    selectedSerial,
  ]);

  const refreshDevices = useCallback(async () => {
    setDeviceLoadingList(true);
    try {
      const nextDevices = await bridge.listDevices();
      setDevices(nextDevices);
      setSelectedSerial((current) => {
        if (nextDevices.some((device) => device.serial === current)) return current;
        return nextDevices.find((device) => device.state === "device")?.serial ?? "";
      });
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : t("adbStartFailed"),
        "error",
      );
    } finally {
      setDeviceLoadingList(false);
    }
  }, [showToast, t]);

  const loadLocal = useCallback(
    async (requestedPath?: string, options: LoadOptions = {}) => {
      setLocalLoading(true);
      try {
        const listing = await bridge.listLocal(
          requestedPath || localListing.path || undefined,
        );
        if (!localHomeRef.current) {
          localHomeRef.current = listing.homePath || listing.path;
        }
        setLocalListing(listing);
        if (!options.preserveSelection) setLocalSelected(new Set());
        const nextEntries = visibleEntriesFor(
          listing,
          localQuery,
          localHidden,
          localSortColumn,
          localSortDirection,
        );
        setLocalCursor((current) =>
          options.preserveCursor &&
          current &&
          nextEntries.some((entry) => entry.id === current)
            ? current
            : nextEntries[0]?.id ?? null,
        );
        localSelectionAnchorRef.current = nextEntries[0]?.id ?? null;
        if (options.recordHistory !== false) {
          setLocalHistory((current) => addHistoryPath(current, listing.path));
        }
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : t("folderOpenFailed"),
          "error",
        );
      } finally {
        setLocalLoading(false);
      }
    },
    [
      localHidden,
      localListing.path,
      localQuery,
      localSortColumn,
      localSortDirection,
      showToast,
      t,
    ],
  );

  const loadDevice = useCallback(
    async (requestedPath?: string, options: LoadOptions = {}) => {
      if (!selectedSerial) {
        setDeviceListing(EMPTY_LISTING);
        return;
      }
      setDeviceLoading(true);
      try {
        const listing = await bridge.listDevice(
          selectedSerial,
          requestedPath || deviceListing.path || deviceHomeRef.current,
        );
        deviceHomeRef.current = listing.homePath || "/sdcard";
        setDeviceListing(listing);
        if (!options.preserveSelection) setDeviceSelected(new Set());
        const nextEntries = visibleEntriesFor(
          listing,
          deviceQuery,
          deviceHidden,
          deviceSortColumn,
          deviceSortDirection,
        );
        setDeviceCursor((current) =>
          options.preserveCursor &&
          current &&
          nextEntries.some((entry) => entry.id === current)
            ? current
            : nextEntries[0]?.id ?? null,
        );
        deviceSelectionAnchorRef.current = nextEntries[0]?.id ?? null;
        if (options.recordHistory !== false) {
          setDeviceHistory((current) => addHistoryPath(current, listing.path));
        }
      } catch (error) {
        showToast(
          error instanceof Error
            ? error.message
            : t("deviceReadFailed"),
          "error",
        );
      } finally {
        setDeviceLoading(false);
      }
    },
    [
      deviceHidden,
      deviceListing.path,
      deviceQuery,
      deviceSortColumn,
      deviceSortDirection,
      selectedSerial,
      showToast,
      t,
    ],
  );

  useEffect(() => {
    void refreshDevices();
    void loadLocal(initialPreferences.localPath);
    // Initial application load intentionally runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () =>
      bridge.onTransferProgress((progress) => {
        setTransfers((current) => {
          const withoutUpdated = current.filter(
            (item) => item.id !== progress.id,
          );
          return [progress, ...withoutUpdated];
        });
        if (progress.status === "completed") {
          window.setTimeout(() => {
            void loadLocal(undefined, {
              recordHistory: false,
              preserveSelection: true,
              preserveCursor: true,
            });
            if (selectedSerial) {
              void loadDevice(undefined, {
                recordHistory: false,
                preserveSelection: true,
                preserveCursor: true,
              });
            }
          }, 250);
        }
        if (progress.status === "failed") {
          showToast(progress.error || t("transferFailed"), "error");
        }
      }),
    [loadDevice, loadLocal, selectedSerial, showToast, t],
  );

  useEffect(() => {
    if (!selectedSerial) {
      loadedDeviceSerialRef.current = "";
      setDeviceListing(EMPTY_LISTING);
      setDeviceCursor(null);
      setDeviceSelected(new Set());
      return;
    }
    if (!devices.some((device) => device.serial === selectedSerial)) return;
    if (loadedDeviceSerialRef.current === selectedSerial) return;
    loadedDeviceSerialRef.current = selectedSerial;
    const restoredPath =
      !restoredDevicePathRef.current &&
      selectedSerial === initialPreferences.selectedSerial
        ? initialPreferences.devicePath
        : undefined;
    restoredDevicePathRef.current = true;
    void loadDevice(restoredPath || deviceHomeRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices, selectedSerial]);

  useEffect(() => {
    const closeContextMenu = () => setEntryContextMenu(null);
    window.addEventListener("mousedown", closeContextMenu);
    window.addEventListener("blur", closeContextMenu);
    window.addEventListener("resize", closeContextMenu);
    window.addEventListener("scroll", closeContextMenu, true);
    return () => {
      window.removeEventListener("mousedown", closeContextMenu);
      window.removeEventListener("blur", closeContextMenu);
      window.removeEventListener("resize", closeContextMenu);
      window.removeEventListener("scroll", closeContextMenu, true);
    };
  }, []);

  const selectEntry = useCallback(
    (
      side: PanelSide,
      entry: FileEntry,
      event: ReactMouseEvent,
    ): void => {
      const setter = side === "local" ? setLocalSelected : setDeviceSelected;
      const setCursor = side === "local" ? setLocalCursor : setDeviceCursor;
      const entries = side === "local" ? localEntries : deviceEntries;
      const anchorRef =
        side === "local"
          ? localSelectionAnchorRef
          : deviceSelectionAnchorRef;
      setActiveSide(side);
      setCursor(entry.id);
      setter((current) => {
        if (event.shiftKey) {
          const anchorIndex = Math.max(
            0,
            entries.findIndex((item) => item.id === anchorRef.current),
          );
          const entryIndex = entries.findIndex((item) => item.id === entry.id);
          const [start, end] =
            anchorIndex <= entryIndex
              ? [anchorIndex, entryIndex]
              : [entryIndex, anchorIndex];
          return new Set(entries.slice(start, end + 1).map((item) => item.id));
        }
        if (event.metaKey || event.ctrlKey) {
          const next = new Set(current);
          if (next.has(entry.id)) next.delete(entry.id);
          else next.add(entry.id);
          anchorRef.current = entry.id;
          return next;
        }
        anchorRef.current = entry.id;
        return new Set();
      });
    },
    [deviceEntries, localEntries],
  );

  const queueTransfer = useCallback(
    async (
      direction: TransferDirection,
      sources: string[],
      conflictPolicy: ConflictPolicy = "overwrite",
    ) => {
      if (!selectedSerial) {
        showToast(t("selectDeviceFirst"), "error");
        return;
      }
      try {
        await bridge.transfer({
          direction,
          deviceSerial: selectedSerial,
          sources,
          destination:
            direction === "push" ? deviceListing.path : localListing.path,
          preferTar: true,
          conflictPolicy,
        });
        showToast(t("transferQueued"), "success");
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : t("transferQueueFailed"),
          "error",
        );
      }
    },
    [
      deviceListing.path,
      localListing.path,
      selectedSerial,
      showToast,
      t,
    ],
  );

  const previewTransfer = useCallback(
    async (direction: TransferDirection, sources: string[]) => {
      if (!selectedSerial) {
        showToast(t("selectDeviceFirst"), "error");
        return;
      }
      const request: TransferRequest = {
        direction,
        deviceSerial: selectedSerial,
        sources,
        destination:
          direction === "push" ? deviceListing.path : localListing.path,
        preferTar: true,
      };
      const attempt = copyAnalysisAttemptRef.current + 1;
      copyAnalysisAttemptRef.current = attempt;
      setCopyPreview({ request, analysis: null });
      try {
        const analysis = await bridge.analyzeTransfer(request);
        if (copyAnalysisAttemptRef.current !== attempt) return;
        setCopyPreview({ request, analysis });
      } catch (error) {
        if (copyAnalysisAttemptRef.current !== attempt) return;
        setCopyPreview(null);
        showToast(
          error instanceof Error ? error.message : t("transferAnalysisFailed"),
          "error",
        );
      }
    },
    [
      deviceListing.path,
      localListing.path,
      selectedSerial,
      showToast,
      t,
    ],
  );

  const closeCopyPreview = useCallback(() => {
    copyAnalysisAttemptRef.current += 1;
    setCopyPreview(null);
  }, []);

  const confirmCopy = useCallback(
    async (
      policy: ConflictPolicy,
      decisions: Record<string, ConflictPolicy>,
    ) => {
      if (!copyPreview?.analysis) return;
      let sources = copyPreview.request.sources;
      const skippedSources = new Set(
        copyPreview.analysis.conflicts
          .filter(
            (conflict) =>
              (decisions[conflict.source] ?? policy) === "skip",
          )
          .map((conflict) => conflict.source),
      );
      sources = sources.filter((source) => !skippedSources.has(source));
      const { direction } = copyPreview.request;
      closeCopyPreview();
      if (sources.length === 0) {
        showToast(t("nothingToCopy"), "info");
        return;
      }
      await queueTransfer(direction, sources, "overwrite");
    },
    [closeCopyPreview, copyPreview, queueTransfer, showToast, t],
  );

  const copy = useCallback(
    async (direction: TransferDirection) => {
      const sourceListing = direction === "push" ? localListing : deviceListing;
      const selected = direction === "push" ? localSelected : deviceSelected;
      const cursorId = direction === "push" ? localCursor : deviceCursor;
      let sources = sourceListing.entries
        .filter((entry) => selected.has(entry.id))
        .map((entry) => entry.path);
      if (sources.length === 0 && cursorId) {
        const cursorEntry = sourceListing.entries.find(
          (entry) => entry.id === cursorId,
        );
        if (cursorEntry) sources = [cursorEntry.path];
      }
      if (sources.length === 0) {
        showToast(t("selectFilesFirst"), "info");
        return;
      }
      await previewTransfer(direction, sources);
    },
    [
      deviceListing,
      deviceSelected,
      deviceCursor,
      localListing,
      localSelected,
      localCursor,
      previewTransfer,
      showToast,
      t,
    ],
  );

  const openEntryContextMenu = useCallback(
    (side: PanelSide, entry: FileEntry, event: ReactMouseEvent) => {
      event.preventDefault();
      setActiveSide(side);
      if (side === "local") {
        setLocalSelected(new Set([entry.id]));
        setLocalCursor(entry.id);
      } else {
        setDeviceSelected(new Set([entry.id]));
        setDeviceCursor(entry.id);
      }
      setEntryContextMenu({
        side,
        entry,
        x: Math.max(8, Math.min(event.clientX, window.innerWidth - 262)),
        y: Math.max(8, Math.min(event.clientY, window.innerHeight - 142)),
      });
    },
    [],
  );

  const openLocalEntry = useCallback(
    async (entry: FileEntry) => {
      try {
        await bridge.openLocal(entry.path);
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : t("openFileFailed"),
          "error",
        );
      }
    },
    [showToast, t],
  );

  const revealLocalEntry = useCallback(
    async (entry: FileEntry) => {
      try {
        await bridge.revealLocal(entry.path);
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : t("operationFailed"),
          "error",
        );
      }
    },
    [showToast, t],
  );

  const analyzeUpdate = useCallback(
    async (direction: TransferDirection) => {
      if (!selectedSerial) {
        showToast(t("selectDeviceFirst"), "error");
        return;
      }
      const request: IncrementalUpdateRequest = {
        direction,
        deviceSerial: selectedSerial,
        localRoot: localListing.path,
        deviceRoot: deviceListing.path,
      };
      const attempt = updateAnalysisAttemptRef.current + 1;
      updateAnalysisAttemptRef.current = attempt;
      setUpdatePreview({ request, analysis: null, starting: false });
      try {
        const analysis = await bridge.analyzeIncrementalUpdate(request);
        if (updateAnalysisAttemptRef.current !== attempt) return;
        setUpdatePreview({ request, analysis, starting: false });
      } catch (error) {
        if (updateAnalysisAttemptRef.current !== attempt) return;
        setUpdatePreview(null);
        showToast(
          error instanceof Error ? error.message : t("updateAnalysisFailed"),
          "error",
        );
      }
    },
    [deviceListing.path, localListing.path, selectedSerial, showToast, t],
  );

  const closeUpdatePreview = useCallback(() => {
    updateAnalysisAttemptRef.current += 1;
    setUpdatePreview(null);
  }, []);

  const confirmUpdate = useCallback(async () => {
    if (!updatePreview?.analysis || updatePreview.starting) return;
    setUpdatePreview((current) =>
      current ? { ...current, starting: true } : current,
    );
    try {
      await bridge.startIncrementalUpdate(updatePreview.analysis.id);
      setUpdatePreview(null);
      showToast(t("updateQueued"), "success");
    } catch (error) {
      setUpdatePreview((current) =>
        current ? { ...current, starting: false } : current,
      );
      showToast(
        error instanceof Error ? error.message : t("updateQueueFailed"),
        "error",
      );
    }
  }, [showToast, t, updatePreview]);

  const openNewFolder = useCallback(
    (side: PanelSide) =>
      setDialog({ kind: "folder", side, initialValue: t("newFolder") }),
    [t],
  );

  const openRename = useCallback(
    (side: PanelSide) => {
      const listing = side === "local" ? localListing : deviceListing;
      const selected = side === "local" ? localSelected : deviceSelected;
      if (selected.size > 1) {
        showToast(t("renameOneOnly"), "info");
        return;
      }
      const cursorId = side === "local" ? localCursor : deviceCursor;
      const entry =
        listing.entries.find((item) => selected.has(item.id)) ??
        listing.entries.find((item) => item.id === cursorId);
      if (entry) {
        if (side === "local") setLocalSelected(new Set([entry.id]));
        else setDeviceSelected(new Set([entry.id]));
        setDialog({ kind: "rename", side, initialValue: entry.name });
      }
    },
    [
      deviceCursor,
      deviceListing,
      deviceSelected,
      localCursor,
      localListing,
      localSelected,
      showToast,
      t,
    ],
  );

  const submitDialog = useCallback(
    async (value: string) => {
      if (!dialog) return;
      const listing = dialog.side === "local" ? localListing : deviceListing;
      const selected =
        dialog.side === "local" ? localSelected : deviceSelected;
      setDialogBusy(true);
      try {
        if (dialog.kind === "folder") {
          await bridge.createFolder(
            dialog.side,
            joinPath(dialog.side, listing.path, value),
            selectedSerial,
          );
        } else {
          const entry = listing.entries.find((item) => selected.has(item.id));
          if (!entry) return;
          await bridge.rename(
            dialog.side,
            entry.path,
            joinPath(dialog.side, listing.path, value),
            selectedSerial,
          );
        }
        setDialog(null);
        if (dialog.side === "local") await loadLocal();
        else await loadDevice();
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : t("operationFailed"),
          "error",
        );
      } finally {
        setDialogBusy(false);
      }
    },
    [
      deviceListing,
      deviceSelected,
      dialog,
      loadDevice,
      loadLocal,
      localListing,
      localSelected,
      selectedSerial,
      showToast,
      t,
    ],
  );

  const cancelQueuedTransfer = useCallback(
    async (id: string) => {
      try {
        const cancelled = await bridge.cancelTransfer(id);
        if (cancelled) showToast(t("transferCancelled"), "info");
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : t("operationFailed"),
          "error",
        );
      }
    },
    [showToast, t],
  );

  const retryQueuedTransfer = useCallback(
    async (id: string) => {
      try {
        await bridge.retryTransfer(id);
        showToast(t("transferQueued"), "success");
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : t("transferQueueFailed"),
          "error",
        );
      }
    },
    [showToast, t],
  );

  const moveHistory = useCallback(
    (side: PanelSide, offset: -1 | 1) => {
      const history = side === "local" ? localHistory : deviceHistory;
      const nextIndex = history.index + offset;
      const nextPath = history.paths[nextIndex];
      if (!nextPath || nextIndex < 0 || nextIndex >= history.paths.length) return;
      if (side === "local") {
        setLocalHistory({ ...history, index: nextIndex });
        void loadLocal(nextPath, { recordHistory: false });
      } else {
        setDeviceHistory({ ...history, index: nextIndex });
        void loadDevice(nextPath, { recordHistory: false });
      }
    },
    [deviceHistory, loadDevice, loadLocal, localHistory],
  );

  const openCursorEntry = useCallback(() => {
    const entries = activeSide === "local" ? localEntries : deviceEntries;
    const cursorId = activeSide === "local" ? localCursor : deviceCursor;
    const entry = entries.find((item) => item.id === cursorId);
    if (!entry) return;
    if (entry.kind === "directory") {
      if (activeSide === "local") void loadLocal(entry.path);
      else void loadDevice(entry.path);
    } else if (activeSide === "local") {
      void openLocalEntry(entry);
    }
  }, [
    activeSide,
    deviceCursor,
    deviceEntries,
    loadDevice,
    loadLocal,
    localCursor,
    localEntries,
    openLocalEntry,
  ]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isTextInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement;
      const isSelect = target instanceof HTMLSelectElement;
      const insideQueue = Boolean(queueRef.current?.contains(target));

      if (event.key === "Escape") {
        if (errorTransfer) {
          event.preventDefault();
          setErrorTransfer(null);
          return;
        }
        if (helpOpen) {
          event.preventDefault();
          setHelpOpen(false);
          return;
        }
        if (copyPreview) {
          event.preventDefault();
          closeCopyPreview();
          return;
        }
        if (updatePreview) {
          event.preventDefault();
          closeUpdatePreview();
          return;
        }
        if (dialog) {
          event.preventDefault();
          if (!dialogBusy) setDialog(null);
          return;
        }
        if (isTextInput && target.dataset.panelSearch) {
          event.preventDefault();
          const side = target.dataset.panelSearch;
          if (side === "local") setLocalQuery("");
          else setDeviceQuery("");
          target.blur();
          return;
        }
        if (isSelect) {
          event.preventDefault();
          target.blur();
          return;
        }
        if (insideQueue) {
          event.preventDefault();
          target.blur();
          return;
        }
        if (entryContextMenu) {
          event.preventDefault();
          setEntryContextMenu(null);
          return;
        }
        const query = activeSide === "local" ? localQuery : deviceQuery;
        if (query) {
          event.preventDefault();
          if (activeSide === "local") setLocalQuery("");
          else setDeviceQuery("");
          return;
        }
        const selected =
          activeSide === "local" ? localSelected : deviceSelected;
        if (selected.size > 0) {
          event.preventDefault();
          if (activeSide === "local") setLocalSelected(new Set());
          else setDeviceSelected(new Set());
          return;
        }
        if (settingsOpen) {
          event.preventDefault();
          setSettingsOpen(false);
        }
        return;
      }

      if (
        copyPreview ||
        updatePreview ||
        dialog ||
        helpOpen ||
        errorTransfer ||
        isTextInput ||
        isSelect
      ) {
        return;
      }

      if (insideQueue && event.key === "Tab") {
        event.preventDefault();
        const controls = Array.from(
          queueRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
        );
        const currentIndex = controls.findIndex(
          (control) => control === document.activeElement,
        );
        const nextIndex = event.shiftKey
          ? currentIndex > 0
            ? currentIndex - 1
            : -1
          : currentIndex + 1;
        if (nextIndex >= 0 && nextIndex < controls.length) {
          controls[nextIndex]?.focus();
        } else {
          document
            .querySelector<HTMLButtonElement>(".command-bar button")
            ?.focus();
        }
        return;
      }

      if (event.key === "F1" || event.key === "?") {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        setActiveSide((current) => (current === "local" ? "device" : "local"));
        return;
      }
      if (event.key === "F5") {
        event.preventDefault();
        void copy(activeSide === "local" ? "push" : "pull");
        return;
      }
      if (event.key === "F7") {
        event.preventDefault();
        openNewFolder(activeSide);
        return;
      }
      if (event.key === "F2") {
        event.preventDefault();
        openRename(activeSide);
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLocaleLowerCase() === "r"
      ) {
        event.preventDefault();
        if (activeSide === "local") {
          void loadLocal(undefined, {
            recordHistory: false,
            preserveSelection: true,
            preserveCursor: true,
          });
        } else {
          void loadDevice(undefined, {
            recordHistory: false,
            preserveSelection: true,
            preserveCursor: true,
          });
        }
        return;
      }
      if (event.ctrlKey && event.key.toLocaleLowerCase() === "d") {
        event.preventDefault();
        deviceSelectRef.current?.focus();
        return;
      }
      if (event.ctrlKey && event.key.toLocaleLowerCase() === "h") {
        event.preventDefault();
        if (activeSide === "local") setLocalHidden((current) => !current);
        else setDeviceHidden((current) => !current);
        return;
      }
      if (event.ctrlKey && event.key.toLocaleLowerCase() === "g") {
        event.preventDefault();
        if (activeSide === "local") setLocalGrid((current) => !current);
        else setDeviceGrid((current) => !current);
        return;
      }
      if (
        event.ctrlKey &&
        ["1", "2", "3", "4"].includes(event.key)
      ) {
        event.preventDefault();
        const columns: SortColumn[] = ["name", "type", "size", "modified"];
        const column = columns[Number(event.key) - 1]!;
        if (activeSide === "local") {
          setLocalSortDirection((currentDirection) =>
            localSortColumn === column && currentDirection === "asc"
              ? "desc"
              : "asc",
          );
          setLocalSortColumn(column);
        } else {
          setDeviceSortDirection((currentDirection) =>
            deviceSortColumn === column && currentDirection === "asc"
              ? "desc"
              : "asc",
          );
          setDeviceSortColumn(column);
        }
        return;
      }
      if (event.ctrlKey && event.key.toLocaleLowerCase() === "u") {
        event.preventDefault();
        void analyzeUpdate(activeSide === "local" ? "push" : "pull");
        return;
      }
      if (
        event.key === "/" ||
        ((event.ctrlKey || event.metaKey) &&
          event.key.toLocaleLowerCase() === "f")
      ) {
        event.preventDefault();
        setSearchRequest((current) => ({
          ...current,
          [activeSide]: current[activeSide] + 1,
        }));
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLocaleLowerCase() === "j"
      ) {
        event.preventDefault();
        queueRef.current?.focus();
        queueRef.current?.scrollIntoView({ block: "nearest" });
        showToast(t("transferQueueFocused"));
        return;
      }
      if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        moveHistory(activeSide, -1);
        return;
      }
      if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        moveHistory(activeSide, 1);
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "Home"
      ) {
        event.preventDefault();
        if (activeSide === "local") void loadLocal(localHomeRef.current);
        else void loadDevice(deviceHomeRef.current);
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        const listing = activeSide === "local" ? localListing : deviceListing;
        if (listing.parent) {
          if (activeSide === "local") void loadLocal(listing.parent);
          else void loadDevice(listing.parent);
        }
        return;
      }
      const nativeButton =
        target instanceof HTMLButtonElement &&
        !target.classList.contains("file-row");
      if (
        nativeButton &&
        (event.key === "Enter" || event.key === " ")
      ) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        openCursorEntry();
        return;
      }

      const entries = activeSide === "local" ? localEntries : deviceEntries;
      const cursorId = activeSide === "local" ? localCursor : deviceCursor;
      const setCursor =
        activeSide === "local" ? setLocalCursor : setDeviceCursor;
      const setSelected =
        activeSide === "local" ? setLocalSelected : setDeviceSelected;
      const anchorRef =
        activeSide === "local"
          ? localSelectionAnchorRef
          : deviceSelectionAnchorRef;
      const currentIndex = Math.max(
        0,
        entries.findIndex((entry) => entry.id === cursorId),
      );

      const moveTo = (nextIndex: number, selectRange: boolean) => {
        if (entries.length === 0) return;
        const bounded = Math.max(0, Math.min(entries.length - 1, nextIndex));
        const next = entries[bounded]!;
        setCursor(next.id);
        if (selectRange) {
          const anchorIndex = Math.max(
            0,
            entries.findIndex((entry) => entry.id === anchorRef.current),
          );
          const [start, end] =
            anchorIndex <= bounded
              ? [anchorIndex, bounded]
              : [bounded, anchorIndex];
          setSelected(
            new Set(entries.slice(start, end + 1).map((entry) => entry.id)),
          );
        } else {
          anchorRef.current = next.id;
        }
      };

      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLocaleLowerCase() === "a"
      ) {
        event.preventDefault();
        setSelected(new Set(entries.map((entry) => entry.id)));
        return;
      }
      if (event.key === "Insert" || event.key === " ") {
        event.preventDefault();
        const current = entries[currentIndex];
        if (!current) return;
        setSelected((selected) => {
          const next = new Set(selected);
          if (next.has(current.id)) next.delete(current.id);
          else next.add(current.id);
          return next;
        });
        moveTo(currentIndex + 1, false);
        return;
      }

      let nextIndex: number | null = null;
      const grid = activeSide === "local" ? localGrid : deviceGrid;
      const listElement = document.querySelector<HTMLElement>(
        `.file-list[data-side="${activeSide}"]`,
      );
      const columnCount =
        grid && listElement
          ? Math.max(
              1,
              getComputedStyle(listElement).gridTemplateColumns.split(" ")
                .length,
            )
          : 1;
      const pageStep = grid ? columnCount * 4 : 10;
      if (event.key === "ArrowUp") nextIndex = currentIndex - columnCount;
      else if (event.key === "ArrowDown")
        nextIndex = currentIndex + columnCount;
      else if (event.key === "ArrowLeft" && grid)
        nextIndex = currentIndex - 1;
      else if (event.key === "ArrowRight" && grid)
        nextIndex = currentIndex + 1;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = entries.length - 1;
      else if (event.key === "PageUp") nextIndex = currentIndex - pageStep;
      else if (event.key === "PageDown") nextIndex = currentIndex + pageStep;
      if (nextIndex !== null) {
        event.preventDefault();
        moveTo(nextIndex, event.shiftKey);
        return;
      }

      if (
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        event.key.length === 1 &&
        /[\p{L}\p{N}._-]/u.test(event.key)
      ) {
        const nowText = `${typeAheadRef.current.text}${event.key}`.toLocaleLowerCase(
          "en",
        );
        typeAheadRef.current.text = nowText;
        window.clearTimeout(typeAheadRef.current.timer);
        typeAheadRef.current.timer = window.setTimeout(() => {
          typeAheadRef.current.text = "";
        }, 850);
        const ordered = [
          ...entries.slice(currentIndex + 1),
          ...entries.slice(0, currentIndex + 1),
        ];
        const match =
          ordered.find((entry) =>
            entry.name.toLocaleLowerCase("en").startsWith(nowText),
          ) ??
          ordered.find((entry) =>
            entry.name.toLocaleLowerCase("en").includes(nowText),
          );
        if (match) {
          event.preventDefault();
          setCursor(match.id);
          anchorRef.current = match.id;
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    activeSide,
    analyzeUpdate,
    closeCopyPreview,
    closeUpdatePreview,
    copy,
    copyPreview,
    deviceCursor,
    deviceEntries,
    deviceGrid,
    deviceListing,
    deviceQuery,
    deviceSelected,
    dialog,
    dialogBusy,
    entryContextMenu,
    errorTransfer,
    helpOpen,
    loadDevice,
    loadLocal,
    localCursor,
    localEntries,
    localGrid,
    localListing,
    localQuery,
    localSelected,
    localSortColumn,
    moveHistory,
    openCursorEntry,
    openNewFolder,
    openRename,
    settingsOpen,
    showToast,
    t,
    deviceSortColumn,
    updatePreview,
  ]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <ArrowLeftRight size={19} />
          </span>
          <div>
            <strong>ADB</strong>
            <span>COMMANDER</span>
          </div>
          <b>0.1</b>
        </div>

        <div className="device-picker-wrap">
          <div className="device-picker-label">{t("device")}</div>
          <div
            className={`device-picker ${selectedDevice?.state === "device" ? "connected" : ""}`}
          >
            <span className="device-dot" />
            <Smartphone size={18} />
            <select
              ref={deviceSelectRef}
              value={selectedSerial}
              onChange={(event) => setSelectedSerial(event.target.value)}
              disabled={deviceLoadingList}
              aria-label={t("chooseDevice")}
            >
              {devices.length === 0 && (
                <option value="">
                  {deviceLoadingList
                    ? t("scanningDevices")
                    : t("noAdbDevices")}
                </option>
              )}
              {devices.map((device) => (
                <option value={device.serial} key={device.serial}>
                  {device.manufacturer ? `${device.manufacturer} ` : ""}
                  {device.model}
                  {device.state !== "device" ? ` · ${device.state}` : ""}
                </option>
              ))}
            </select>
            <ChevronDown size={15} />
          </div>
          {selectedDevice && (
            <div className="device-connection">
              {selectedDevice.connection === "usb" ? (
                <Usb size={13} />
              ) : (
                <Wifi size={13} />
              )}
              <span>
                {selectedDevice.connection.toUpperCase()}
                {selectedDevice.androidVersion
                  ? ` · Android ${selectedDevice.androidVersion}`
                  : ""}
              </span>
            </div>
          )}
        </div>

        <div className="topbar-actions">
          {demoMode && <span className="demo-badge">{t("demo")}</span>}
          <button
            className="top-button"
            onClick={() => void refreshDevices()}
            disabled={deviceLoadingList}
          >
            <RefreshCw
              className={deviceLoadingList ? "spin" : ""}
              size={15}
            />
            {t("scanAdb")}
          </button>
          <button
            className={`icon-button ${settingsOpen ? "active" : ""}`}
            onClick={() => setSettingsOpen((current) => !current)}
            aria-label={t("settings")}
            title={t("settings")}
          >
            <Settings size={16} />
          </button>
          {settingsOpen && (
            <div className="settings-popover">
              <div className="settings-heading">
                <strong>{t("settings")}</strong>
                <button
                  onClick={() => setSettingsOpen(false)}
                  aria-label={t("close")}
                  title={t("close")}
                >
                  <X size={14} />
                </button>
              </div>
              <button
                className="settings-help-button"
                onClick={() => {
                  setSettingsOpen(false);
                  setHelpOpen(true);
                }}
              >
                <CircleHelp size={14} />
                {t("keyboardWorkflow")} · F1
              </button>
              <p>
                <Info size={13} />
                {t("securityInfo")}
              </p>
              <p>
                <Check size={13} />
                {t("preferencesSaved")}
              </p>
            </div>
          )}
        </div>
      </header>

      <div className="workspace">
        <FilePanel
          side="local"
          listing={localListing}
          loading={localLoading}
          active={activeSide === "local"}
          selected={localSelected}
          cursorId={localCursor}
          query={localQuery}
          showHidden={localHidden}
          grid={localGrid}
          sortColumn={localSortColumn}
          sortDirection={localSortDirection}
          searchRequestId={searchRequest.local}
          onActivate={() => setActiveSide("local")}
          onNavigate={(path) => void loadLocal(path)}
          onRefresh={() =>
            void loadLocal(undefined, {
              recordHistory: false,
              preserveSelection: true,
              preserveCursor: true,
            })
          }
          onSelect={(entry, event) => selectEntry("local", entry, event)}
          onQuery={setLocalQuery}
          onSort={(column, direction) => {
            setLocalSortColumn(column);
            setLocalSortDirection(direction);
          }}
          onToggleHidden={() => setLocalHidden((current) => !current)}
          onToggleGrid={() => setLocalGrid((current) => !current)}
          onNewFolder={() => openNewFolder("local")}
          onRename={() => openRename("local")}
          onOpen={(entry) => void openLocalEntry(entry)}
          onContextMenu={(entry, event) =>
            openEntryContextMenu("local", entry, event)
          }
        />

        <TransferRail
          hasDevice={selectedDevice?.state === "device"}
          localCount={localSelected.size || (localCursor ? 1 : 0)}
          deviceCount={deviceSelected.size || (deviceCursor ? 1 : 0)}
          onCopy={(direction) => void copy(direction)}
          onAnalyzeUpdate={(direction) => void analyzeUpdate(direction)}
        />

        <FilePanel
          side="device"
          listing={deviceListing}
          loading={deviceLoading}
          active={activeSide === "device"}
          selected={deviceSelected}
          cursorId={deviceCursor}
          query={deviceQuery}
          showHidden={deviceHidden}
          grid={deviceGrid}
          sortColumn={deviceSortColumn}
          sortDirection={deviceSortDirection}
          searchRequestId={searchRequest.device}
          serial={selectedSerial}
          onActivate={() => setActiveSide("device")}
          onNavigate={(path) => void loadDevice(path)}
          onRefresh={() =>
            void loadDevice(undefined, {
              recordHistory: false,
              preserveSelection: true,
              preserveCursor: true,
            })
          }
          onSelect={(entry, event) => selectEntry("device", entry, event)}
          onQuery={setDeviceQuery}
          onSort={(column, direction) => {
            setDeviceSortColumn(column);
            setDeviceSortDirection(direction);
          }}
          onToggleHidden={() => setDeviceHidden((current) => !current)}
          onToggleGrid={() => setDeviceGrid((current) => !current)}
          onNewFolder={() => openNewFolder("device")}
          onRename={() => openRename("device")}
          onContextMenu={(entry, event) =>
            openEntryContextMenu("device", entry, event)
          }
        />
      </div>

      <TransferQueue
        transfers={transfers}
        queueRef={queueRef}
        onClear={() =>
          setTransfers((current) =>
            current.filter(
              (transfer) =>
                transfer.status === "running" ||
                transfer.status === "queued",
            ),
          )
        }
        onCancel={(id) => void cancelQueuedTransfer(id)}
        onRetry={(id) => void retryQueuedTransfer(id)}
        onShowError={setErrorTransfer}
      />

      <footer className="statusbar">
        <span>
          <span
            className={`status-dot ${selectedDevice?.state === "device" ? "ok" : ""}`}
          />
          {selectedDevice?.state === "device"
            ? t("adbConnected", { serial: selectedDevice.serial })
            : t("adbDisconnected")}
        </span>
        <div className="command-bar" role="toolbar" aria-label={t("operations")}>
          <button onClick={() => setHelpOpen(true)}>
            <kbd>F1</kbd>
            <span>{t("help")}</span>
          </button>
          <button onClick={() => openRename(activeSide)}>
            <kbd>F2</kbd>
            <span>{t("rename")}</span>
          </button>
          <button
            className="primary"
            onClick={() =>
              void copy(activeSide === "local" ? "push" : "pull")
            }
          >
            <kbd>F5</kbd>
            <span>{t("shortcutCopy")}</span>
          </button>
          <button onClick={() => openNewFolder(activeSide)}>
            <kbd>F7</kbd>
            <span>{t("newFolder")}</span>
          </button>
          <button
            onClick={() => {
              if (activeSide === "local") {
                void loadLocal(undefined, {
                  recordHistory: false,
                  preserveSelection: true,
                  preserveCursor: true,
                });
              } else {
                void loadDevice(undefined, {
                  recordHistory: false,
                  preserveSelection: true,
                  preserveCursor: true,
                });
              }
            }}
          >
            <kbd>⌃R</kbd>
            <span>{t("refresh")}</span>
          </button>
        </div>
        <span className="safe-label">
          {(() => {
            const entries =
              activeSide === "local" ? localEntries : deviceEntries;
            const cursor =
              activeSide === "local" ? localCursor : deviceCursor;
            const entry = entries.find((item) => item.id === cursor);
            return entry
              ? t("cursorItem", { name: entry.name })
              : t("noCursorItem");
          })()}
        </span>
      </footer>

      {dialog && (
        <NameDialog
          state={dialog}
          busy={dialogBusy}
          onClose={() => setDialog(null)}
          onSubmit={(value) => void submitDialog(value)}
        />
      )}

      {updatePreview && (
        <UpdateDialog
          state={updatePreview}
          onClose={closeUpdatePreview}
          onConfirm={() => void confirmUpdate()}
        />
      )}

      {copyPreview && (
        <CopyDialog
          state={copyPreview}
          onClose={closeCopyPreview}
          onConfirm={(policy, decisions) =>
            void confirmCopy(policy, decisions)
          }
        />
      )}

      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}

      {errorTransfer && (
        <ErrorDialog
          transfer={errorTransfer}
          onClose={() => setErrorTransfer(null)}
        />
      )}

      {entryContextMenu && (
        <EntryContextMenu
          state={entryContextMenu}
          deviceName={selectedDeviceName}
          hasDevice={selectedDevice?.state === "device"}
          onReveal={() => {
            const entry = entryContextMenu.entry;
            setEntryContextMenu(null);
            void revealLocalEntry(entry);
          }}
          onTransfer={(direction) => {
            const entry = entryContextMenu.entry;
            setEntryContextMenu(null);
            void previewTransfer(direction, [entry.path]);
          }}
        />
      )}

      {toast && (
        <div className={`toast toast-${toast.tone}`} role="status">
          {toast.tone === "error" ? (
            <CircleAlert size={16} />
          ) : toast.tone === "success" ? (
            <Check size={16} />
          ) : (
            <Info size={16} />
          )}
          <span>{toast.text}</span>
          <button
            onClick={() => setToast(null)}
            aria-label={t("close")}
            title={t("close")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </main>
  );
}

export default function App() {
  if (!window.bridge && !demoMode) return <BridgeUnavailable />;
  return <BridgeCommanderApp />;
}
