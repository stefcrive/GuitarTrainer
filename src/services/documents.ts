'use client'

import type { DocumentFormat, DocumentState, LibraryDocument } from '@/types/document'

import { documentExtensions as formats, skipMaterialEntry } from '@/lib/practice-material'
export const DOCUMENTS_UPDATED_EVENT = 'documents-updated'

export async function loadDocumentLibrary(root: FileSystemDirectoryHandle, signal?: AbortSignal) {
  const files = await scanDocuments(root, signal)
  const records: { entry: LibraryDocument; state: DocumentState | null }[] = []
  for (const entry of files) {
    signal?.throwIfAborted()
    records.push({ entry, state: await loadDocumentState(root, entry.path) })
  }
  return records
}

export async function resolveDocument(root: FileSystemDirectoryHandle, path: string): Promise<LibraryDocument> {
  const parts = path.split('/').filter(Boolean)
  let directory = root
  for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part)
  const name = parts[parts.length - 1]
  return { name, path, format: name.split('.').pop()!.toLowerCase() as DocumentFormat, handle: await directory.getFileHandle(name) }
}

export async function scanDocuments(root: FileSystemDirectoryHandle, signal?: AbortSignal): Promise<LibraryDocument[]> {
  const files: LibraryDocument[] = []
  async function walk(directory: FileSystemDirectoryHandle, prefix: string) {
    for await (const [name, entry] of directory.entries()) {
      signal?.throwIfAborted()
      if (skipMaterialEntry(name)) continue
      const path = prefix ? `${prefix}/${name}` : name
      if (entry.kind === 'directory') await walk(entry as FileSystemDirectoryHandle, path)
      else {
        const format = name.split('.').pop()?.toLowerCase() as DocumentFormat
        if (formats.has(format)) files.push({ name, path, format, handle: entry as FileSystemFileHandle })
      }
    }
  }
  await walk(root, '')
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

async function stateName(path: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(path))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') + '.json'
}

export async function loadDocumentState(root: FileSystemDirectoryHandle, path: string): Promise<DocumentState | null> {
  try {
    const folder = await root.getDirectoryHandle('.guitar-documents')
    const handle = await folder.getFileHandle(await stateName(path))
    const value = JSON.parse(await (await handle.getFile()).text()) as DocumentState
    if (value.version !== 1 || !Array.isArray(value.markers) || !Number.isInteger(value.page)
      || value.markers.some(marker => !marker || typeof marker.id !== 'string' || typeof marker.title !== 'string'
        || !Number.isInteger(marker.page) || marker.page < 1 || !Array.isArray(marker.tags))) throw new Error('The document marker file is invalid. Restore a valid .guitar-documents backup before editing.')
    return value
  } catch (error) {
    if (error instanceof Error && error.name === 'NotFoundError') return null
    throw error
  }
}

// Serialize writes so a slower save cannot overwrite a newer edit.
const queues = new WeakMap<FileSystemDirectoryHandle, Promise<void>>()
export function saveDocumentState(root: FileSystemDirectoryHandle, path: string, state: DocumentState): Promise<void> {
  const json = JSON.stringify(state)
  const pending = (queues.get(root) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const folder = await root.getDirectoryHandle('.guitar-documents', { create: true })
    const handle = await folder.getFileHandle(await stateName(path), { create: true })
    const writable = await handle.createWritable()
    try {
      await writable.write(json); await writable.close()
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(DOCUMENTS_UPDATED_EVENT, { detail: { root, path, state } }))
    }
    catch (error) { if (typeof writable.abort === 'function') await writable.abort().catch(() => {}); throw error }
  })
  queues.set(root, pending)
  return pending
}
