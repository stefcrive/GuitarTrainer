import type { MarkerCatalogItem } from '@/services/marker-catalog'

export async function openPracticeFile(item: MarkerCatalogItem) {
  const parts = item.contentPath.replace(/\\/g, '/').split('/').filter(Boolean)
  let directory = item.storage.handle
  for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part)
  const handle = await directory.getFileHandle(parts[parts.length - 1])
  return handle.getFile()
}
