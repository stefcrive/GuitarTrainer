import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { VideoMarkerState } from '@/types/video'
import type { MarkerGenerationOptions } from '@/lib/marker-generation-options'

export type MarkerGenerationJob = {
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
  force?: boolean
  options?: MarkerGenerationOptions
  youtube?: { videoId: string; duration: number; title: string }
  result?: VideoMarkerState
}

// Next dev reloads route modules while Python is still running. Keep ownership
// and live job objects outside the module, and snapshots outside the watched repo.
const globalJobs = globalThis as typeof globalThis & {
  guitarMarkerJobs?: { owner: string; jobs: Map<string, MarkerGenerationJob> }
}
const state = globalJobs.guitarMarkerJobs ??= { owner: randomUUID(), jobs: new Map() }
export const markerJobs = state.jobs
const directory = process.env.GUITAR_TRAINER_JOB_DIR
  ?? path.join(process.env.LOCALAPPDATA ?? os.homedir(), 'GuitarTrainer', 'marker-jobs')

export function markerJobResultPath(id: string) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid job ID')
  return path.join(directory, `${id}.result.json`)
}

export function saveMarkerJob(job: MarkerGenerationJob) {
  mkdirSync(directory, { recursive: true })
  const target = path.join(directory, `${job.id}.json`)
  const temporary = `${target}.${state.owner}.tmp`
  writeFileSync(temporary, JSON.stringify({ owner: state.owner, pid: process.pid, job }), { mode: 0o600 })
  renameSync(temporary, target)
}

export function readMarkerJob(id: string): MarkerGenerationJob | undefined {
  if (!/^[a-f0-9-]{36}$/i.test(id)) return undefined
  const live = markerJobs.get(id)
  if (live) return live
  try {
    const saved = JSON.parse(readFileSync(path.join(directory, `${id}.json`), 'utf8'))
    const job = saved.job as MarkerGenerationJob
    if (job.id !== id) return undefined
    if (job.status === 'running' || job.status === 'queued') {
      let alive = false
      try { process.kill(saved.pid, 0); alive = true } catch { /* Owner exited. */ }
      if (!alive || Date.now() - job.updatedAt > 60_000) {
        return { ...job, status: 'failed', phase: 'Generation interrupted', completedAt: Date.now(),
          error: 'The marker-generation server restarted or stopped responding. Retry generation; a saved transcript will be reused when available.' }
      }
    }
    return job
  } catch {
    return undefined
  }
}
