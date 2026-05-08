import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

type MarkerGenerationRequest = {
  rootFolder?: string
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
const PYTHON_EXECUTABLE = process.env.PYTHON_EXECUTABLE ?? 'python'
const DEFAULT_VIDEO_ROOT = path.join(process.cwd(), 'GT Listening Folder')
const MARKER_WHISPER_MODEL = process.env.MARKER_WHISPER_MODEL ?? 'small'
const MARKER_WHISPER_CPU_THREADS = process.env.MARKER_WHISPER_CPU_THREADS ?? '2'
const jobs = new Map<string, MarkerGenerationJob>()

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MarkerGenerationRequest
    const rootFolder = body.rootFolder?.trim()
      || process.env.GUITAR_TRAINER_VIDEO_ROOT
      || DEFAULT_VIDEO_ROOT
    const videoPath = normalizeContentPath(body.videoPath)

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

    await access(PROCESSOR_DIR)
    await access(targetVideo)

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

    await runProcessor([
      'app.py',
      'process',
      job.rootFolder,
      '--video-path',
      job.videoPath,
      '--safe-mode',
      '--whisper-model',
      MARKER_WHISPER_MODEL,
      '--whisper-cpu-threads',
      MARKER_WHISPER_CPU_THREADS
    ], job, {
      phase: 'Processing audio with Whisper using limited CPU',
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

function runProcessor(
  args: string[],
  job: MarkerGenerationJob,
  options: {
    phase: string
    startProgress: number
    endProgress: number
    estimateMs: number
  }
): Promise<void> {
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

    const child = spawn(PYTHON_EXECUTABLE, args, {
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
      reject(error)
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

function buildProcessorEnv(): NodeJS.ProcessEnv {
  const extraPaths = [
    process.env.FFMPEG_BIN_DIR,
    getWingetFfmpegBinDir()
  ].filter((value): value is string => Boolean(value))

  return {
    ...process.env,
    OMP_NUM_THREADS: process.env.OMP_NUM_THREADS ?? '2',
    OPENBLAS_NUM_THREADS: process.env.OPENBLAS_NUM_THREADS ?? '2',
    MKL_NUM_THREADS: process.env.MKL_NUM_THREADS ?? '2',
    NUMEXPR_NUM_THREADS: process.env.NUMEXPR_NUM_THREADS ?? '2',
    VECLIB_MAXIMUM_THREADS: process.env.VECLIB_MAXIMUM_THREADS ?? '2',
    TF_NUM_INTRAOP_THREADS: process.env.TF_NUM_INTRAOP_THREADS ?? '1',
    TF_NUM_INTEROP_THREADS: process.env.TF_NUM_INTEROP_THREADS ?? '1',
    PATH: [...extraPaths, process.env.PATH ?? ''].join(path.delimiter)
  }
}

function getWingetFfmpegBinDir(): string | null {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) return null

  const packageRoot = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages')
  const knownBinDir = path.join(
    packageRoot,
    'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe',
    'ffmpeg-8.1.1-full_build',
    'bin'
  )

  return existsSync(path.join(knownBinDir, 'ffmpeg.exe'))
    && existsSync(path.join(knownBinDir, 'ffprobe.exe'))
    ? knownBinDir
    : null
}
