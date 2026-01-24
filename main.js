const { app, BrowserWindow, Tray, Menu, ipcMain, shell } = require('electron');
const path = require('path');

let mainWindow;
let tray;

/* ---------------- WINDOW ---------------- */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    show: false, // start hidden (tray mode)
    frame: false, // custom UI controls
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // DEV (Vite)
  mainWindow.loadURL('http://localhost:5173');

  // PROD (after build)
  // mainWindow.loadFile(path.join(__dirname, '../index.html'));

  // Hide instead of close
  mainWindow.on('close', (event) => {
    event.preventDefault();
    mainWindow.hide();
  });
}

/* ---------------- TRAY ---------------- */
function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.png'));

  const menu = Menu.buildFromTemplate([
    {
      label: 'Open ZAVIS',
      click: () => mainWindow.show()
    },
    {
      label: 'Hide',
      click: () => mainWindow.hide()
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuiting = true;
        app.exit();
      }
    }
  ]);

  tray.setToolTip('ZAVIS – Tonmoy’s Assistance AI');
  tray.setContextMenu(menu);

  tray.on('double-click', () => {
    mainWindow.show();
  });
}

/* ---------------- IPC : UI CONTROLS ---------------- */
// Called from your React UI buttons
ipcMain.on('zavis:minimize', () => {
  mainWindow.m
