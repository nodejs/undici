'use strict'

const { test } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { Request } = require('../..')
const { fetching } = require('../../lib/web/fetch/index.js')
const { getRequestState } = require('../../lib/web/fetch/request.js')
const { closeServerAsPromise } = require('../utils/node-http')

async function fetchWithBodyHooks (url, body, hooks) {
  const requestObject = new Request(url, { method: 'POST', body })
  const request = getRequestState(requestObject)

  await new Promise((resolve, reject) => {
    fetching({
      request,
      requestObject,
      processRequestBodyChunkLength: hooks.processRequestBodyChunkLength,
      processRequestEndOfBody: hooks.processRequestEndOfBody,
      processResponse (response) {
        if (response.type === 'error') {
          reject(response.error)
          return
        }
        resolve(response)
      }
    })
  })

  // The buffered-body path reports length on a microtask.
  await new Promise((resolve) => queueMicrotask(resolve))
}

test('buffered string body reports processRequest callbacks', async (t) => {
  const server = createServer((req, res) => {
    req.resume()
    req.on('end', () => res.end('ok'))
  }).listen(0)
  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const body = 'hello'
  let chunkLength = 0
  let ended = false

  await fetchWithBodyHooks(`http://127.0.0.1:${server.address().port}`, body, {
    processRequestBodyChunkLength (n) {
      chunkLength += n
    },
    processRequestEndOfBody () {
      ended = true
    }
  })

  t.assert.strictEqual(chunkLength, Buffer.byteLength(body))
  t.assert.strictEqual(ended, true)
})

test('buffered Uint8Array body reports processRequest callbacks', async (t) => {
  const server = createServer((req, res) => {
    req.resume()
    req.on('end', () => res.end('ok'))
  }).listen(0)
  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const body = new TextEncoder().encode('hello')
  let chunkLength = 0
  let ended = false

  await fetchWithBodyHooks(`http://127.0.0.1:${server.address().port}`, body, {
    processRequestBodyChunkLength (n) {
      chunkLength += n
    },
    processRequestEndOfBody () {
      ended = true
    }
  })

  t.assert.strictEqual(chunkLength, body.byteLength)
  t.assert.strictEqual(ended, true)
})
