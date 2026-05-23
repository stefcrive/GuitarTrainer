import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export type LocalRootRecord = {
  rootName: string
  rootPath: string
  samplePaths: string[]
  updatedAt: number
}

const REGISTRY_FILE = process.env.GUITAR_TRAINER_ROOT_REGISTRY
  ?? path.join(process.cwd(), '.guitar-trainer-roots.json')

export async function resolveLocalRootPath(params: {
  rootName?: string
  requestedRoot?: string
  samplePaths?: string[]
}): Promise<string | null> {
  const rootName = params.rootName ? path.basename(params.rootName.trim()) : undefined
  const samplePaths = normalizeSamplePaths(params.samplePaths ?? [])
  const candidates = await getRootCandidates(rootName, params.requestedRoot)

  for (const candidate of candidates) {
    if (await validateRootCandidate(candidate, samplePaths, rootName)) {
      if (rootName) {
        await saveLocalRoot({
          rootName,
          rootPath: candidate,
          samplePaths,
          updatedAt: Date.now()
        })
      }
      return candidate
    }
  }

  return null
}

export async function getStoredLocalRoots(): Promise<LocalRootRecord[]> {
  try {
    const text = await readFile(REGISTRY_FILE, 'utf8')
    const parsed = JSON.parse(text) as LocalRootRecord[]
    return Array.isArray(parsed) ? parsed.filter(isRootRecord) : []
  } catch {
    return []
  }
}

async function saveLocalRoot(record: LocalRootRecord): Promise<void> {
  const records = await getStoredLocalRoots()
  const nextRecords = [
    record,
    ...records.filter((item) => item.rootName !== record.rootName && item.rootPath !== record.rootPath)
  ].slice(0, 20)
  await writeFile(REGISTRY_FILE, JSON.stringify(nextRecords, null, 2), 'utf8')
}

async function getRootCandidates(rootName?: string, requestedRoot?: string): Promise<string[]> {
  const stored = await getStoredLocalRoots()
  const home = os.homedir()
  const commonParents = [
    path.join(home, 'Videos'),
    path.join(home, 'Documents'),
    path.join(home, 'Desktop'),
    path.join(home, 'Downloads'),
    ...getWindowsDriveParents(),
    process.cwd(),
    path.dirname(process.cwd()),
    path.dirname(path.dirname(process.cwd()))
  ]

  const candidates = [
    requestedRoot,
    process.env.GUITAR_TRAINER_VIDEO_ROOT,
    ...stored
      .filter((record) => !rootName || record.rootName === rootName)
      .map((record) => record.rootPath),
    ...(rootName ? commonParents.map((parent) => path.join(parent, rootName)) : [])
  ]

  return Array.from(new Set(candidates.filter((value): value is string => Boolean(value?.trim()))))
    .map((value) => path.resolve(value))
}

function getWindowsDriveParents(): string[] {
  if (process.platform !== 'win32') return []
  const parents: string[] = []
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const root = `${letter}:\\`
    if (!existsSync(root)) continue
    parents.push(root, path.join(root, 'Videos'), path.join(root, 'Guitar'))
  }
  return parents
}

async function validateRootCandidate(
  candidate: string,
  samplePaths: string[],
  rootName?: string
): Promise<boolean> {
  if (!existsSync(candidate)) return false
  if (samplePaths.length === 0) {
    return !rootName || path.basename(candidate).toLowerCase() === rootName.toLowerCase()
  }

  for (const samplePath of samplePaths.slice(0, 10)) {
    const target = path.resolve(candidate, ...samplePath.split('/'))
    if (isPathInside(candidate, target) && existsSync(target)) {
      return true
    }
  }
  return false
}

function normalizeSamplePaths(paths: string[]): string[] {
  return paths
    .map((value) => value.replace(/\\/g, '/').trim().replace(/^\/+|\/+$/g, ''))
    .filter((value) => value && !value.includes('..') && !path.isAbsolute(value))
}

function isRootRecord(value: LocalRootRecord): value is LocalRootRecord {
  return Boolean(
    value
      && typeof value.rootName === 'string'
      && typeof value.rootPath === 'string'
      && Array.isArray(value.samplePaths)
  )
}

function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return !relative.startsWith('..') && !path.isAbsolute(relative)
}
