export type FileKind =
  | "directory"
  | "image"
  | "video"
  | "archive"
  | "audio"
  | "file";
export type TransferDirection = "push" | "pull";
export type PanelSide = "local" | "device";
export type ConflictPolicy = "overwrite" | "skip";

export interface DeviceInfo {
  serial: string;
  state: "device" | "offline" | "unauthorized" | string;
  model: string;
  manufacturer?: string;
  product?: string;
  androidVersion?: string;
  connection: "usb" | "network";
}

export interface FileEntry {
  id: string;
  name: string;
  path: string;
  kind: FileKind;
  extension: string;
  size: number;
  modifiedAt: number;
  hidden: boolean;
}

export interface DirectoryListing {
  path: string;
  parent: string | null;
  entries: FileEntry[];
  homePath?: string;
  freeBytes?: number;
  totalBytes?: number;
}

export interface TransferRequest {
  direction: TransferDirection;
  deviceSerial: string;
  sources: string[];
  destination: string;
  preferTar?: boolean;
  conflictPolicy?: ConflictPolicy;
}

export interface TransferConflict {
  source: string;
  destination: string;
  name: string;
  kind: FileKind;
}

export interface TransferAnalysis {
  direction: TransferDirection;
  sourceCount: number;
  fileCount: number;
  directoryCount: number;
  totalBytes: number;
  sourceBytes: Array<{ source: string; bytes: number }>;
  destinationFreeBytes?: number;
  insufficientSpace: boolean;
  conflicts: TransferConflict[];
}

export interface IncrementalUpdateRequest {
  direction: TransferDirection;
  deviceSerial: string;
  localRoot: string;
  deviceRoot: string;
}

export type UpdateWarningReason =
  | "changed-bytes"
  | "many-files"
  | "broad-root";

export interface IncrementalUpdateAnalysis {
  id: string;
  direction: TransferDirection;
  localRoot: string;
  deviceRoot: string;
  scannedFiles: number;
  sourceDirectories: number;
  changedFiles: number;
  unchangedFiles: number;
  changedBytes: number;
  totalSourceBytes: number;
  warningReasons: UpdateWarningReason[];
  expiresAt: number;
}

export interface TransferProgress {
  id: string;
  title: string;
  detail: string;
  direction: TransferDirection;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  percent: number;
  bytesTransferred?: number;
  totalBytes?: number;
  speedBytesPerSecond?: number;
  estimatedSecondsRemaining?: number;
  currentFile?: string;
  canRetry?: boolean;
  error?: string;
}

export interface ThumbnailRequest {
  side: PanelSide;
  path: string;
  kind: FileKind;
  serial?: string;
  size?: number;
  modifiedAt?: number;
}

export interface BridgeApi {
  listDevices(): Promise<DeviceInfo[]>;
  listLocal(path?: string): Promise<DirectoryListing>;
  listDevice(serial: string, path?: string): Promise<DirectoryListing>;
  analyzeTransfer(request: TransferRequest): Promise<TransferAnalysis>;
  transfer(request: TransferRequest): Promise<{ id: string }>;
  cancelTransfer(id: string): Promise<boolean>;
  retryTransfer(id: string): Promise<{ id: string }>;
  analyzeIncrementalUpdate(
    request: IncrementalUpdateRequest,
  ): Promise<IncrementalUpdateAnalysis>;
  startIncrementalUpdate(analysisId: string): Promise<{ id: string }>;
  createFolder(side: PanelSide, path: string, serial?: string): Promise<void>;
  rename(
    side: PanelSide,
    from: string,
    to: string,
    serial?: string,
  ): Promise<void>;
  getThumbnail(request: ThumbnailRequest): Promise<string | null>;
  openLocal(path: string): Promise<void>;
  revealLocal(path: string): Promise<void>;
  onTransferProgress(
    listener: (progress: TransferProgress) => void,
  ): () => void;
}
