import { app, BrowserWindow, ipcMain, shell } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type {
  IncrementalUpdateRequest,
  PanelSide,
  ThumbnailRequest,
  TransferProgress,
  TransferRequest,
} from "../src/types";
import {
  createDeviceFolder,
  listDeviceDirectory,
  listDevices,
  renameDevicePath,
} from "./adb";
import {
  createLocalFolder,
  listLocalDirectory,
  renameLocalPath,
} from "./local-files";
import { getThumbnail } from "./thumbnails";
import {
  analyzeTransfer,
  analyzeIncrementalUpdate,
  cancelTransfer,
  retryTransfer,
  startIncrementalUpdate,
  startTransfer,
} from "./transfers";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
let mainWindow: BrowserWindow | null = null;

app.setName("ADB Commander");

function emitProgress(progress: TransferProgress): void {
  mainWindow?.webContents.send("transfer:progress", progress);
}

function requireDeviceSerial(serial?: string): string {
  if (!serial) throw new Error("Select an ADB device first.");
  return serial;
}

function registerIpc(): void {
  ipcMain.handle("devices:list", () => listDevices());
  ipcMain.handle("local:list", (_event, requestedPath?: string) =>
    listLocalDirectory(requestedPath),
  );
  ipcMain.handle(
    "device:list",
    (_event, serial: string, requestedPath?: string) =>
      listDeviceDirectory(requireDeviceSerial(serial), requestedPath),
  );
  ipcMain.handle("transfer:analyze", (_event, request: TransferRequest) =>
    analyzeTransfer(request),
  );
  ipcMain.handle("transfer:start", (_event, request: TransferRequest) => ({
    id: startTransfer(request, emitProgress),
  }));
  ipcMain.handle("transfer:cancel", (_event, id: string) =>
    cancelTransfer(id),
  );
  ipcMain.handle("transfer:retry", (_event, id: string) => ({
    id: retryTransfer(id, emitProgress),
  }));
  ipcMain.handle(
    "update:analyze",
    (_event, request: IncrementalUpdateRequest) =>
      analyzeIncrementalUpdate(request),
  );
  ipcMain.handle("update:start", (_event, analysisId: string) => ({
    id: startIncrementalUpdate(analysisId, emitProgress),
  }));
  ipcMain.handle(
    "folder:create",
    async (_event, side: PanelSide, targetPath: string, serial?: string) => {
      if (side === "local") {
        await createLocalFolder(targetPath);
      } else {
        await createDeviceFolder(requireDeviceSerial(serial), targetPath);
      }
    },
  );
  ipcMain.handle(
    "path:rename",
    async (
      _event,
      side: PanelSide,
      from: string,
      to: string,
      serial?: string,
    ) => {
      if (side === "local") {
        await renameLocalPath(from, to);
      } else {
        await renameDevicePath(requireDeviceSerial(serial), from, to);
      }
    },
  );
  ipcMain.handle(
    "thumbnail:get",
    (_event, request: ThumbnailRequest) => getThumbnail(request),
  );
  ipcMain.handle("local:open", async (_event, localPath: string) => {
    const error = await shell.openPath(localPath);
    if (error) throw new Error(error);
  });
  ipcMain.handle("local:reveal", (_event, localPath: string) =>
    shell.showItemInFolder(localPath),
  );
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1460,
    height: 930,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: "#121411",
    title: "ADB Commander",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 18 },
    webPreferences: {
      preload: path.join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error(`Preload failed (${preloadPath}):`, error);
  });
  mainWindow.webContents.on("did-finish-load", () => {
    void mainWindow?.webContents
      .executeJavaScript("Boolean(window.bridge)")
      .then((available) => {
        console.log(`ADB bridge: ${available ? "ready" : "unavailable"}`);
      });
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(currentDirectory, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
