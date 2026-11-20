import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

// Execute the actual services with an in-memory File System Access handle.
// No browser library, user markers, or user database is modified.
const require = createRequire(import.meta.url)
const cache = new Map()
function load(relative) {
  if (cache.has(relative)) return cache.get(relative)
  const filename = fileURLToPath(new URL(`../src/${relative}.ts`, import.meta.url))
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
  })
  const module = { exports: {} }
  cache.set(relative, module.exports)
  const resolve = (id) => {
    if (id.startsWith('@/')) return load(id.slice(2))
    if (id === 'sql.js') return () => require('sql.js')({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') })
    return require(id)
  }
  vm.runInThisContext(`(function(require,module,exports){${outputText}\n})`, { filename })(resolve, module, module.exports)
  return module.exports
}
const learning = load('services/learning')
const database = load('services/local-sql-db')
function directory() {
  let bytes = new Uint8Array()
  let fail = false
  return {
    failNextWrite() { fail = true },
    async getFileHandle() {
      return {
        async getFile() { return new Blob([bytes]) },
        async createWritable() {
          return { async write(data) { if (fail) { fail = false; throw new Error('Disk unavailable') } bytes = data }, async close() {} }
        }
      }
    }
  }
}
const marker = (id, domain, role) => ({
  markerKey: `lesson.mp4::${id}`, contentPath: 'lesson.mp4', contentType: 'local', sourceTitle: 'Lesson', markerTitle: id, tags: [],
  marker: { id, startTime: 0, endTime: 20, completionDegree: 0, learning: { domain, weeklyPracticeRole: role } }
})
const catalog = [
  marker('tune', 'repertoire', 'Repertoire Support'),
  marker('device', 'musical-device', 'Technique Maintenance'), // conflicting AI role must not override bucket
  ...Array.from({ length: 8 }, (_, i) => marker(`training-${i}`, 'training', 'Technique Maintenance')),
  marker('unassigned', undefined)
]

test('every supported target fits, stays balanced, and agrees with the daily schedule', { timeout: 5000 }, () => {
  for (let minutes = 15; minutes <= 180; minutes++) {
    const routine = learning.generateWeeklyRoutine(catalog, new Map(), minutes)
    assert.equal(routine.items.reduce((sum, item) => sum + item.plannedMinutes, 0), minutes)
    assert.ok(routine.items.every((item) => item.plannedMinutes >= 5))
    assert.deepEqual(routine.items.slice(0, 3).map((item) => item.domain), ['repertoire', 'musical-device', 'training'])
    assert.equal(new Set(routine.items.map((item) => item.markerKey)).size, routine.items.length)
    assert.ok(!routine.items.some((item) => item.markerId === 'unassigned'))
    for (const day of routine.dailySchedule) {
      assert.equal(day.blocks.reduce((sum, block) => sum + block.minutes, 0), minutes)
      assert.deepEqual(day.blocks.map((block) => block.markerKey), routine.items.map((item) => item.markerKey))
    }
  }
})

test('empty and single-category libraries, invalid targets, and due-date ranking', () => {
  assert.equal(learning.generateWeeklyRoutine([], new Map(), 15).items.length, 0)
  const training = catalog.filter((item) => item.marker.learning.domain === 'training')
  for (const target of [NaN, Infinity, -1, 0, 1000]) {
    const routine = learning.generateWeeklyRoutine(training, new Map(), target)
    assert.ok(Number.isFinite(routine.targetMinutes))
    assert.equal(routine.items.reduce((sum, item) => sum + item.plannedMinutes, 0), routine.targetMinutes)
  }
  const state = new Map([[training[0].markerKey, { dueAt: Date.now() + 90 * 86400000, lastPracticedAt: Date.now() }]])
  assert.notEqual(learning.generateWeeklyRoutine(training, state, 15).items[0].markerKey, training[0].markerKey)
})

test('routine and practice survive reload with notes, stats, and next review date', async () => {
  const handle = directory()
  const routine = await learning.generateAndSaveWeeklyRoutine(handle, catalog, 15)
  await learning.recordPracticeProgress(handle, catalog[0], {
    eventId: 'practice-1', sessionId: routine.id, durationMs: 120000, progressBefore: 0, progressAfter: 40, notes: 'Clean at 70 bpm'
  })
  await database.reloadDatabaseContext(handle)
  const loaded = await learning.loadLatestLearningRoutine(handle)
  assert.equal(loaded.id, routine.id)
  assert.equal(loaded.items.length, 3)
  const state = (await learning.loadLearningStateMap(handle)).get(catalog[0].markerKey)
  assert.equal(state.repetitions, 1)
  assert.ok(state.dueAt > state.lastPracticedAt)
  const stats = await learning.loadLearningStats(handle)
  assert.equal(stats.totalPracticeMs, 120000)
  assert.equal(stats.practiceDays, 1)
  assert.equal(stats.practicedMarkerCount, 1)
  assert.equal(stats.averageProgressDelta, 40)
  assert.equal((await learning.loadMarkerPracticeHistory(handle, catalog[0].markerKey))[0].notes, 'Clean at 70 bpm')
})

test('retry after a failed disk write does not duplicate elapsed time or repetitions', async () => {
  const handle = directory()
  const input = { eventId: 'retry-session', durationMs: 60000, progressBefore: 0, progressAfter: 25 }
  handle.failNextWrite()
  await assert.rejects(learning.recordPracticeProgress(handle, catalog[0], input), /Disk unavailable/)
  await learning.recordPracticeProgress(handle, catalog[0], input)
  await database.reloadDatabaseContext(handle)
  assert.equal((await learning.loadLearningStats(handle)).totalPracticeMs, 60000)
  assert.equal((await learning.loadLearningStateMap(handle)).get(catalog[0].markerKey).repetitions, 1)
  assert.equal((await learning.loadMarkerPracticeHistory(handle, catalog[0].markerKey)).length, 1)
})
