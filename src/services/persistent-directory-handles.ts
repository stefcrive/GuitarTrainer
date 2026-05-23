'use client'

import { isMemoryDirectoryHandle } from '@/services/memory-file-system'

export type PersistentDirectorySlot = 'videoRoot' | 'audioRoot'

const DB_NAME = 'guitar-trainer-directory-handles'
const DB_VERSION = 1
const STORE_NAME = 'handles'

type DirectoryHandleRecord = {
  key: PersistentDirectorySlot
  handle: FileSystemDirectoryHandle
  updatedAt: number
}

function isIndexedDbAvailable(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error('IndexedDB is not available in this browser.'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode)
    const store = tx.objectStore(STORE_NAME)
    const request = callback(store)

    if (request) {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    } else {
      tx.oncomplete = () => resolve(undefined)
    }

    tx.onerror = () => reject(tx.error)
  })
}

export async function savePersistentDirectoryHandle(
  slot: PersistentDirectorySlot,
  handle: FileSystemDirectoryHandle
): Promise<void> {
  if (isMemoryDirectoryHandle(handle)) return

  const record: DirectoryHandleRecord = {
    key: slot,
    handle,
    updatedAt: Date.now()
  }

  await withStore('readwrite', (store) => store.put(record))
}

export async function loadPersistentDirectoryHandle(
  slot: PersistentDirectorySlot
): Promise<FileSystemDirectoryHandle | null> {
  const record = await withStore<DirectoryHandleRecord | undefined>(
    'readonly',
    (store) => store.get(slot)
  )

  return record?.handle ?? null
}

export async function clearPersistentDirectoryHandle(
  slot: PersistentDirectorySlot
): Promise<void> {
  await withStore('readwrite', (store) => {
    store.delete(slot)
  })
}

export async function ensureDirectoryHandlePermission(
  handle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite' = 'readwrite'
): Promise<boolean> {
  const descriptor = { mode }

  if (typeof handle.queryPermission === 'function') {
    const current = await handle.queryPermission(descriptor)
    if (current === 'granted') return true
  }

  if (typeof handle.requestPermission === 'function') {
    const next = await handle.requestPermission(descriptor)
    return next === 'granted'
  }

  return true
}
