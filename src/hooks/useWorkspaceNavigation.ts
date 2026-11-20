'use client'

import { createContext, useContext, useMemo } from 'react'

export const WorkspaceSearchContext = createContext('')
export const WorkspaceActiveContext = createContext(true)

export function useWorkspaceSearchParams() {
  const query = useContext(WorkspaceSearchContext)
  return useMemo(() => new URLSearchParams(query), [query])
}

export function useWorkspaceActive() {
  return useContext(WorkspaceActiveContext)
}
