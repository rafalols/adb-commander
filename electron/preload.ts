import { contextBridge, ipcRenderer } from "electron";
import type {
  BridgeApi,
  IncrementalUpdateRequest,
  PanelSide,
  ThumbnailRequest,
  TransferProgress,
  TransferRequest,
} from "../src/types";

const api: BridgeApi = {
  listDevices: () => ipcRenderer.invoke("devices:list"),
  listLocal: (path?: string) => ipcRenderer.invoke("local:list", path),
  listDevice: (serial: string, path?: string) =>
    ipcRenderer.invoke("device:list", serial, path),
  analyzeTransfer: (request: TransferRequest) =>
    ipcRenderer.invoke("transfer:analyze", request),
  transfer: (request: TransferRequest) =>
    ipcRenderer.invoke("transfer:start", request),
  cancelTransfer: (id: string) => ipcRenderer.invoke("transfer:cancel", id),
  retryTransfer: (id: string) => ipcRenderer.invoke("transfer:retry", id),
  analyzeIncrementalUpdate: (request: IncrementalUpdateRequest) =>
    ipcRenderer.invoke("update:analyze", request),
  startIncrementalUpdate: (analysisId: string) =>
    ipcRenderer.invoke("update:start", analysisId),
  createFolder: (side: PanelSide, path: string, serial?: string) =>
    ipcRenderer.invoke("folder:create", side, path, serial),
  rename: (
    side: PanelSide,
    from: string,
    to: string,
    serial?: string,
  ) => ipcRenderer.invoke("path:rename", side, from, to, serial),
  getThumbnail: (request: ThumbnailRequest) =>
    ipcRenderer.invoke("thumbnail:get", request),
  openLocal: (path: string) => ipcRenderer.invoke("local:open", path),
  revealLocal: (path: string) => ipcRenderer.invoke("local:reveal", path),
  onTransferProgress: (listener: (progress: TransferProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: TransferProgress) =>
      listener(progress);
    ipcRenderer.on("transfer:progress", handler);
    return () => ipcRenderer.removeListener("transfer:progress", handler);
  },
};

contextBridge.exposeInMainWorld("bridge", api);
