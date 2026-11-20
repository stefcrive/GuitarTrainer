const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const file = path.resolve(__dirname, '../src/lib/workspace-navigation.ts')
const loaded = new Module(file, module)
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText, file)
const { retainWorkspaceNavigation: visit } = loaded.exports
const empty = () => ({ pathname: '', search: '', pages: {} })

test('returning to Books retains its query and all visited pages, independent of playback', () => {
  let state = visit(empty(), '/documents', 'material=Course&document=Course%2FBook.pdf', true)
  state = visit(state, '/videos', 'material=Other', true)
  state = visit(state, '/settings', '', true)
  state = visit(state, '/documents', '', true)
  assert.equal(state.pages['/documents'], 'material=Course&document=Course%2FBook.pdf')
  assert.equal(state.pages['/videos'], 'material=Other')
  assert.deepEqual(Object.keys(state.pages), ['/documents', '/videos', '/settings'])
  assert.equal(visit(state, '/documents', '', true), state, 'an unrelated rerender must not clear the restored query')
})

test('new companion links replace only the destination query and explicit clear still works', () => {
  let state = visit(empty(), '/documents', 'material=One', true)
  state = visit(state, '/audio', 'audio=track.wav', true)
  state = visit(state, '/documents', 'material=Two&document=Two.pdf', true)
  assert.equal(state.pages['/documents'], 'material=Two&document=Two.pdf')
  assert.equal(state.pages['/audio'], 'audio=track.wav')
  state = visit(state, '/documents', 'material=', true)
  state = visit(state, '/audio', '', true)
  state = visit(state, '/documents', '', true)
  assert.equal(new URLSearchParams(state.pages['/documents']).get('material'), '')
})

test('unknown routes do not discard pages; distinct YouTube videos keep distinct state', () => {
  let state = visit(empty(), '/youtube/first', 'marker=one', true)
  state = visit(state, '/youtube/second', 'marker=two', true)
  state = visit(state, '/not-found', '', false)
  assert.equal(Object.keys(state.pages).length, 2)
  state = visit(state, '/youtube/first', '', true)
  assert.equal(state.pages['/youtube/first'], 'marker=one')
  assert.equal(state.pages['/youtube/second'], 'marker=two')
})
