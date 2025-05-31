interface FileSystemHandle {
  kind: 'file' | 'directory'
  name: string
}

interface FileSystemFileHandle extends FileSystemHandle {
  kind: 'file'
  getFile(): Promise<File>
  createWritable(options?: FileSystemCreateWritableOptions): Promise<FileSystemWritableFileStream>
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  kind: 'directory'
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
  values(): AsyncIterableIterator<FileSystemHandle>
  keys(): AsyncIterableIterator<string>
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>
}

interface FileSystemCreateWritableOptions {
  keepExistingData?: boolean
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: BufferSource | Blob | string): Promise<void>
  seek(position: number): Promise<void>
  truncate(size: number): Promise<void>
}

interface Window {
  showDirectoryPicker(options?: {
    mode?: 'read' | 'readwrite'
  }): Promise<FileSystemDirectoryHandle>
}