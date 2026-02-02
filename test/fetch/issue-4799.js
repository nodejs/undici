'use strict'

const { test } = require('node:test')
const { fetch } = require('../..')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { closeServerAsPromise } = require('../utils/node-http')

test('response clone + abort should return AbortError, not TypeError', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ message: 'hello' }))
  })

  t.after(closeServerAsPromise(server))
  server.listen(0)
  await once(server, 'listening')

  const controller = new AbortController()
  const response = await fetch(`http://localhost:${server.address().port}`, {
    signal: controller.signal
  })

  // Clone the response before aborting
  const clonedResponse = response.clone()

  // Abort after cloning
  controller.abort()

  // Both original and cloned response should reject with AbortError
  await t.test('original response should reject with AbortError', async () => {
    await t.assert.rejects(
      response.text(),
      {
        name: 'AbortError',
        message: 'The operation was aborted.',
        code: DOMException.ABORT_ERR
      }
    )
  })

  await t.test('cloned response should reject with AbortError', async () => {
    await t.assert.rejects(
      clonedResponse.text(),
      {
        name: 'AbortError',
        message: 'This operation was aborted',
        code: DOMException.ABORT_ERR
      }
    )
  })
})

test('response without clone + abort should still return AbortError', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ message: 'hello' }))
  })

  t.after(closeServerAsPromise(server))
  server.listen(0)
  await once(server, 'listening')

  const controller = new AbortController()
  const response = await fetch(`http://localhost:${server.address().port}`, {
    signal: controller.signal
  })

  // Abort without cloning
  controller.abort()

  await t.assert.rejects(
    response.text(),
    {
      name: 'AbortError',
      message: 'The operation was aborted.',
      code: DOMException.ABORT_ERR
    }
  )
})

test('response bodyUsed should be false after clone but before reading', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ message: 'hello' }))
  })

  t.after(closeServerAsPromise(server))
  server.listen(0)
  await once(server, 'listening')

  const controller = new AbortController()
  const response = await fetch(`http://localhost:${server.address().port}`, {
    signal: controller.signal
  })

  t.assert.strictEqual(response.bodyUsed, false)

  const clonedResponse = response.clone()

  controller.abort()

  t.assert.strictEqual(response.bodyUsed, false)
  t.assert.strictEqual(clonedResponse.bodyUsed, false)
})
