import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync, type Dirent } from 'node:fs'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { resolveLocalRootPath } from '@/lib/server-root-registry'

export const runtime = 'nodejs'

type MarkerGenerationRequest = {
  rootFolder?: string
  rootName?: string
  videoPath?: string
  force?: boolean
}

type MarkerGenerationJob = {
  id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  phase: string
  progress: number
  videoPath: string
  rootFolder: string
  dbPath: string
  startedAt: number
  updatedAt: number
  completedAt?: number
  error?: string
  stdout: string
  stderr: string
  markerCount?: number
}

const PROCESSOR_DIR = process.env.INSTRUCTION_VIDEO_PROCESSOR_DIR
  ?? path.join(process.cwd(), 'Instruction video processor')
const PYTHON_EXECUTABLE = process.env.PYTHON_EXECUTABLE?.trim()
const PYTHON_EXECUTABLE_ARGS = process.env.PYTHON_EXECUTABLE_ARGS?.trim()
const DEFAULT_VIDEO_ROOT = path.join(process.cwd(), 'GT Listening Folder')
const MARKER_WHISPER_MODEL = process.env.MARKER_WHISPER_MODEL ?? 'small'
const MARKER_WHISPER_CPU_THREADS = process.env.MARKER_WHISPER_CPU_THREADS?.trim()
const jobs = new Map<string, MarkerGenerationJob>()
type PythonCommand = {
  command: string
  argsPrefix: string[]
  label: string
}
let pythonCommandPromise: Promise<PythonCommand> | null = null

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MarkerGenerationRequest
    const configuredRootFolder = body.rootFolder?.trim()
    const videoPath = normalizeContentPath(body.videoPath)
    const resolvedRootFolder = await resolveLocalRootPath({
      rootName: body.rootName,
      requestedRoot: configuredRootFolder,
      samplePaths: videoPath ? [videoPath] : []
    })
    const rootFolder = resolvedRootFolder
      || process.env.GUITAR_TRAINER_VIDEO_ROOT
      || DEFAULT_VIDEO_ROOT

    if (!videoPath) {
      return NextResponse.json(
        { error: 'Video path is required.' },
        { status: 400 }
      )
    }

    const root = path.resolve(rootFolder)
    const targetVideo = path.resolve(root, ...videoPath.split('/'))
    if (!isPathInside(root, targetVideo)) {
      return NextResponse.json(
        { error: 'Video path must stay inside the configured root folder.' },
        { status: 400 }
      )
    }

    await access(PROCESSOR_DIR).catch(() => {
      throw new Error(`Instruction video processor was not found at "${PROCESSOR_DIR}".`)
    })
    await access(root).catch(() => {
      throw new Error(
        `Automatic marker generation root folder was not found: "${root}". ` +
        'Re-select the video root in Settings, or configure GUITAR_TRAINER_VIDEO_ROOT.'
      )
    })
    await access(targetVideo).catch(() => {
      throw new Error(
        `Video file was not found at "${targetVideo}". ` +
        'The absolute marker generation root must be the same folder selected as the video root.'
      )
    })

    const job = createJob(root, videoPath)
    jobs.set(job.id, job)
    void runMarkerGenerationJob(job)

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      status: job.status,
      phase: job.phase,
      progress: job.progress,
      videoPath,
      dbPath: job.dbPath
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Automatic marker generation failed.'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get('jobId')
  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required.' }, { status: 400 })
  }

  const job = jobs.get(jobId)
  if (!job) {
    return NextResponse.json({ error: 'Marker generation job was not found.' }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    job: publicJob(job)
  })
}

function createJob(rootFolder: string, videoPath: string): MarkerGenerationJob {
  const now = Date.now()
  return {
    id: randomUUID(),
    status: 'queued',
    phase: 'Queued',
    progress: 2,
    videoPath,
    rootFolder,
    dbPath: path.join(rootFolder, 'guitar-trainer.sqlite'),
    startedAt: now,
    updatedAt: now,
    stdout: '',
    stderr: ''
  }
}

async function runMarkerGenerationJob(job: MarkerGenerationJob) {
  pruneJobs()

  try {
    updateJob(job, {
      status: 'running',
      phase: 'Preparing processor',
      progress: 5
    })

    await assertProcessorDependenciesAvailable()
    await assertMediaToolsAvailable()

    await runProcessor(buildProcessArgs(job), job, {
      phase: 'Processing audio with Whisper',
      startProgress: 8,
      endProgress: 90,
      estimateMs: 90 * 60 * 1000
    })

    await runProcessor([
      'app.py',
      'export-guitar-trainer',
      job.rootFolder,
      '--video-path',
      job.videoPath,
      '--source',
      'chapters',
      '--db',
      job.dbPath,
      '--merge',
      'replace-generated'
    ], job, {
      phase: 'Importing generated lesson markers into Guitar Trainer',
      startProgress: 90,
      endProgress: 97,
      estimateMs: 15 * 1000
    })

    updateJob(job, {
      status: 'completed',
      phase: 'Markers generated and imported',
      progress: 100,
      completedAt: Date.now()
    })
  } catch (error) {
    updateJob(job, {
      status: 'failed',
      phase: 'Generation failed',
      progress: Math.max(job.progress, 5),
      completedAt: Date.now(),
      error: error instanceof Error ? error.message : 'Automatic marker generation failed.'
    })
  }
}

function buildProcessArgs(job: MarkerGenerationJob): string[] {
  const args = [
    'app.py',
    'process',
    job.rootFolder,
    '--video-path',
    job.videoPath,
    '--whisper-model',
    MARKER_WHISPER_MODEL
  ]

  if (MARKER_WHISPER_CPU_THREADS) {
    args.push('--whisper-cpu-threads', MARKER_WHISPER_CPU_THREADS)
  }

  return args
}

function normalizeContentPath(value: string | undefined): string | null {
  const contentPath = value?.replace(/\\/g, '/').trim().replace(/^\/+|\/+$/g, '')
  if (!contentPath) return null
  if (contentPath.includes('..') || path.isAbsolute(contentPath)) return null
  return contentPath
}

function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

async function runProcessor(
  args: string[],
  job: MarkerGenerationJob,
  options: {
    phase: string
    startProgress: number
    endProgress: number
    estimateMs: number
  }
): Promise<void> {
  const python = await resolvePythonCommand()
  return new Promise((resolve, reject) => {
    const phaseStartedAt = Date.now()
    updateJob(job, {
      phase: options.phase,
      progress: Math.max(job.progress, options.startProgress)
    })

    const progressTimer = setInterval(() => {
      if (job.status !== 'running') return
      const elapsed = Date.now() - phaseStartedAt
      const ratio = Math.min(elapsed / options.estimateMs, 0.96)
      const eased = 1 - Math.pow(1 - ratio, 2)
      const progress = options.startProgress + (options.endProgress - options.startProgress) * eased
      updateJob(job, {
        phase: options.phase,
        progress: Math.min(options.endProgress, Math.max(job.progress, Math.round(progress)))
      })
    }, 1000)

    const child = spawn(python.command, [...python.argsPrefix, ...args], {
      cwd: PROCESSOR_DIR,
      env: buildProcessorEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false
    })

    let stderr = ''

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      updateJob(job, { stdout: trimOutput(job.stdout + text) })
    })

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text
      updateJob(job, { stderr: trimOutput(job.stderr + text) })
    })

    child.on('error', (error) => {
      clearInterval(progressTimer)
      reject(new Error(`Unable to start ${python.label}: ${error.message}`))
    })

    child.on('close', (code) => {
      clearInterval(progressTimer)
      if (code === 0) {
        updateJob(job, {
          progress: Math.max(job.progress, options.endProgress),
          stderr: trimOutput(job.stderr)
        })
        resolve()
      } else {
        reject(new Error(stderr || job.stdout || `Processor exited with code ${code}`))
      }
    })
  })
}

function updateJob(job: MarkerGenerationJob, patch: Partial<MarkerGenerationJob>) {
  Object.assign(job, patch, { updatedAt: Date.now() })
}

function publicJob(job: MarkerGenerationJob) {
  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    videoPath: job.videoPath,
    dbPath: job.dbPath,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    elapsedMs: (job.completedAt ?? Date.now()) - job.startedAt,
    error: job.error,
    stdout: job.stdout,
    stderr: job.stderr
  }
}

function trimOutput(value: string): string {
  return value.length > 12000 ? value.slice(-12000) : value
}

function pruneJobs() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  for (const [id, job] of jobs) {
    if (job.updatedAt < cutoff) {
      jobs.delete(id)
    }
  }
}

function resolvePythonCommand(): Promise<PythonCommand> {
  pythonCommandPromise ??= findPythonCommand()
  return pythonCommandPromise
}

function assertMediaToolsAvailable(): Promise<void> {
  return Promise.all([
    assertToolAvailable('ffprobe'),
    assertToolAvailable('ffmpeg')
  ]).then(() => undefined)
}

async function assertProcessorDependenciesAvailable(): Promise<void> {
  const python = await resolvePythonCommand()
  const requiredModules = ['typer', 'rich', 'yaml', 'pydantic', 'faster_whisper']
  await new Promise<void>((resolve, reject) => {
    const script = [
      'import importlib.util, sys',
      `missing = [name for name in ${JSON.stringify(requiredModules)} if importlib.util.find_spec(name) is None]`,
      'sys.exit("Missing Python modules: " + ", ".join(missing)) if missing else print("processor dependencies ok")'
    ].join('; ')
    const child = spawn(python.command, [...python.argsPrefix, '-c', script], {
      cwd: PROCESSOR_DIR,
      env: buildProcessorEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false
    })

    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.on('error', (error) => {
      reject(new Error(`Unable to check Python processor dependencies: ${error.message}`))
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(
          new Error(
            `${output.trim() || 'Python processor dependencies are missing.'} ` +
            'Run: py -3 -m pip install -r "Instruction video processor\\requirements.txt"'
          )
        )
      }
    })
  })
}

function assertToolAvailable(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, ['-version'], {
      cwd: PROCESSOR_DIR,
      env: buildProcessorEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false
    })

    child.on('error', () => {
      reject(
        new Error(
          `${command} was not found. Install FFmpeg or set FFMPEG_BIN_DIR in .env.local ` +
          'to the folder containing ffmpeg.exe and ffprobe.exe.'
        )
      )
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} exited with code ${code}. Check your FFmpeg installation.`))
      }
    })
  })
}

async function findPythonCommand(): Promise<PythonCommand> {
  const configured = getConfiguredPythonCommand()
  if (configured) {
    await assertPythonCommand(configured)
    return configured
  }

  const candidates: PythonCommand[] = process.platform === 'win32'
    ? [
        { command: 'py', argsPrefix: ['-3'], label: 'py -3' },
        { command: 'python', argsPrefix: [], label: 'python' },
        { command: 'python3', argsPrefix: [], label: 'python3' }
      ]
    : [
        { command: 'python3', argsPrefix: [], label: 'python3' },
        { command: 'python', argsPrefix: [], label: 'python' },
        { command: 'py', argsPrefix: ['-3'], label: 'py -3' }
      ]

  const failures: string[] = []
  for (const candidate of candidates) {
    try {
      await assertPythonCommand(candidate)
      return candidate
    } catch (error) {
      failures.push(error instanceof Error ? error.message : `${candidate.label} failed`)
    }
  }

  throw new Error(
    'No working Python launcher was found for automatic marker generation. ' +
    'Install Python or set PYTHON_EXECUTABLE in .env.local. Checked: ' +
    failures.join('; ')
  )
}

function getConfiguredPythonCommand(): PythonCommand | null {
  if (!PYTHON_EXECUTABLE) return null
  const parts = splitCommandLine(PYTHON_EXECUTABLE)
  const command = parts[0]
  if (!command) return null
  const argsPrefix = [
    ...parts.slice(1),
    ...splitCommandLine(PYTHON_EXECUTABLE_ARGS ?? '')
  ]
  return {
    command,
    argsPrefix,
    label: [command, ...argsPrefix].join(' ')
  }
}

function assertPythonCommand(python: PythonCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(python.command, [...python.argsPrefix, '--version'], {
      cwd: PROCESSOR_DIR,
      env: buildProcessorEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false
    })

    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.on('error', (error) => {
      reject(new Error(`${python.label}: ${error.message}`))
    })
    child.on('close', (code) => {
      const text = output.trim()
      if (code === 0 && /^Python\s+\d+\.\d+/i.test(text)) {
        resolve()
      } else {
        reject(new Error(`${python.label}: ${text || `exited with code ${code}`}`))
      }
    })
  })
}

function splitCommandLine(value: string): string[] {
  const matches = value.match(/"([^"]+)"|'([^']+)'|[^\s]+/g) ?? []
  return matches.map((part) => part.replace(/^["']|["']$/g, ''))
}

function buildProcessorEnv(): NodeJS.ProcessEnv {
  const extraPaths = [
    process.env.FFMPEG_BIN_DIR,
    getWingetFfmpegBinDir()
  ].filter((value): value is string => Boolean(value))

  return {
    ...process.env,
    PATH: [...extraPaths, process.env.PATH ?? ''].join(path.delimiter)
  }
}

function getWingetFfmpegBinDir(): string | null {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) return null

  const packageRoot = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages')
  const knownBinDirs = [
    path.join(
      packageRoot,
      'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe',
      'ffmpeg-8.1.1-full_build',
      'bin'
    ),
    ...findFfmpegBinDirs(packageRoot)
  ]

  return knownBinDirs.find((binDir) =>
    existsSync(path.join(binDir, 'ffmpeg.exe'))
    && existsSync(path.join(binDir, 'ffprobe.exe'))
  ) ?? null
}

function findFfmpegBinDirs(packageRoot: string): string[] {
  try {
    const packageDirs = readdirSync(packageRoot, { withFileTypes: true })
    return packageDirs
      .filter((entry: Dirent) =>
        entry.isDirectory() && entry.name.toLowerCase().includes('ffmpeg')
      )
      .flatMap((entry: Dirent) => {
        const root = path.join(packageRoot, entry.name)
        const candidates = [
          path.join(root, 'bin'),
          ...readdirSync(root, { withFileTypes: true })
            .filter((child: Dirent) => child.isDirectory())
            .map((child: Dirent) => path.join(root, child.name, 'bin'))
        ]
        return candidates
      })
  } catch {
    return []
  }
}
