'use strict'

const { test } = require('node:test')
const { createHash } = require('node:crypto')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { isReadable } = require('node:stream')
const { finished } = require('node:stream/promises')
const { setImmediate: nextTick } = require('node:timers/promises')
const { fetch } = require('../..')
const { getResponseState } = require('../../lib/web/fetch/response')
const { attachBodyAbortController } = require('../../lib/web/fetch/body')

const integrity = `sha256-${createHash('sha256').update('hello').digest('base64')}`
const sources = {
  data: () => ['data:text/plain,hello', {}],
  blob: (t) => {
    const url = URL.createObjectURL(new Blob(['hello']))
    t.after(() => URL.revokeObjectURL(url))
    return [url, {}]
  },
  range: (t) => {
    const url = URL.createObjectURL(new Blob(['xhellox']))
    t.after(() => URL.revokeObjectURL(url))
    return [url, { headers: { range: 'bytes=1-5' } }]
  },
  integrity: () => ['data:text/plain,hello', { integrity }]
}

async function collectResponses (references) {
  for (let attempt = 0; attempt < 40; attempt++) {
    await nextTick()
    global.gc()
    await nextTick()
    if (references.every((reference) => reference.deref() === undefined)) return
  }
  throw new Error('Responses were not collected within the bounded GC schedule')
}

for (const cloneCount of [0, 2]) {
  test(`an external signal does not retain an abandoned response with ${cloneCount} clones`, async (t) => {
    t.assert.strictEqual(typeof global.gc, 'function')
    const controller = new AbortController()
    const abandoned = await (async () => {
      const response = await fetch('data:text/plain,hello', { signal: controller.signal })
      const responses = [response]
      for (let index = 0; index < cloneCount; index++) responses.push(response.clone())
      return {
        references: responses.map((response) => new WeakRef(response)),
        streams: responses.map((response) => response.body)
      }
    })()

    await collectResponses(abandoned.references)
    // Allow the existing Response finalizers to cancel the unlocked branches.
    for (let attempt = 0; attempt < 40 && abandoned.streams.some(isReadable); attempt++) await nextTick()
    t.assert.ok(abandoned.streams.every((stream) => !isReadable(stream)))
    t.assert.strictEqual(controller.signal.aborted, false)
  })
}

test('an active clone still observes abort after its original Response is collected', async (t) => {
  t.assert.strictEqual(typeof global.gc, 'function')
  const server = createServer((request, response) => {
    response.writeHead(200)
    response.write('hello')
  })
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const controller = new AbortController()
  const survivor = await (async () => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}`, { signal: controller.signal })
    return { original: new WeakRef(response), clone: response.clone() }
  })()

  await collectResponses([survivor.original])
  const reason = new Error('stop the active producer')
  controller.abort(reason)
  t.assert.strictEqual(survivor.clone.bodyUsed, false)
  await t.assert.rejects(survivor.clone.text(), (error) => error === reason)
})

test('a non-HTTP Blob clone still observes abort after its original Response is collected', async (t) => {
  t.assert.strictEqual(typeof global.gc, 'function')
  const url = URL.createObjectURL(new Blob(['hello']))
  t.after(() => URL.revokeObjectURL(url))
  const controller = new AbortController()
  const reason = new Error('stop the Blob producer')
  const survivor = await (async () => {
    const response = await fetch(url, { signal: controller.signal })
    const producer = getResponseState(response).body.stream
    return { original: new WeakRef(response), clone: response.clone(), producer }
  })()

  try {
    t.assert.strictEqual(isReadable(survivor.producer), true)
    await collectResponses([survivor.original])
    t.assert.strictEqual(isReadable(survivor.producer), true)
    controller.abort(reason)
    t.assert.strictEqual(survivor.clone.bodyUsed, false)
    await t.assert.rejects(survivor.clone.text(), (error) => error === reason)
  } finally {
    controller.abort(reason)
    await survivor.clone.body.cancel().catch(() => {})
  }
})

test('aborting an HTTP response after integrity validation errors its final body', async (t) => {
  const server = createServer((request, response) => response.end('hello'))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const controller = new AbortController()
  const response = await fetch(`http://127.0.0.1:${server.address().port}`, {
    signal: controller.signal,
    integrity
  })
  const reason = new Error('stop the verified body')

  controller.abort(reason)
  t.assert.strictEqual(response.bodyUsed, false)
  await t.assert.rejects(response.text(), (error) => error === reason)
})

test('an adopted source error reaches reader.closed without a pending read', async (t) => {
  let sourceController
  const source = new ReadableStream({
    type: 'bytes',
    start (controller) { sourceController = controller }
  })
  const body = { stream: source }
  attachBodyAbortController(body)
  const reader = body.stream.getReader()
  const reason = new Error('source failed before its next read')
  const closed = t.assert.rejects(reader.closed, (error) => error === reason)
  try {
    sourceController.error(reason)
    await closed
    await t.assert.rejects(reader.read(), (error) => error === reason)
    await nextTick()
    t.assert.strictEqual(source.locked, false)
  } finally {
    reader.releaseLock()
  }
})

test('aborting an adopted body cancels its source once and releases its reader', async (t) => {
  const cancellations = []
  const source = new ReadableStream({
    type: 'bytes',
    cancel (reason) { cancellations.push(reason) }
  })
  const body = { stream: source }
  const owner = attachBodyAbortController(body)
  const reader = body.stream.getReader({ mode: 'byob' })
  const reason = new Error('stop the adopted source')
  const read = t.assert.rejects(reader.read(new Uint8Array(8)), (error) => error === reason)
  const closed = t.assert.rejects(reader.closed, (error) => error === reason)
  try {
    t.assert.strictEqual(source.locked, true)
    owner.error(reason)
    await Promise.all([read, closed])
    await nextTick()
    t.assert.deepStrictEqual(cancellations, [reason])
    t.assert.strictEqual(source.locked, false)
    owner.error(new Error('already stopped'))
    t.assert.deepStrictEqual(cancellations, [reason])
  } finally {
    reader.releaseLock()
  }
})

test('finishing an adopted body releases its source reader without cancellation', async (t) => {
  let cancellations = 0
  const source = new ReadableStream({
    type: 'bytes',
    pull (controller) {
      controller.enqueue(new Uint8Array([104, 105]))
      controller.close()
    },
    cancel () { cancellations++ }
  })
  const body = { stream: source }
  attachBodyAbortController(body)
  const reader = body.stream.getReader({ mode: 'byob' })
  try {
    const first = await reader.read(new Uint8Array(8))
    t.assert.deepStrictEqual(first.value, new Uint8Array([104, 105]))
    t.assert.strictEqual(first.done, false)
    const end = await reader.read(new Uint8Array(8))
    t.assert.strictEqual(end.done, true)
    t.assert.strictEqual(end.value.byteLength, 0)
    await reader.closed
    t.assert.strictEqual(source.locked, false)
    t.assert.strictEqual(cancellations, 0)
  } finally {
    reader.releaseLock()
  }
})

for (const [name, source] of Object.entries(sources)) {
  for (const customReason of [false, true]) {
    test(`aborting an unread ${name} response errors its body (${customReason ? 'custom' : 'default'} reason)`, async (t) => {
      const controller = new AbortController()
      const [url, options] = source(t)
      const response = await fetch(url, { ...options, signal: controller.signal })
      const reason = customReason ? new Error('stop reading') : undefined

      controller.abort(reason)

      t.assert.strictEqual(response.bodyUsed, false)
      await t.assert.rejects(response.text(), (error) => error === controller.signal.reason)
    })
  }

  test(`aborting an unread ${name} response errors a BYOB reader and its closed promise`, async (t) => {
    const controller = new AbortController()
    const [url, options] = source(t)
    const response = await fetch(url, { ...options, signal: controller.signal })
    const reader = response.body.getReader({ mode: 'byob' })
    const reason = new Error('stop reading')
    const closed = t.assert.rejects(reader.closed, (error) => error === reason)
    try {
      controller.abort(reason)
      t.assert.strictEqual(response.bodyUsed, false)
      await t.assert.rejects(reader.read(new Uint8Array(8)), (error) => error === reason)
      await closed
    } finally {
      reader.releaseLock()
    }
  })

  test(`aborting the fetched ${name} branch after its producer finishes preserves completed clone bytes`, async (t) => {
    const controller = new AbortController()
    const [url, options] = source(t)
    const response = await fetch(url, { ...options, signal: controller.signal })
    const producerFinished = finished(getResponseState(response).body.stream)
    const unreadClone = response.clone()
    const consumedClone = response.clone()

    t.assert.strictEqual(await consumedClone.text(), 'hello')
    await producerFinished
    await nextTick()
    await nextTick()
    const reason = new Error('stop reading')
    controller.abort(reason)

    t.assert.strictEqual(response.bodyUsed, false)
    await t.assert.rejects(response.text(), (error) => error === reason)
    t.assert.strictEqual(await unreadClone.text(), 'hello')
    t.assert.strictEqual(consumedClone.bodyUsed, true)
  })

  test(`a fully consumed ${name} response stays successfully consumed after abort`, async (t) => {
    const controller = new AbortController()
    const [url, options] = source(t)
    const response = await fetch(url, { ...options, signal: controller.signal })
    t.assert.strictEqual(await response.text(), 'hello')
    controller.abort(new Error('already finished'))
    t.assert.strictEqual(response.bodyUsed, true)
  })
}
