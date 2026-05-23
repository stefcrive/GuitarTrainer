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
CREATE TABLE IF NOT EXISTS marker_content_identities (
  identity_key TEXT PRIMARY KEY,
  content_path TEXT NOT NULL,
  content_type TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS marker_learning_state (
  marker_key TEXT PRIMARY KEY,
  content_path TEXT NOT NULL,
  marker_id TEXT NOT NULL,
  domain TEXT,
  stability REAL NOT NULL DEFAULT 0,
  difficulty REAL NOT NULL DEFAULT 5,
  due_at INTEGER,
  last_practiced_at INTEGER,
  total_practice_ms INTEGER NOT NULL DEFAULT 0,
  repetitions INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS learning_sessions (
  id TEXT PRIMARY KEY,
  routine_date TEXT NOT NULL,
  target_minutes INTEGER NOT NULL,
  objective TEXT NOT NULL,
  deliverable TEXT NOT NULL,
  status TEXT NOT NULL,
  daily_schedule TEXT NOT NULL,
  recording_assignment TEXT NOT NULL,
  review_question TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE TABLE IF NOT EXISTS learning_session_items (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  marker_key TEXT NOT NULL,
  content_path TEXT NOT NULL,
  marker_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  role TEXT NOT NULL,
  planned_minutes INTEGER NOT NULL,
  rationale TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY(session_id) REFERENCES learning_sessions(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS learning_events (
  id TEXT PRIMARY KEY,
  marker_key TEXT NOT NULL,
  session_id TEXT,
  event_type TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  duration_ms INTEGER,
  progress_before INTEGER,
  progress_after INTEGER,
  rating TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_marker_learning_due_at ON marker_learning_state(due_at);
CREATE INDEX IF NOT EXISTS idx_marker_content_identity_path ON marker_content_identities(content_path);
CREATE INDEX IF NOT EXISTS idx_learning_events_marker_key ON learning_events(marker_key);
CREATE INDEX IF NOT EXISTS idx_learning_events_occurred_at ON learning_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_learning_session_items_session ON learning_session_items(session_id);
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

export async function reloadDatabaseContext(
  rootHandle: FileSystemDirectoryHandle
): Promise<DbContext> {
  const cached = dbCache.get(rootHandle)
  cached?.db.close()
  dbCache.delete(rootHandle)
  return getDatabaseContext(rootHandle)
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
