'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { setImmediate: tick } = require('node:timers/promises')
const { Request } = require('../..')

const hasGC = typeof global.gc !== 'undefined'

// A Request that follows a caller's signal is registered in a
// FinalizationRegistry keyed on its own AbortController. The held value used to
// keep a strong reference to the caller's signal. When anything reachable from
// that signal could reach the Request (a listener or a property closing over
// it), the held value kept the registry's own target alive, so neither the
// Request nor anything it held was ever collected.
async function collected (ref) {
  for (let i = 0; i < 10 && ref.deref() !== undefined; i++) {
    await tick()
    global.gc()
  }
  return ref.deref() === undefined
}

test('a Request is collected when a listener on its signal references it', async () => {
  if (!hasGC) {
    throw new Error('gc is not available. Run with \'--expose-gc\'.')
  }

  let ref
  ;(() => {
    const controller = new AbortController()
    const request = new Request('http://localhost', { signal: controller.signal })
    controller.signal.addEventListener('abort', () => request.url)
    ref = new WeakRef(request)
  })()

  assert.ok(await collected(ref))
})

test('a Request is collected when a property of its signal references it', async () => {
  if (!hasGC) {
    throw new Error('gc is not available. Run with \'--expose-gc\'.')
  }

  let ref
  ;(() => {
    const controller = new AbortController()
    const request = new Request('http://localhost', { signal: controller.signal })
    controller.signal.cleanup = () => request.url
    ref = new WeakRef(request)
  })()

  assert.ok(await collected(ref))
})

test('the abort listener is still removed when the Request is collected', async () => {
  if (!hasGC) {
    throw new Error('gc is not available. Run with \'--expose-gc\'.')
  }

  const { getEventListeners } = require('node:events')
  const controller = new AbortController()
  let ref
  ;(() => {
    const request = new Request('http://localhost', { signal: controller.signal })
    ref = new WeakRef(request)
  })()

  assert.ok(await collected(ref))
  // The registry's cleanup callback runs after the collection, on its own task.
  for (let i = 0; i < 10 && getEventListeners(controller.signal, 'abort').length > 0; i++) {
    await tick()
    global.gc()
  }
  assert.strictEqual(getEventListeners(controller.signal, 'abort').length, 0)
})

test('a timeout signal nobody else references still aborts the Request', { timeout: 5000 }, async () => {
  if (!hasGC) {
    throw new Error('gc is not available. Run with \'--expose-gc\'.')
  }

  // The held value no longer keeps the signal alive, so this relies on the
  // signal keeping itself alive while it has an abort listener and can still fire.
  const request = new Request('http://localhost', { signal: AbortSignal.timeout(100) })
  const aborted = new Promise((resolve) => request.signal.addEventListener('abort', resolve, { once: true }))
  for (let i = 0; i < 10; i++) {
    await tick()
    global.gc()
  }

  // The timeout's own timer is unref'd and would let the process exit first.
  const keepAlive = setInterval(() => {}, 1000)
  try {
    await aborted
  } finally {
    clearInterval(keepAlive)
  }
  assert.strictEqual(request.signal.aborted, true)
})
