import type { DocumentMarker, MarkerCandidate } from '@/types/document'

export function markerFromCandidate(candidate: MarkerCandidate): DocumentMarker {
  return { ...candidate, id: crypto.randomUUID(), endPage: candidate.page, kind: 'section', notes: '', tags: [], completionDegree: 0 }
}

export function extractMarkerCandidates(text: string, page: number, totalPages: number, pageOffset = 0): MarkerCandidate[] {
  const candidates: MarkerCandidate[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.length < 4 || line.length > 180) continue
    // TOC page numbers are printed page numbers. The user supplies the front-matter offset.
    const entry = line.match(/^(.{3,130}?)(?:\s*\.{2,}\s*|\s{2,})(\d{1,4})\s*$/)
    if (entry && (entry[1].match(/\p{L}/gu)?.length ?? 0) >= 3) {
      const target = Number(entry[2]) + pageOffset
      if (target >= 1 && target <= totalPages) candidates.push({ title: entry[1].trim(), page: target, origin: 'index' })
      continue
    }
    if (/^#{1,6}\s+\S/.test(line) || /^(?:chapter|part|lesson|exercise|study|etude|unit|section|capitulo|li[cç][aã]o)\s+[\dIVXLC]+\b/i.test(line)
      || (/^[A-Z][A-Z\s\d&,:()'/-]{4,75}$/.test(line) && /[A-Z]{3}/.test(line))) {
      candidates.push({ title: line.replace(/^#{1,6}\s+/, ''), page, origin: 'heading' })
    }
  }
  return uniqueCandidates(candidates)
}

export function uniqueCandidates(candidates: MarkerCandidate[]): MarkerCandidate[] {
  const seen = new Set<string>()
  return candidates.filter(candidate => {
    const key = `${candidate.page}:${candidate.title.trim().toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).sort((a, b) => a.page - b.page)
}

export function mergeDocumentMarkers(existing: DocumentMarker[], added: DocumentMarker[]): DocumentMarker[] {
  const keys = new Set(existing.map(marker => `${marker.page}:${marker.title.trim().toLowerCase()}`))
  return [...existing, ...added.filter(marker => {
    const key = `${marker.page}:${marker.title.trim().toLowerCase()}`
    if (keys.has(key)) return false
    keys.add(key)
    return true
  })].sort((a, b) => a.page - b.page)
}

export function splitDocumentText(text: string): string[] {
  // Preserve explicit page breaks; otherwise split on headings or bounded line groups.
  const pages = text.split('\f')
  if (pages.length > 1) return pages
  const result: string[] = []
  let lines: string[] = []
  for (const line of text.split(/\r?\n/)) {
    if (lines.length >= 65 || (lines.length > 8 && /^#{1,3}\s|^Chapter\s+\d/i.test(line))) {
      result.push(lines.join('\n')); lines = []
    }
    lines.push(line)
  }
  if (lines.length) result.push(lines.join('\n'))
  return result.length ? result : ['']
}
