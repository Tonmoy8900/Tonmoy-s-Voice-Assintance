
const { app, BrowserWindow, Tray, Menu, ipcMain, shell } = require('electron');
const path = require('path');

let mainWindow;
let tray;

/* ---------------- WINDOW ---------------- */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    show: false, // start hidden (tray mode)
    frame: false, // custom UI controls
    webPreferences: {
      nodeIntegration: true, // Allows renderer process to use Node.js modules
      contextIsolation: false // Disables context isolation for easier Node.js access
    }
  });

  // Load the React app. In development, load from Vite's dev server. In production, load the built index.html.
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools(); // Open DevTools in development
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html')); // Path to built React app
  }
  
  // Show window once it's ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Hide instead of close
  mainWindow.on('close', (event) => {
    event.preventDefault();
    mainWindow.hide();
  });
}

/* ---------------- TRAY ---------------- */
function createTray() {
  // Use a different icon for Electron if icon.png is not directly in main.js's dir
  tray = new Tray(path.join(app.getAppPath(), 'icon.png')); 

  const menu = Menu.buildFromTemplate([
    {
      label: 'Open Myra AI',
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
        app.quit(); // Use app.quit() for a clean exit
      }
    }
  ]);

  tray.setToolTip('Myra AI – Tonmoy’s Assistance AI');
  tray.setContextMenu(menu);

  tray.on('double-click', () => {
    mainWindow.show();
  });
}

/* ---------------- APP LIFECYCLE ---------------- */
app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/* ---------------- IPC : UI CONTROLS ---------------- */
// Called from your React UI buttons
ipcMain.on('zavis:minimize', () => {
  mainWindow.minimize();
});

ipcMain.on('zavis:maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('zavis:close', () => {
  mainWindow.hide(); // Or mainWindow.close() if you want to quit the app
});

// Example for external links
ipcMain.on('zavis:open-external', (event, url) => {
  shell.openExternal(url);
});

// IPC handler to get Electron's user data path
ipcMain.handle('get-app-user-data-path', () => {
  return app.getPath('userData');
});
