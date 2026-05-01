'use client'

import type { Database, SqlJsStatic, SqlValue } from 'sql.js'

const DATABASE_FILE_NAME = 'guitar-trainer.sqlite'
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS marker_states (
  content_path TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  marker_state TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audio_metadata (
  path TEXT PRIMARY KEY,
  metadata TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS youtube_playlists (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  updated_at INTEGER NOT NULL
);
`

type DbContext = {
  db: Database
  fileHandle: FileSystemFileHandle
}

const dbCache = new WeakMap<FileSystemDirectoryHandle, DbContext>()
let sqlJsPromise: Promise<SqlJsStatic> | null = null

async function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    const { default: initSqlJs } = await import('sql.js')
    sqlJsPromise = initSqlJs({ locateFile: () => '/sql-wasm.wasm' })
  }
  return sqlJsPromise
}

function ensureSchema(db: Database) {
  db.exec(SCHEMA_SQL)
}

export async function getDatabaseContext(
  rootHandle: FileSystemDirectoryHandle
): Promise<DbContext> {
  const cached = dbCache.get(rootHandle)
  if (cached) return cached

  const SQL = await getSqlJs()
  const fileHandle = await rootHandle.getFileHandle(DATABASE_FILE_NAME, { create: true })
  const file = await fileHandle.getFile()
  const buffer = await file.arrayBuffer()
  const db = buffer.byteLength > 0
    ? new SQL.Database(new Uint8Array(buffer))
    : new SQL.Database()

  ensureSchema(db)

  const context = { db, fileHandle }
  dbCache.set(rootHandle, context)
  return context
}

export async function saveDatabase(context: DbContext): Promise<void> {
  const data = context.db.export()
  const writable = await context.fileHandle.createWritable()
  await writable.write(data)
  await writable.close()
}

export function queryAll<T>(
  db: Database,
  sql: string,
  params: SqlValue[] = []
): T[] {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows: T[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T)
  }
  stmt.free()
  return rows
}

export function queryOne<T>(
  db: Database,
  sql: string,
  params: SqlValue[] = []
): T | null {
  const rows = queryAll<T>(db, sql, params)
  return rows.length > 0 ? rows[0] : null
}

export function runStatement(
  db: Database,
  sql: string,
  params: SqlValue[] = []
) {
  const stmt = db.prepare(sql)
  stmt.run(params)
  stmt.free()
}

export async function databaseFileExists(
  rootHandle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    await rootHandle.getFileHandle(DATABASE_FILE_NAME)
    return true
  } catch (error) {
    if ((error as any)?.name === 'NotFoundError') {
      return false
    }
    throw error
  }
}

export function getDatabaseFileName() {
  return DATABASE_FILE_NAME
}
