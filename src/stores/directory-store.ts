import { create } from 'zustand'

interface DirectoryState {
  rootHandle: FileSystemDirectoryHandle | null
  audioRootHandle: FileSystemDirectoryHandle | null
  scanVideoFolderForAudio: boolean
  expandedFolders: Set<string>
  setRootHandle: (handle: FileSystemDirectoryHandle | null) => void
  setAudioRootHandle: (handle: FileSystemDirectoryHandle | null) => void
  setScanVideoFolderForAudio: (scan: boolean) => void
  refreshVideoList: () => void // Force refresh without changing handle
  refreshAudioList: () => void // Force refresh without changing handle
  lastUpdate: number // Timestamp to trigger re-renders
  // Folder expansion actions
  expandFolder: (path: string) => void
  collapseFolder: (path: string) => void
  setExpandedFolders: (paths: string[]) => void
  expandToPath: (filePath: string) => void
}

export const useDirectoryStore = create<DirectoryState>()((set) => ({
  rootHandle: null,
  audioRootHandle: null,
  scanVideoFolderForAudio: false,
  expandedFolders: new Set<string>(),
  lastUpdate: Date.now(),
  setRootHandle: (handle) => set({ rootHandle: handle, lastUpdate: Date.now() }),
  setAudioRootHandle: (handle) => set({ audioRootHandle: handle, lastUpdate: Date.now() }),
  setScanVideoFolderForAudio: (scan) => set({ scanVideoFolderForAudio: scan, lastUpdate: Date.now() }),
  refreshVideoList: () => set(state => ({ lastUpdate: Date.now() })),
  refreshAudioList: () => set(state => ({ lastUpdate: Date.now() })),
  expandFolder: (path) => set(state => ({
    expandedFolders: new Set([...state.expandedFolders, path])
  })),
  collapseFolder: (path) => set(state => {
    const newExpanded = new Set(state.expandedFolders)
    newExpanded.delete(path)
    return { expandedFolders: newExpanded }
  }),
  setExpandedFolders: (paths) => set({
    expandedFolders: new Set(paths)
  }),
  expandToPath: (filePath) => set(state => {
    // Split the path and progressively build folder paths
    const parts = filePath.split('/')
    const folderPaths = parts.slice(0, -1).reduce<string[]>((paths, part, index) => {
      const currentPath = index === 0 ? part : `${paths[index - 1]}/${part}`
      paths.push(currentPath)
      return paths
    }, [])
    return {
      expandedFolders: new Set([...state.expandedFolders, ...folderPaths])
    }
  })
}))