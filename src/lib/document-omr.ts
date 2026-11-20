import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { parseMusicXml, readMusicXml } from './document-score'
import { readOmrLayout } from './document-omr-layout'

export async function findAudiveris(): Promise<string | null> {
  let local = ''
  try { local = (await readFile(path.join(process.cwd(), '.document-tools/audiveris-path.txt'), 'utf8')).replace(/^\uFEFF/, '').trim() } catch {}
  const candidates = [process.env.AUDIVERIS_PATH, local,
    process.platform === 'win32' ? 'C:/Program Files/Audiveris/Audiveris.exe' : '/usr/bin/audiveris']
  for (const candidate of candidates) {
    if (!candidate || !path.isAbsolute(candidate)) continue
    try { await access(candidate); return candidate } catch {}
  }
  return null
}

export async function recognizeNotation(executable: string, image: Uint8Array, signal: AbortSignal) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'guitar-document-'))
  try {
    const input = path.join(directory, 'selection.png')
    const output = path.join(directory, 'output')
    await writeFile(input, image)
    signal.throwIfAborted()
    let exitCode: number | null = 0
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, ['-batch', '-save', '-transcribe', '-export', '-constant', 'org.audiveris.omr.sheet.ProcessingSwitches.implicitTuplets=true', '-output', output, '--', input], { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
      let timedOut = false
      const timer = setTimeout(() => { timedOut = true; child.kill() }, 180_000)
      const abort = () => child.kill()
      signal.addEventListener('abort', abort, { once: true })
      // Drain both streams; never retain arbitrary document text in server logs.
      child.stdout.resume(); child.stderr.resume()
      const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort) }
      child.once('error', () => { cleanup(); reject(new Error('Audiveris could not start. Check AUDIVERIS_PATH and its Java runtime.')) })
      child.once('close', code => {
        cleanup()
        if (signal.aborted) reject(new DOMException('Recognition cancelled', 'AbortError'))
        else if (timedOut) reject(new Error('Recognition exceeded three minutes. Select one complete staff system and try again.'))
        else { exitCode = code; resolve() }
      })
    })
    const files: string[] = []
    const archives: string[] = []
    async function walk(folder: string) {
      for (const entry of await readdir(folder, { withFileTypes: true })) {
        const target = path.join(folder, entry.name)
        if (entry.isDirectory()) await walk(target)
        else if (/\.(mxl|musicxml)$/i.test(entry.name)) files.push(target)
        else if (/\.omr$/i.test(entry.name)) archives.push(target)
      }
    }
    try { await walk(output) } catch { throw new Error('No score was produced. Include a complete staff with its clef and time signature.') }
    if (!files.length) throw new Error('No music was recognized. Try a clearer selection, import MusicXML, or enter notes manually.')
    const locate = archives.length ? readOmrLayout(new Uint8Array(await readFile(archives[0]))) : undefined
    const results = await Promise.allSettled(files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(async file => parseMusicXml(readMusicXml(new Uint8Array(await readFile(file))), 'audiveris', locate)))
    const scores = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
    if (!scores.length) throw new Error('Audiveris produced no usable notes. Automatic page-context recovery will be attempted.')
    // Movement filenames and restarted measure numbers need not follow printed order.
    const firstPosition = (score: typeof scores[number]) => score.notes.filter(note => note.position).map(note => note.position!).sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x)[0]
    scores.sort((a, b) => { const x = firstPosition(a), y = firstPosition(b); return x && y ? x.page - y.page || x.y - y.y || x.x - y.x : 0 })
    if (exitCode !== 0 || results.some(result => result.status === 'rejected')) scores.forEach(score => score.warnings.push('Audiveris reported a partial transcription; usable exported music was recovered.'))
    return scores
  } finally {
    // Only the unique directory created above is removed; user documents are never changed.
    await rm(directory, { recursive: true, force: true })
  }
}
