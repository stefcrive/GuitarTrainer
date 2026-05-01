'use client'

type StoredFileRecord = {
  key: string
  storageKey: string
  path: string
  data: ArrayBuffer
  mimeType?: string
  lastModified: number
}

type MemoryFileNode = {
  name: string
  file?: File
  data?: Uint8Array
  mimeType?: string
  lastModified: number
}

type MemoryDirectoryNode = {
  name: string
  directories: Map<string, MemoryDirectoryNode>
  files: Map<string, MemoryFileNode>
}

const DB_NAME = 'guitar-trainer-browser-fs'
const DB_VERSION = 1
const STORE_NAME = 'files'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
        store.createIndex('storageKey', 'storageKey', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function getStoredFiles(storageKey: string): Promise<StoredFileRecord[]> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('storageKey')
    const request = index.getAll(storageKey)

    request.onsuccess = () => resolve(request.result as StoredFileRecord[])
    request.onerror = () => reject(request.error)
  })
}

async function saveStoredFile(
  storageKey: string,
  path: string,
  data: Uint8Array,
  mimeType: string | undefined,
  lastModified: number
): Promise<void> {
  const db = await openDatabase()
  const record: StoredFileRecord = {
    key: `${storageKey}::${path}`,
    storageKey,
    path,
    data: data.buffer,
    mimeType,
    lastModified
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.put(record)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

function toUint8Array(data: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  }
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}

function normalizePath(path: string): string {
  return path.split('/').filter(Boolean).join('/')
}

function getRootNameFromFiles(files: File[]): string {
  const firstWithPath = files.find(file => file.webkitRelativePath)
  if (firstWithPath && firstWithPath.webkitRelativePath.includes('/')) {
    return firstWithPath.webkitRelativePath.split('/')[0]
  }
  return 'Selected Folder'
}

function getRelativePath(file: File, rootName: string): string {
  const relative = file.webkitRelativePath || file.name
  const segments = relative.split('/').filter(Boolean)
  if (segments.length > 0 && segments[0] === rootName) {
    segments.shift()
  }
  return normalizePath(segments.join('/') || file.name)
}

function createDirectoryNode(name: string): MemoryDirectoryNode {
  return {
    name,
    directories: new Map(),
    files: new Map()
  }
}

class MemoryWritableFileStream {
  private buffer: Uint8Array
  private position = 0
  private closed = false

  constructor(
    private node: MemoryFileNode,
    private path: string,
    private storageKey: string
  ) {
    this.buffer = node.data ? new Uint8Array(node.data) : new Uint8Array(0)
  }

  async write(data: BufferSource | Blob | string): Promise<void> {
    if (this.closed) return

    let next: Uint8Array
    if (typeof data === 'string') {
      next = new TextEncoder().encode(data)
    } else if (data instanceof Blob) {
      next = new Uint8Array(await data.arrayBuffer())
    } else if (data instanceof ArrayBuffer) {
      next = new Uint8Array(data)
    } else {
      next = toUint8Array(data)
    }

    const requiredLength = this.position + next.length
    if (requiredLength > this.buffer.length) {
      const expanded = new Uint8Array(requiredLength)
      expanded.set(this.buffer)
      this.buffer = expanded
    }

    this.buffer.set(next, this.position)
    this.position += next.length
  }

  async seek(position: number): Promise<void> {
    if (this.closed) return
    this.position = Math.max(0, position)
  }

  async truncate(size: number): Promise<void> {
    if (this.closed) return
    const nextSize = Math.max(0, size)
    if (nextSize === this.buffer.length) return
    const truncated = new Uint8Array(nextSize)
    truncated.set(this.buffer.subarray(0, nextSize))
    this.buffer = truncated
    if (this.position > nextSize) {
      this.position = nextSize
    }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    const dataCopy = new Uint8Array(this.buffer)
    const mimeType = this.node.mimeType || 'application/octet-stream'
    const lastModified = Date.now()

    this.node.data = dataCopy
    this.node.lastModified = lastModified
    this.node.file = new File([dataCopy], this.node.name, {
      type: mimeType,
      lastModified
    })

    try {
      await saveStoredFile(this.storageKey, this.path, dataCopy, mimeType, lastModified)
    } catch (error) {
      console.error('Failed to persist browser file data:', error)
    }
  }
}

class MemoryFileHandle implements FileSystemFileHandle {
  readonly kind = 'file' as const
  readonly name: string
  readonly __memoryHandle = true

  constructor(
    private node: MemoryFileNode,
    private storageKey: string,
    private path: string
  ) {
    this.name = node.name
  }

  async getFile(): Promise<File> {
    if (this.node.file) return this.node.file

    if (this.node.data) {
      const blob = new Blob([this.node.data], {
        type: this.node.mimeType || 'application/octet-stream'
      })
      const file = new File([blob], this.node.name, {
        type: this.node.mimeType,
        lastModified: this.node.lastModified
      })
      this.node.file = file
      return file
    }

    return new File([], this.node.name, {
      type: this.node.mimeType || 'application/octet-stream',
      lastModified: this.node.lastModified
    })
  }

  async createWritable(): Promise<FileSystemWritableFileStream> {
    if (!this.node.data && !this.node.file) {
      this.node.data = new Uint8Array(0)
      this.node.lastModified = Date.now()
    }
    return new MemoryWritableFileStream(this.node, this.path, this.storageKey) as FileSystemWritableFileStream
  }
}

class MemoryDirectoryHandle implements FileSystemDirectoryHandle {
  readonly kind = 'directory' as const
  readonly name: string
  readonly __memoryHandle = true

  constructor(
    private node: MemoryDirectoryNode,
    private storageKey: string,
    private path: string
  ) {
    this.name = node.name
  }

  async *entries(): AsyncIterableIterator<[string, FileSystemHandle]> {
    for (const [name, directory] of this.node.directories.entries()) {
      yield [name, new MemoryDirectoryHandle(directory, this.storageKey, this.joinPath(name))]
    }
    for (const [name, file] of this.node.files.entries()) {
      yield [name, new MemoryFileHandle(file, this.storageKey, this.joinPath(name))]
    }
  }

  async *values(): AsyncIterableIterator<FileSystemHandle> {
    for (const directory of this.node.directories.values()) {
      yield new MemoryDirectoryHandle(directory, this.storageKey, this.joinPath(directory.name))
    }
    for (const file of this.node.files.values()) {
      yield new MemoryFileHandle(file, this.storageKey, this.joinPath(file.name))
    }
  }

  async *keys(): AsyncIterableIterator<string> {
    for (const name of this.node.directories.keys()) {
      yield name
    }
    for (const name of this.node.files.keys()) {
      yield name
    }
  }

  async getDirectoryHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<FileSystemDirectoryHandle> {
    const existing = this.node.directories.get(name)
    if (existing) {
      return new MemoryDirectoryHandle(existing, this.storageKey, this.joinPath(name))
    }

    if (options?.create) {
      const created = createDirectoryNode(name)
      this.node.directories.set(name, created)
      return new MemoryDirectoryHandle(created, this.storageKey, this.joinPath(name))
    }

    throw Object.assign(new Error(`Directory not found: ${name}`), { name: 'NotFoundError' })
  }

  async getFileHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<FileSystemFileHandle> {
    const existing = this.node.files.get(name)
    if (existing) {
      return new MemoryFileHandle(existing, this.storageKey, this.joinPath(name))
    }

    if (options?.create) {
      const created: MemoryFileNode = {
        name,
        data: new Uint8Array(0),
        mimeType: 'application/octet-stream',
        lastModified: Date.now()
      }
      this.node.files.set(name, created)
      return new MemoryFileHandle(created, this.storageKey, this.joinPath(name))
    }

    throw Object.assign(new Error(`File not found: ${name}`), { name: 'NotFoundError' })
  }

  private joinPath(name: string): string {
    return normalizePath([this.path, name].filter(Boolean).join('/'))
  }
}

export async function createMemoryDirectoryHandleFromFiles(
  filesInput: FileList | File[]
): Promise<FileSystemDirectoryHandle> {
  const files = Array.from(filesInput)
  if (files.length === 0) {
    throw new Error('No files selected')
  }

  const rootName = getRootNameFromFiles(files)
  const rootNode = createDirectoryNode(rootName)
  const storageKey = rootName

  for (const file of files) {
    const relativePath = getRelativePath(file, rootName)
    const segments = relativePath.split('/').filter(Boolean)
    if (segments.length === 0) continue
    const fileName = segments.pop()!

    let current = rootNode
    for (const segment of segments) {
      const existing = current.directories.get(segment)
      if (existing) {
        current = existing
      } else {
        const created = createDirectoryNode(segment)
        current.directories.set(segment, created)
        current = created
      }
    }

    current.files.set(fileName, {
      name: fileName,
      file,
      mimeType: file.type,
      lastModified: file.lastModified
    })
  }

  try {
    const storedFiles = await getStoredFiles(storageKey)
    for (const stored of storedFiles) {
      const path = normalizePath(stored.path)
      if (!path) continue
      const segments = path.split('/').filter(Boolean)
      if (segments.length === 0) continue
      const fileName = segments.pop()!

      let current = rootNode
      for (const segment of segments) {
        const existing = current.directories.get(segment)
        if (existing) {
          current = existing
        } else {
          const created = createDirectoryNode(segment)
          current.directories.set(segment, created)
          current = created
        }
      }

      if (!current.files.has(fileName)) {
        const data = stored.data instanceof ArrayBuffer
          ? new Uint8Array(stored.data)
          : new Uint8Array((stored.data as unknown as Uint8Array).buffer)

        current.files.set(fileName, {
          name: fileName,
          data,
          mimeType: stored.mimeType,
          lastModified: stored.lastModified
        })
      }
    }
  } catch (error) {
    console.error('Failed to load persisted browser files:', error)
  }

  return new MemoryDirectoryHandle(rootNode, storageKey, '')
}

export function isMemoryDirectoryHandle(
  handle: FileSystemDirectoryHandle | null | undefined
): boolean {
  return Boolean(handle && (handle as { __memoryHandle?: boolean }).__memoryHandle)
}
