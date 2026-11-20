import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { usePlaybackStore } from '../src/stores/playback-store.ts'

const session = (pause = () => {}) => ({
  owner: Symbol('test-player'),
  title: 'Test track',
  href: '/audio',
  getCurrentTime: () => 12,
  getDuration: () => 60,
  isPlaying: () => true,
  play: () => {},
  pause,
  seek: () => {}
})
const settle = () => new Promise((resolve) => setImmediate(resolve))

beforeEach(() => usePlaybackStore.setState({ active: null, error: null }))

test('starting a second source pauses the first and late cleanup preserves the new source', async () => {
  let pauses = 0
  const first = session(() => { pauses++ })
  const second = session()
  usePlaybackStore.getState().activate(first)
  usePlaybackStore.getState().activate(second)
  usePlaybackStore.getState().release(first.owner)
  await settle()
  assert.equal(pauses, 1)
  assert.equal(usePlaybackStore.getState().active, second)
})

test('re-registering the current source does not pause or restart playback', async () => {
  let pauses = 0
  const active = session(() => { pauses++ })
  usePlaybackStore.getState().activate(active)
  usePlaybackStore.getState().activate(active)
  await settle()
  assert.equal(pauses, 0)
  assert.equal(usePlaybackStore.getState().active.getCurrentTime(), 12)
  usePlaybackStore.getState().release(active.owner)
  assert.equal(usePlaybackStore.getState().active, null)
})

test('a remote pause failure is surfaced instead of being silently discarded', async () => {
  usePlaybackStore.getState().activate(session(async () => { throw new Error('Spotify device unavailable') }))
  const second = session()
  usePlaybackStore.getState().activate(second)
  await settle()
  assert.equal(usePlaybackStore.getState().error, 'Spotify device unavailable')
  assert.equal(usePlaybackStore.getState().active, second)
})
