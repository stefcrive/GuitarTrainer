import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface DirectoryState {
  // Non-serializable handles (not persisted)
  rootHandle: FileSystemDirectoryHandle | null
  audioRootHandle: FileSystemDirectoryHandle | null

  // Serializable persisted state
  rootPath: string | null
  audioRootPath: string | null
  scanVideoFolderForAudio: boolean
  expandedFolders: string[]
  lastUpdate: number

  // Actions
  setRootHandle: (handle: FileSystemDirectoryHandle | null, path?: string) => void
  setAudioRootHandle: (handle: FileSystemDirectoryHandle | null, path?: string) => void
  setScanVideoFolderForAudio: (scan: boolean) => void
  refreshVideoList: () => void
  refreshAudioList: () => void
  expandFolder: (path: string) => void
  collapseFolder: (path: string) => void
  setExpandedFolders: (paths: string[]) => void
  expandToPath: (filePath: string) => void
}

export const useDirectoryStore = create<DirectoryState>()(
  persist(
    (set) => ({
      rootHandle: null,
      audioRootHandle: null,
      rootPath: null,
      audioRootPath: null,
      scanVideoFolderForAudio: false,
      expandedFolders: [],
      lastUpdate: Date.now(),

      setRootHandle: (handle, path) =>
        set({ rootHandle: handle, rootPath: path ?? null, lastUpdate: Date.now() }),
      setAudioRootHandle: (handle, path) =>
        set({ audioRootHandle: handle, audioRootPath: path ?? null, lastUpdate: Date.now() }),
      setScanVideoFolderForAudio: (scan) =>
        set({ scanVideoFolderForAudio: scan, lastUpdate: Date.now() }),
      refreshVideoList: () => set(() => ({ lastUpdate: Date.now() })),
      refreshAudioList: () => set(() => ({ lastUpdate: Date.now() })),
      expandFolder: (path) =>
        set((state) => ({
          expandedFolders: [...new Set([...state.expandedFolders, path])],
        })),
      collapseFolder: (path) =>
        set((state) => ({
          expandedFolders: state.expandedFolders.filter((p) => p !== path),
        })),
      setExpandedFolders: (paths) => set({ expandedFolders: [...paths] }),
      expandToPath: (filePath) =>
        set((state) => {
          const parts = filePath.split('/')
          const folderPaths = parts.slice(0, -1).reduce<string[]>((paths, part, index) => {
            const currentPath = index === 0 ? part : `${paths[index - 1]}/${part}`
            paths.push(currentPath)
            return paths
          }, [])
          return {
            expandedFolders: [...new Set([...state.expandedFolders, ...folderPaths])],
          }
        }),
    }),
    {
      name: 'directory-storage',
      partialize: (state) => ({
        rootPath: state.rootPath,
        audioRootPath: state.audioRootPath,
        scanVideoFolderForAudio: state.scanVideoFolderForAudio,
        expandedFolders: state.expandedFolders,
      }),
    }
  )
)