// Local, reversible organization. Planning never changes source files.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const root = path.resolve(process.argv[2] || '')
const audit = path.resolve(process.argv[3] || '')
const mode = process.argv[4] || 'plan'
if (!process.argv[2] || !process.argv[3] || root === audit || audit.startsWith(root + path.sep)) throw Error('Supply a material root and an audit directory outside it.')
function inside(base, relative) {
  const target = path.resolve(base, relative)
  if (!target.startsWith(base + path.sep)) throw Error('Path escapes root: ' + relative)
  return target
}
const json = (name, value) => fs.writeFileSync(inside(audit, name), JSON.stringify(value, null, 2))
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
async function checksum(file) {
  const digest = crypto.createHash('sha256')
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk)
  return digest.digest('hex')
}
function inventory(base = root, prefix = '') {
  return fs.readdirSync(base, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink()) throw Error('Refusing a symbolic link: ' + entry.name)
    const rel = prefix + entry.name
    return entry.isDirectory() ? inventory(inside(root, rel), rel + '/') : [{ path: rel, size: fs.statSync(inside(root, rel)).size }]
  })
}
function destination(rel) {
  let next = rel.replace(/^Guitar Books\/Nuovo corso di studi\/Jazz Anatomy\//, '05 - Jazz and Fusion/Jazz Anatomy/')
    .replace(/^Guitar Books\/Nuovo corso di studi\/True.Fire.Jazz.University.8CD-AUDIOnews\//, '90 - Legacy Video Courses/TrueFire - Jazz University/')
    .replace(/^Guitar Books\/(\d{2} - [^/]+)\//, '$1/')
    .replace(/^09 - Arranging and Sound\//, '10 - Arranging and Sound/')
    .replace(/^Guitar Books\//, '99 - Review/Book Collection Resources/')
    .replace(/^The Loop Loft - Odd Meter Grooves Vol 2\//, '09 - Rhythm and Backing Resources/The Loop Loft - Odd Meter Grooves Vol 2/')
    .replace(/^The Loop Loft \u2013 The Bundle of Brushes Vol.1,2\//, '09 - Rhythm and Backing Resources/The Loop Loft - The Bundle of Brushes Volumes 1 and 2/')
    .replace('06 - Blues and Rock/Eric Johnson - Manhattan by Guthrie Govan/', '06 - Blues and Rock/Eric Johnson - Manhattan - Lesson by Guthrie Govan/')
  const named = {
    '01 - Fretboard and Foundations/Fingerboard Breakthrough.pdf': '01 - Fretboard and Foundations/Howard Morgen - Fingerboard Breakthrough/Howard Morgen - Fingerboard Breakthrough - Book.pdf',
    '04 - Scales and Improvisation/Don Mock - Melodic Minor Revealed.pdf': '04 - Scales and Improvisation/Don Mock - Melodic Minor Revealed/Don Mock - Melodic Minor Revealed.pdf',
    '08 - Repertoire and Play-Alongs/Wes Montgomery-Play-A-Long-Book (audio Jamey Aebersold inclus).pdf': '08 - Repertoire and Play-Alongs/Wes Montgomery - Play-Along/Wes Montgomery - Play-Along - Book.pdf',
    '06 - Blues and Rock/Guitar Lessons Brett Garsed - Rock Fusion - Complete.avi': '05 - Jazz and Fusion/Brett Garsed - Rock Fusion/Brett Garsed - Rock Fusion - Complete.avi',
    '06 - Blues and Rock/Brett Garsed - Rock Fusion video book.pdf': '05 - Jazz and Fusion/Brett Garsed - Rock Fusion/Brett Garsed - Rock Fusion - Book.pdf',
    '05 - Jazz and Fusion/Brett Garsed - Rock Fusion video book.pdf': '05 - Jazz and Fusion/Brett Garsed - Rock Fusion/Brett Garsed - Rock Fusion - Book.pdf',
    '03 - Technique and Practice/Guthrie Govan guitar book 1.pdf': '03 - Technique and Practice/Guthrie Govan - Creative Guitar 1 - Cutting-Edge Techniques/Guthrie Govan - Creative Guitar 1 - Book.pdf',
    '03 - Technique and Practice/Guthrie Govan guitar book 2.pdf': '03 - Technique and Practice/Guthrie Govan - Creative Guitar 2 - Advanced Techniques/Guthrie Govan - Creative Guitar 2 - Book.pdf',
    '03 - Technique and Practice/feismo.com-buck-brown-the-serious-guitarist-jazz-chops-pr_3b0916a8976de8d1cd1b1437bc1c6796.pdf': '05 - Jazz and Fusion/Buck Brown - The Serious Guitarist - Jazz Chops.pdf',
    '03 - Technique and Practice/feismo.com-the-serious-jazz-practice-book-i-compress-pr_bd838b5198509dccb9fceefba640718a.pdf': '05 - Jazz and Fusion/The Serious Jazz Practice Book I.pdf',
    '03 - Technique and Practice/toaz.info-buck-brown-the-serious-guitarist-blues-chops-2014-pr_fa517f7d51563d16f72d01c8e65077a0.pdf': '06 - Blues and Rock/Buck Brown - The Serious Guitarist - Blues Chops (2014).pdf',
    '05 - Jazz and Fusion/Mark Lettieri - Guitar Method and Master Course.mp4': '05 - Jazz and Fusion/Mark Lettieri - Guitar Method and Master Course/Mark Lettieri - Guitar Method and Master Course.mp4'
  }
  if (named[next]) next = named[next]
  if (/^05 - Jazz and Fusion\/Eric Johnson - (Fine Art Of Guitar|The Fine Art of Guitar Booklet)/i.test(next)) next = next.replace('05 - Jazz and Fusion/', '06 - Blues and Rock/Eric Johnson - The Fine Art of Guitar/')
  return next
}
async function main() {
  if (mode === 'plan') {
    if (fs.existsSync(inside(audit, 'execution.jsonl'))) throw Error('Audit has already been applied.')
    if (fs.existsSync(inside(audit, 'plan.json'))) fs.copyFileSync(inside(audit, 'plan.json'), inside(audit, 'plan.previous.json'))
    fs.mkdirSync(audit, { recursive: true })
    const files = inventory(), occupied = new Set(files.map(file => file.path.toLowerCase())), moves = []
    for (const file of files) {
      let next = destination(file.path)
      if (next === file.path || file.path.split('/').some(part => part.startsWith('.'))) continue
      const original = next, extension = path.extname(next)
      let copy = 2
      while (occupied.has(next.toLowerCase())) next = (extension ? original.slice(0, -extension.length) : original) + ` - Copy ${String(copy++).padStart(2, '0')}` + extension
      occupied.add(next.toLowerCase())
      moves.push({ ...file, destination: next })
    }
    json('inventory.json', files); json('plan.json', { root, moves })
    console.log(JSON.stringify({ moves: moves.length, bytes: moves.reduce((n, move) => n + move.size, 0), audit }))
    return
  }
  const plan = JSON.parse(fs.readFileSync(inside(audit, 'plan.json'), 'utf8'))
  if (plan.root !== root) throw Error('Root does not match plan.')
  if (mode === 'apply') {
    if (fs.existsSync(inside(audit, 'execution.jsonl'))) throw Error('Journal exists; do not apply twice.')
    for (const move of plan.moves) {
      if (fs.existsSync(inside(root, move.destination)) || fs.statSync(inside(root, move.path)).size !== move.size) throw Error('Plan changed: ' + move.path)
    }
    // Stage metadata before moving media. Never overwrite a changed metadata file.
    const map = new Map(plan.moves.map(move => [move.path, move.destination]))
    for (const move of plan.moves) {
      map.set(move.path.replaceAll('/', '\\'), move.destination)
      map.set(inside(root, move.path), inside(root, move.destination))
    }
    function remap(value) {
      if (typeof value === 'string') {
        if (map.has(value)) return map.get(value)
        const marker = value.indexOf('::')
        if (marker >= 0 && map.has(value.slice(0, marker))) return map.get(value.slice(0, marker)) + value.slice(marker)
        if (/^[\[{]/.test(value)) { try { const parsed = JSON.parse(value), next = remap(parsed); return JSON.stringify(next) === JSON.stringify(parsed) ? value : JSON.stringify(next) } catch {} }
        return value
      }
      if (value instanceof Uint8Array) return value
      if (Array.isArray(value)) return value.map(remap)
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [remap(key), remap(item)]))
      return value
    }
    const metadata = []
    function stage(relative, bytes, destination = relative) {
      const before = fs.readFileSync(inside(root, relative))
      if (hash(bytes) === hash(before) && destination === relative) return
      const backup = `metadata/${metadata.length}.before`, staged = `metadata/${metadata.length}.after`
      fs.mkdirSync(inside(audit, 'metadata'), { recursive: true })
      fs.writeFileSync(inside(audit, backup), before); fs.writeFileSync(inside(audit, staged), bytes)
      if (destination !== relative && fs.existsSync(inside(root, destination))) throw Error('Metadata destination exists: ' + destination)
      metadata.push({ path: relative, destination, backup, staged, beforeHash: hash(before), afterHash: hash(bytes) })
    }
    const SQL = await require('sql.js')()
    const dbPath = 'guitar-trainer.sqlite', db = new SQL.Database(fs.readFileSync(inside(root, dbPath)))
    let changedRows = 0
    for (const [table] of db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")[0].values) {
      const quote = name => '"' + name.replaceAll('"', '""') + '"'
      const result = db.exec('SELECT rowid AS __rowid, * FROM ' + quote(table))[0]
      if (!result) continue
      for (const row of result.values) {
        const next = row.map(remap)
        if (JSON.stringify(row) === JSON.stringify(next)) continue
        db.run('UPDATE ' + quote(table) + ' SET ' + result.columns.slice(1).map(column => quote(column) + '=?').join(',') + ' WHERE rowid=?', [...next.slice(1), row[0]])
        changedRows++
      }
    }
    if (db.exec('PRAGMA integrity_check')[0].values[0][0] !== 'ok') throw Error('Invalid database')
    if (changedRows) stage(dbPath, Buffer.from(db.export()))
    db.close()
    const files = inventory()
    for (const file of files.filter(file => /^(audio-metadata\.json|\.(markers|metadata|guitar-documents)\/.*\.json)$/.test(file.path))) {
      const before = JSON.parse(fs.readFileSync(inside(root, file.path), 'utf8')), next = remap(before)
      let target = file.path
      for (const move of plan.moves) {
        if (file.path === `.guitar-documents/${hash(move.path)}.json`) target = `.guitar-documents/${hash(move.destination)}.json`
        if (file.path === `.markers/${move.path.replaceAll('/', '_')}.markers.json`) target = `.markers/${move.destination.replaceAll('/', '_')}.markers.json`
      }
      if (target !== file.path || JSON.stringify(before) !== JSON.stringify(next)) stage(file.path, Buffer.from(JSON.stringify(next, null, 2)), target)
    }
    json('metadata.json', metadata)
    let count = 0
    for (const move of plan.moves) {
      const source = inside(root, move.path), target = inside(root, move.destination)
      const sha256 = await checksum(source)
      fs.appendFileSync(inside(audit, 'execution.jsonl'), JSON.stringify({ ...move, sha256 }) + '\n')
      fs.mkdirSync(path.dirname(target), { recursive: true })
      if (fs.existsSync(target)) throw Error('Destination appeared: ' + target)
      fs.renameSync(source, target)
      if (++count % 250 === 0) console.log('Moved and hashed', count, '/', plan.moves.length)
    }
    for (const entry of metadata) {
      if (hash(fs.readFileSync(inside(root, entry.path))) !== entry.beforeHash) throw Error('Metadata changed; staged update retained in audit: ' + entry.path)
      fs.copyFileSync(inside(audit, entry.staged), inside(root, entry.destination))
      if (entry.path !== entry.destination) fs.unlinkSync(inside(root, entry.path))
    }
    const completed = fs.readFileSync(inside(audit, 'execution.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
    for (const entry of completed) if (await checksum(inside(root, entry.destination)) !== entry.sha256) throw Error('Verification failed: ' + entry.destination)
    const after = inventory()
    json('verification.json', { moves: completed.length, metadataUpdates: metadata.length, changedDatabaseRows: changedRows, mediaHashesVerified: true, beforeFileCount: files.length, afterFileCount: after.length, verifiedAt: new Date().toISOString() })
    console.log('Verified', completed.length, 'moves;', metadata.length, 'metadata updates; file count', files.length, '->', after.length)
  } else if (mode === 'undo') {
    const moves = fs.readFileSync(inside(audit, 'execution.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
    const metadata = JSON.parse(fs.readFileSync(inside(audit, 'metadata.json'), 'utf8'))
    for (const move of moves) {
      if (fs.existsSync(inside(root, move.path)) || await checksum(inside(root, move.destination)) !== move.sha256) throw Error('Media changed; cannot undo: ' + move.destination)
    }
    for (const entry of metadata) if (hash(fs.readFileSync(inside(root, entry.destination))) !== entry.afterHash) throw Error('Metadata changed; cannot undo: ' + entry.destination)
    for (const move of moves.reverse()) { fs.mkdirSync(path.dirname(inside(root, move.path)), { recursive: true }); fs.renameSync(inside(root, move.destination), inside(root, move.path)) }
    for (const entry of metadata) { fs.copyFileSync(inside(audit, entry.backup), inside(root, entry.path)); if (entry.path !== entry.destination) fs.unlinkSync(inside(root, entry.destination)) }
    const emptyFoldersLog = inside(audit, 'removed-empty-folders.json')
    if (fs.existsSync(emptyFoldersLog)) for (const folder of JSON.parse(fs.readFileSync(emptyFoldersLog, 'utf8'))) fs.mkdirSync(inside(root, folder), { recursive: true })
    console.log('Restored all journaled paths and metadata; empty folders retained.')
  } else throw Error('Expected plan, apply or undo')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
