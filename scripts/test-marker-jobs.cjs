const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

test('jobs survive module reloads and disk recovery reports interrupted owners', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'marker-jobs-test-'))
  process.env.GUITAR_TRAINER_JOB_DIR = directory
  const filename = path.resolve(__dirname, '../src/lib/marker-job-store.ts')
  const load = () => {
    const loaded = new Module(filename, module)
    loaded.paths = Module._nodeModulePaths(path.dirname(filename))
    loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
    }).outputText, filename)
    return loaded.exports
  }
  const id = '12345678-1234-1234-1234-123456789abc'
  try {
    const first = load()
    const job = { id, status: 'running', phase: 'Transcribing', updatedAt: Date.now(), progress: 10 }
    first.markerJobs.set(id, job)
    first.saveMarkerJob(job)
    const second = load()
    assert.equal(second.readMarkerJob(id), job)
    second.markerJobs.clear()
    assert.equal(second.readMarkerJob(id).status, 'running')
    job.updatedAt = Date.now() - 120000
    first.saveMarkerJob(job)
    assert.equal(second.readMarkerJob(id).status, 'failed')
    job.status = 'completed'
    first.saveMarkerJob(job)
    assert.equal(second.readMarkerJob(id).status, 'completed')
    assert.equal(second.readMarkerJob('../outside'), undefined)
  } finally {
    delete process.env.GUITAR_TRAINER_JOB_DIR
    delete globalThis.guitarMarkerJobs
    fs.unlinkSync(path.join(directory, `${id}.json`))
    fs.rmdirSync(directory)
  }
})
