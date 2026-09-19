"use strict";

const {
  app,
  BrowserWindow,
  shell,
  Menu,
  Tray,
  nativeImage,
  ipcMain,
  Notification,
} = require("electron");
const path = require("path");
const isDev = require("electron-is-dev");
const { initAutoUpdater } = require("./updater");

// ─── Constants ───────────────────────────────────────────────────────────────
const NEXT_DEV_URL = "http://localhost:3000";
const PROD_PORT = 3100;
const PROD_URL = `http://localhost:${PROD_PORT}`;
const APP_URL = isDev ? NEXT_DEV_URL : PROD_URL;
const ICON_PATH = path.join(__dirname, "../public/brand/icon-512.svg");

let mainWindow = null;
let tray = null;

// ─── Production Next.js server ───────────────────────────────────────────────
function startNextServer() {
  if (isDev) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const serverPath = path.join(__dirname, "../.next/standalone/server.js");
    process.env.PORT = String(PROD_PORT);
    process.env.HOSTNAME = "127.0.0.1";
    try {
      require(serverPath);
      // Give the server 500ms to bind before opening the window
      setTimeout(resolve, 500);
    } catch (err) {
      reject(err);
    }
  });
}

// ─── Window creation ─────────────────────────────────────────────────────────
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Lighthouse Project Management",
    icon: ICON_PATH,
    backgroundColor: "#0f172a",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.loadURL(APP_URL);

  // Show once fully loaded to avoid white flash
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: "undocked" });
  });

  // Open external links in default browser, not electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Native app menu
  buildAppMenu();
}

// ─── Native menu ─────────────────────────────────────────────────────────────
function buildAppMenu() {
  const isMac = process.platform === "darwin";

  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "New Ticket",
          accelerator: "CmdOrCtrl+N",
          click: () =>
            mainWindow?.webContents.executeJavaScript(
              "window.dispatchEvent(new CustomEvent('electron-new-ticket'))",
            ),
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        ...(isMac
          ? [
              { role: "pasteAndMatchStyle" },
              { role: "delete" },
              { role: "selectAll" },
            ]
          : [{ role: "delete" }, { type: "separator" }, { role: "selectAll" }]),
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(isDev ? [{ type: "separator" }, { role: "toggleDevTools" }] : []),
      ],
    },
    {
      label: "Navigate",
      submenu: [
        {
          label: "Dashboard",
          accelerator: "CmdOrCtrl+1",
          click: () => mainWindow?.loadURL(`${APP_URL}/dashboard`),
        },
        {
          label: "Tickets",
          accelerator: "CmdOrCtrl+2",
          click: () => mainWindow?.loadURL(`${APP_URL}/tickets`),
        },
        {
          label: "Projects",
          accelerator: "CmdOrCtrl+3",
          click: () => mainWindow?.loadURL(`${APP_URL}/projects`),
        },
        {
          label: "Sprints",
          accelerator: "CmdOrCtrl+4",
          click: () => mainWindow?.loadURL(`${APP_URL}/sprints`),
        },
        {
          label: "Workload",
          accelerator: "CmdOrCtrl+5",
          click: () => mainWindow?.loadURL(`${APP_URL}/workload`),
        },
        { type: "separator" },
        {
          label: "Settings",
          accelerator: "CmdOrCtrl+,",
          click: () => mainWindow?.loadURL(`${APP_URL}/settings`),
        },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [{ type: "separator" }, { role: "front" }]
          : [{ role: "close" }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── System tray ─────────────────────────────────────────────────────────────
function createTray() {
  const icon = nativeImage
    .createFromPath(ICON_PATH)
    .resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("Lighthouse Project Management");

  const menu = Menu.buildFromTemplate([
    { label: "Open", click: () => mainWindow?.show() },
    {
      label: "Dashboard",
      click: () => {
        mainWindow?.show();
        mainWindow?.loadURL(`${APP_URL}/dashboard`);
      },
    },
    {
      label: "Tickets",
      click: () => {
        mainWindow?.show();
        mainWindow?.loadURL(`${APP_URL}/tickets`);
      },
    },
    { type: "separator" },
    { label: "Quit", role: "quit" },
  ]);

  tray.setContextMenu(menu);
  tray.on("double-click", () => mainWindow?.show());
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────
ipcMain.handle("get-platform", () => process.platform);
ipcMain.handle("get-app-version", () => app.getVersion());
ipcMain.handle("show-notification", (_, { title, body }) => {
  new Notification({ title, body }).show();
});

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  await startNextServer();
  createMainWindow();
  createTray();

  if (!isDev) {
    initAutoUpdater(mainWindow);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Security: prevent new window creation from renderer
app.on("web-contents-created", (_, contents) => {
  contents.on("will-navigate", (event, url) => {
    if (!url.startsWith(APP_URL)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
});
