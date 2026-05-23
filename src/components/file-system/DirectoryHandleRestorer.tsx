'use client'

import { useEffect } from 'react'
import { useDirectoryStore } from '@/stores/directory-store'
import {
  ensureDirectoryHandlePermission,
  loadPersistentDirectoryHandle
} from '@/services/persistent-directory-handles'

export function DirectoryHandleRestorer() {
  const {
    rootHandle,
    audioRootHandle,
    setRootHandle,
    setAudioRootHandle
  } = useDirectoryStore()

  useEffect(() => {
    let cancelled = false

    async function restoreHandles() {
      try {
        const [savedVideoRoot, savedAudioRoot] = await Promise.all([
          rootHandle ? Promise.resolve(null) : loadPersistentDirectoryHandle('videoRoot'),
          audioRootHandle ? Promise.resolve(null) : loadPersistentDirectoryHandle('audioRoot')
        ])

        if (cancelled) return

        if (savedVideoRoot && await ensureDirectoryHandlePermission(savedVideoRoot)) {
          setRootHandle(savedVideoRoot)
        }

        if (savedAudioRoot && await ensureDirectoryHandlePermission(savedAudioRoot)) {
          setAudioRootHandle(savedAudioRoot)
        }
      } catch (error) {
        console.warn('Unable to restore saved directory handles:', error)
      }
    }

    void restoreHandles()

    return () => {
      cancelled = true
    }
  }, [audioRootHandle, rootHandle, setAudioRootHandle, setRootHandle])

  return null
}
