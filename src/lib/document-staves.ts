import type { DocumentRegion } from '@/types/document'

export interface DetectedStaff { kind: 'notation' | 'tab'; region: DocumentRegion; lines: number[]; slope: number }

// Geometric proposals, not a claim of recognized music. The user can adjust the crop.
export function detectStaves(image: { width: number; height: number; data: Uint8ClampedArray }): DetectedStaff[] {
  const { width, height, data } = image
  // Project ink along several small angles. Book scans frequently have a tilt,
  // and an ordinary horizontal projection misses even a one-degree rotation.
  const ink: number[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4
      if (data[i + 3] > 100 && data[i] + data[i + 1] + data[i + 2] < 480) ink.push(x, y)
    }
  }
  let bestRows: { y: number; left: number; right: number; strength: number }[] = [], bestSlope = 0, bestStrength = 0
  for (let degrees = -3; degrees <= 3; degrees += 0.25) {
    const slope = Math.tan(degrees * Math.PI / 180)
    const histogram = new Uint32Array(height)
    for (let i = 0; i < ink.length; i += 2) {
      const y = Math.round(ink[i + 1] - slope * (ink[i] - width / 2))
      if (y >= 0 && y < height) histogram[y]++
    }
    const rows: { y: number; left: number; right: number; strength: number }[] = []
    let strength = 0
    for (let y = 0; y < height; y++) {
      if (histogram[y] < width * 0.19) continue
      strength += histogram[y] ** 2
      const previous = rows.at(-1)
      if (previous && y - previous.y <= 2) { previous.y = y; previous.strength = Math.max(previous.strength, histogram[y]) }
      else rows.push({ y, left: 0, right: width, strength: histogram[y] })
    }
    if (rows.length >= 5 && strength > bestStrength) { bestRows = rows; bestSlope = slope; bestStrength = strength }
  }
  const rows = bestRows
  const found: DetectedStaff[] = []
  for (let i = 0; i + 4 < rows.length;) {
    let matched = false
    for (const count of [6, 5]) {
      const group = rows.slice(i, i + count)
      if (group.length !== count) continue
      // Beams can be spaced exactly like a sixth staff line, but occupy less of
      // the page width. Do not erase an entire notation row on that evidence.
      const medianStrength = group.map(row => row.strength).sort((a, b) => a - b)[Math.floor(count / 2)]
      if (count === 6 && group.some(row => row.strength < medianStrength * 0.85)) continue
      const gap = (group[count - 1].y - group[0].y) / (count - 1)
      // A beam just above a five-line staff must not turn it into six-string TAB.
      // Staff lines have much more regular spacing than beam + staff combinations.
      if (gap < 4 || gap > height / 4 || group.slice(1).some((row, j) => Math.abs(row.y - group[j].y - gap) > Math.max(1, gap * 0.16))) continue
      const left = Math.max(0, Math.min(...group.map(row => row.left)) - gap * 2)
      const right = Math.min(width, Math.max(...group.map(row => row.right)) + gap * 2)
      const skewMargin = Math.abs(bestSlope * width / 2)
      const top = Math.max(0, group[0].y - gap * 4 - skewMargin)
      const bottom = Math.min(height, group[count - 1].y + gap * 3 + skewMargin)
      found.push({ kind: count === 6 ? 'tab' : 'notation', region: { x: left / width, y: top / height, width: (right - left) / width, height: (bottom - top) / height }, lines: group.map(row => row.y), slope: bestSlope })
      i += count; matched = true; break
    }
    if (!matched) i++
  }
  return found
}
