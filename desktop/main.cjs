const { app, BrowserWindow, dialog, shell } = require('electron')
const { spawn } = require('node:child_process')
const { existsSync, mkdirSync, readFileSync } = require('node:fs')
const http = require('node:http')
const net = require('node:net')
const path = require('node:path')

let mainWindow
let serverProcess
let isQuitting = false

app.setName('Guitar Trainer')

function readUserEnvironment(filePath) {
  if (!existsSync(filePath)) return {}

  const values = {}
  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separator = line.indexOf('=')
    if (separator < 1) continue

    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  return values
}

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.unref()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address ? address.port : null
      probe.close(() => {
        if (port) resolve(port)
        else reject(new Error('Windows did not provide an available local port.'))
      })
    })
  })
}

function waitForServer(url, attempts = 120) {
  return new Promise((resolve, reject) => {
    let remaining = attempts

    const check = () => {
      const request = http.get(url, (response) => {
        response.resume()
        if (response.statusCode && response.statusCode < 500) {
          resolve()
          return
        }
        retry()
      })

      request.setTimeout(1000, () => request.destroy())
      request.on('error', retry)
    }

    const retry = () => {
      remaining -= 1
      if (remaining <= 0) {
        reject(new Error('The Guitar Trainer server did not start in time.'))
        return
      }
      setTimeout(check, 250)
    }

    check()
  })
}

function getRuntimePaths() {
  if (app.isPackaged) {
    return {
      appRoot: path.join(process.resourcesPath, 'app'),
      serverEntry: path.join(process.resourcesPath, 'app', 'server.js'),
      processorDir: path.join(process.resourcesPath, 'instruction-video-processor')
    }
  }

  const projectRoot = path.resolve(__dirname, '..')
  return {
    appRoot: path.join(projectRoot, '.next', 'standalone'),
    serverEntry: path.join(projectRoot, '.next', 'standalone', 'server.js'),
    processorDir: path.join(projectRoot, 'Instruction video processor')
  }
}

async function startServer() {
  const runtime = getRuntimePaths()
  if (!existsSync(runtime.serverEntry)) {
    throw new Error(
      `The packaged server is missing at ${runtime.serverEntry}. Run the production build again.`
    )
  }

  const userDataDir = app.getPath('userData')
  const contentDir = path.join(userDataDir, 'content')
  const configPath = path.join(userDataDir, 'config.env')
  mkdirSync(contentDir, { recursive: true })

  const port = await findAvailablePort()
  const configuredEnvironment = readUserEnvironment(configPath)
  const environment = {
    ...process.env,
    ...configuredEnvironment,
    NODE_ENV: 'production',
    HOSTNAME: '127.0.0.1',
    PORT: String(port),
    GUITAR_TRAINER_ROOT_REGISTRY: path.join(userDataDir, 'roots.json'),
    GUITAR_TRAINER_VIDEO_ROOT:
      configuredEnvironment.GUITAR_TRAINER_VIDEO_ROOT || contentDir,
    INSTRUCTION_VIDEO_PROCESSOR_DIR:
      configuredEnvironment.INSTRUCTION_VIDEO_PROCESSOR_DIR || runtime.processorDir,
    SPOTIFY_OAUTH_REDIRECT_URI:
      configuredEnvironment.SPOTIFY_OAUTH_REDIRECT_URI
      || `http://127.0.0.1:${port}/api/spotify/callback`,
    YOUTUBE_OAUTH_REDIRECT_URI:
      configuredEnvironment.YOUTUBE_OAUTH_REDIRECT_URI
      || `http://127.0.0.1:${port}/api/youtube/callback`,
    ELECTRON_RUN_AS_NODE: '1'
  }

  serverProcess = spawn(process.execPath, [runtime.serverEntry], {
    cwd: runtime.appRoot,
    env: environment,
    windowsHide: true,
    stdio: 'ignore'
  })

  serverProcess.once('exit', (code) => {
    serverProcess = undefined
    if (!isQuitting && code !== 0) {
      dialog.showErrorBox(
        'Guitar Trainer could not start',
        `The local app server stopped unexpectedly (exit code ${code ?? 'unknown'}).`
      )
      app.quit()
    }
  })

  const appUrl = `http://127.0.0.1:${port}`
  await waitForServer(appUrl)
  return appUrl
}

function createWindow(appUrl) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#09090b',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1:')) return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.loadURL(appUrl)
}

function stopServer() {
  if (!serverProcess) return
  serverProcess.kill()
  serverProcess = undefined
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady()
    .then(startServer)
    .then(createWindow)
    .catch((error) => {
      dialog.showErrorBox('Guitar Trainer could not start', error.message)
      app.quit()
    })
}

app.on('before-quit', () => {
  isQuitting = true
  stopServer()
})

app.on('window-all-closed', () => app.quit())
