const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const filename = path.resolve(__dirname, '../src/lib/practice-material.ts')
const loaded = new Module(filename, module)
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText, filename)
const { buildMaterialIndex, materialFolderPath, materialGroupPath, materialHref, materialKind, skipMaterialEntry } = loaded.exports
const file = path => ({ path, name: path.split('/').pop(), kind: materialKind(path) })

test('course media share a hierarchy across sibling media folders without crossing course boundaries', () => {
  const video = file('05 - Jazz and Fusion/Course A/Video/Lesson 01.mp4')
  const pdf = file('05 - Jazz and Fusion/Course A/PDF/Lesson 01.pdf')
  const audio = file('05 - Jazz and Fusion/Course A/Audio/Disc 1/Track 01.mp3')
  const unrelated = file('05 - Jazz and Fusion/Course B/Lesson 01.pdf')
  const index = buildMaterialIndex([video, pdf, audio, unrelated])
  const group = index.byPath.get(video.path)
  assert.deepEqual(group.files.document, [pdf])
  assert.deepEqual(group.files.audio, [audio])
  assert.notEqual(group, index.byPath.get(unrelated.path))
  assert.equal(materialFolderPath(pdf.path), materialFolderPath(video.path))
  assert.equal(materialFolderPath(audio.path), '05 - Jazz and Fusion/Course A/Disc 1')
})

test('loose category files and root files do not imply unrelated companions', () => {
  assert.equal(materialGroupPath('05 - Jazz and Fusion/Independent book.pdf'), null)
  assert.equal(materialGroupPath('Standalone.pdf'), null)
  assert.equal(buildMaterialIndex([file('05 - Jazz and Fusion/Book.pdf'), file('05 - Jazz and Fusion/Video.mp4')]).groups.size, 0)
  assert.notEqual(materialGroupPath('Author/Course A/Video/Lesson.mp4'), materialGroupPath('Author/Course B/Audio/Lesson.mp3'))
})

test('links preserve spaces, Unicode and reserved path characters and target the separate media page', () => {
  const group = '05 - Jazz and Fusion/Chords #1 & Solos + Études'
  for (const [kind, route, param] of [['document', '/documents', 'document'], ['video', '/videos', 'video'], ['audio', '/audio', 'audio']]) {
    const source = group + '/01 # theme.pdf', url = new URL(materialHref(kind, group, source), 'http://localhost')
    assert.equal(url.pathname, route)
    assert.equal(url.searchParams.get('material'), group)
    assert.equal(url.searchParams.get(param), source)
    assert.equal(new URL(materialHref(kind, group), 'http://localhost').searchParams.has(param), false)
  }
})

test('scanned pages are books, Ogg is audio, and internal application folders are skipped', () => {
  for (const name of ['scan.JPG', 'Page.PNG', 'book.PDF']) assert.equal(materialKind(name), 'document')
  assert.equal(materialKind('track.ogg'), 'audio')
  assert.equal(materialKind('archive.rar'), undefined)
  for (const name of ['.guitar-documents', 'Player.app', 'Session.logicx', 'Edit.cmproj', 'node_modules']) assert.equal(skipMaterialEntry(name), true)
  assert.equal(skipMaterialEntry('03 - Technique and Practice'), false)
})
