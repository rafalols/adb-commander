export type Language = "en";

const messages = {
  filesOnMac: "Files on this Mac",
  filesOnAndroid: "Files on Android",
  thisMac: "This Mac",
  android: "Android",
  localStorage: "Local storage",
  sharedStorage: "Shared storage",
  newFolder: "New folder",
  rename: "Rename",
  hideHiddenFiles: "Hide hidden files",
  showHiddenFiles: "Show hidden files",
  hiddenFiles: "Hidden files",
  listView: "List view",
  gridView: "Grid view",
  refresh: "Refresh",
  parentFolder: "Parent folder",
  filterPlaceholder: "Filter this folder",
  filterFiles: "Filter files",
  clearFilter: "Clear filter",
  name: "Name",
  type: "Type",
  size: "Size",
  modified: "Modified",
  sortAscending: "Sort {column} ascending",
  sortDescending: "Sort {column} descending",
  loadingContents: "Reading contents…",
  noMatchingFiles: "No matching files",
  emptyFolder: "This folder is empty",
  clearFilterHint: "Clear the filter or try another search.",
  emptyFolderHint: "Copy files here from the other panel.",
  folder: "Folder",
  file: "File",
  selectedSummary: "{count} selected · {size}",
  itemCount: "{count} items",
  freeSpace: "{size} free",
  capacityUnavailable: "capacity unavailable",
  transferActions: "Transfer actions",
  copyToAndroid: "Copy selected items to Android (F5)",
  copyToMac: "Copy selected items to this Mac (F5)",
  fileActions: "File actions",
  showInFinder: "Show in Finder",
  transferToDevice: "Transfer to {device}",
  contextCopyToMac: "Copy to This Mac",
  advancedTransfers: "Advanced transfer options",
  incrementalUpdate: "Incremental update",
  updateToAndroid: "Update changed files from Mac to Android",
  updateToMac: "Update changed files from Android to Mac",
  updateDescription:
    "Scan both folders and copy only files that are new or have changed.",
  analyzeFirst: "Analyze before copying",
  analyzingFolders: "Analyzing both folders…",
  analyzingFoldersHint:
    "ADB Commander is comparing file sizes and modification times. Nothing is being copied yet.",
  reviewUpdate: "Review the update",
  macToAndroid: "Mac → Android",
  androidToMac: "Android → Mac",
  sourceFolder: "Source",
  destinationFolder: "Destination",
  scannedFiles: "Scanned files",
  changedFiles: "Changed files",
  dataToCopy: "Data to copy",
  unchangedFiles: "Unchanged",
  noFilesDeleted: "No files will be deleted on either side.",
  largeUpdateWarning: "Review this large or broad update carefully",
  changedDataWarning: "This update will copy {size} of changed data.",
  manyFilesWarning: "The source contains {count} files.",
  broadRootWarning:
    "A storage root is selected, so the update may cover many folders.",
  copyChangedFiles: "Copy changed files",
  everythingUpToDate: "Everything is up to date",
  updateQueued: "Incremental update added to the queue.",
  updateAnalysisFailed: "Could not analyze these folders.",
  updateQueueFailed: "Could not start the incremental update.",
  transfers: "Transfers",
  activeTransfers: "{count} active",
  tarFastPath: "tar fast path for folders",
  clearCompleted: "Clear finished",
  queueReady: "The queue is ready",
  queueHint: "Select files and press F5 to copy.",
  copyFromActive: "copy from the active panel",
  createFolder: "Create a new folder",
  onThisMac: "on this Mac",
  onSelectedAndroid: "on the selected Android device",
  cancel: "Cancel",
  create: "Create",
  save: "Save",
  desktopBridgeMissing: "Desktop connection unavailable",
  desktopBridgeMissingBody:
    "The interface could not reach the local ADB bridge. Start ADB Commander as an Electron app, not as a regular browser page.",
  tryAgain: "Try again",
  demoModeHint:
    "Demo mode is available only when the address contains {query}.",
  device: "Device",
  scanningDevices: "Scanning for devices…",
  noAdbDevices: "No ADB devices",
  scanAdb: "Scan ADB",
  securityInfo:
    "ADB runs locally. The interface has no direct access to your shell.",
  preferencesSaved: "Folder and view preferences are saved automatically.",
  adbConnected: "ADB connected · {serial}",
  adbDisconnected: "ADB disconnected",
  shortcutPanel: "panel",
  shortcutRename: "rename",
  shortcutCopy: "copy",
  shortcutNewFolder: "new folder",
  shortcutUp: "go up",
  updatesNeverDelete: "incremental updates never delete",
  chooseDevice: "Select an ADB device",
  adbStartFailed: "Could not start ADB.",
  folderOpenFailed: "Could not open this folder.",
  deviceReadFailed: "Could not read the phone storage.",
  transferFailed: "The transfer failed.",
  failed: "Failed",
  cancelled: "Cancelled",
  selectDeviceFirst: "Connect and select an ADB device first.",
  selectFilesFirst: "Select files or folders first.",
  renameOneOnly: "Select only one item to rename.",
  transferQueued: "Transfer added to the queue.",
  transferQueueFailed: "Could not add the transfer.",
  transferAnalysisFailed: "Could not analyze this transfer.",
  nothingToCopy: "Nothing remains to copy after skipping existing items.",
  openFileFailed: "Could not open this file.",
  operationFailed: "The operation failed.",
  settings: "Settings",
  close: "Close",
  demo: "DEMO",
  copyTitle: "Review copy",
  analyzingTransfer: "Calculating size and checking the destination…",
  itemsToCopy: "Items",
  filesToCopy: "Files",
  foldersToCopy: "Folders",
  conflicts: "Conflicts",
  noConflicts: "No name conflicts found.",
  conflictHint: "{count} existing destination items need a decision.",
  conflictDecision: "Current conflict: {name}",
  replace: "Replace",
  skip: "Skip",
  replaceAll: "Replace all",
  skipAll: "Skip all",
  startCopy: "Start copy",
  notEnoughSpace: "The destination may not have enough free space.",
  spaceComparison: "{needed} needed · {free} available",
  copySafeNote:
    "Replace overwrites matching files. Existing folders are merged; unrelated files are kept.",
  transferCancelled: "Transfer cancellation requested.",
  cancelTransfer: "Cancel transfer",
  retryTransfer: "Retry transfer",
  showError: "Show error",
  transferError: "Transfer error",
  speedAndEta: "{speed}/s · {eta} remaining",
  help: "Keyboard help",
  keyboardWorkflow: "Keyboard workflow",
  helpIntro:
    "Choose a panel, move the cursor, mark any extra items, then press F5.",
  navigation: "Navigation",
  selection: "Selection",
  operations: "Operations",
  search: "Search",
  helpNavigation:
    "Arrow keys move · Enter opens · Backspace goes up · Alt+←/→ uses history · Ctrl+Home goes home · Ctrl+D chooses a device",
  helpSelection:
    "Insert/Space marks and advances · Shift+↑/↓ selects a range · Ctrl+A selects all · Esc clears",
  helpOperations:
    "F2 rename · F5 copy · F7 new folder · Ctrl+R refresh · Ctrl+U incremental update · Ctrl+H hidden · Ctrl+G view · Ctrl+1…4 sort · Ctrl+J transfers",
  helpSearch:
    "/ or Ctrl+F filters · typing jumps to a name · Esc clears the filter",
  cursorItem: "Cursor: {name}",
  noCursorItem: "No item under the cursor",
  transferQueueFocused: "Transfer queue focused",
} as const;

export type TranslationKey = keyof typeof messages;
type Replacements = Record<string, string | number>;

function interpolate(template: string, replacements?: Replacements): string {
  if (!replacements) return template;
  return Object.entries(replacements).reduce(
    (result, [key, value]) =>
      result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

interface I18nValue {
  language: Language;
  t(key: TranslationKey, replacements?: Replacements): string;
}

const ENGLISH_I18N: I18nValue = {
  language: "en",
  t(key, replacements) {
    return interpolate(messages[key], replacements);
  },
};

export function useI18n(): I18nValue {
  return ENGLISH_I18N;
}
