export type MaterialKind = 'video' | 'audio' | 'document'
export interface MaterialFile { path: string; name: string; kind: MaterialKind }
export interface MaterialGroup { path: string; files: Record<MaterialKind, MaterialFile[]> }

export const documentExtensions = new Set(['pdf', 'txt', 'md', 'tab', 'docx', 'musicxml', 'xml', 'mxl', 'jpg', 'jpeg', 'png', 'gif', 'webp'])
export function skipMaterialEntry(name: string): boolean {
  return name.startsWith('.') || /^(node_modules|dist|build|outputs|__pycache__)$/i.test(name) || /\.(app|logicx|cmproj)$/i.test(name)
}
export function materialKind(name: string): MaterialKind | undefined {
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  if (['mp4', 'webm', 'mov'].includes(extension)) return 'video'
  if (['mp3', 'wav', 'm4a', 'ogg', 'aac', 'aiff'].includes(extension)) return 'audio'
  if (documentExtensions.has(extension)) return 'document'
}

// Only collapse dedicated media folders, never subjects, course names or lessons.
export function materialFolderPath(path: string): string {
  return path.replace(/\\/g, '/').split('/').slice(0, -1)
    .filter(part => !/^(audio|videos?|pdfs?|books?|documents?|mp3|mp4)$/i.test(part)).join('/')
}

export function materialGroupPath(path: string): string | null {
  const parts = materialFolderPath(path).split('/').filter(Boolean)
  if (!parts.length) return null
  const subject = parts.findIndex(part => /^\d{2} - /.test(part))
  // Loose files in a subject are independent books, not companion material.
  if (subject >= 0) return parts.length > subject + 1 ? parts.slice(0, subject + 2).join('/') : null
  // For arbitrary libraries use the containing lesson folder, not the whole root.
  return parts.join('/')
}

export function buildMaterialIndex(files: MaterialFile[]) {
  const groups = new Map<string, MaterialGroup>()
  const byPath = new Map<string, MaterialGroup>()
  for (const file of files) {
    const path = materialGroupPath(file.path)
    if (!path) continue
    let group = groups.get(path)
    if (!group) { group = { path, files: { video: [], audio: [], document: [] } }; groups.set(path, group) }
    group.files[file.kind].push(file)
    byPath.set(file.path, group)
  }
  for (const group of groups.values()) for (const files of Object.values(group.files)) files.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
  return { groups, byPath }
}

export function materialHref(kind: MaterialKind, group: string, file?: string): string {
  const route = { video: '/videos', audio: '/audio', document: '/documents' }[kind]
  const params = new URLSearchParams({ material: group })
  if (file) params.set({ video: 'video', audio: 'audio', document: 'document' }[kind], file)
  return `${route}?${params}`
}
