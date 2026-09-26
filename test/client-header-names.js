'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { Duplex } = require('node:stream')
const { Client } = require('..')

// Answers each request with the next response, delivered as the given chunks,
// one per read, so llhttp hands over any field name cut by a boundary in pieces.
function connectChunks (responses, onConnect = () => {}) {
  let next = 0
  return (opts, callback) => {
    onConnect()
    const socket = new Duplex({
      read () {},
      write (chunk, encoding, cb) {
        cb()
        const chunks = responses[next++]
        let i = 0
        const push = () => {
          if (i < chunks.length) {
            socket.push(chunks[i++])
            setImmediate(push)
          }
        }
        push()
      }
    })
    // Connectors call back asynchronously, as a real connection would.
    process.nextTick(callback, null, socket)
  }
}

function dispatch (client, opts) {
  return new Promise((resolve, reject) => {
    let response
    client.dispatch(opts, {
      onRequestStart () {},
      onResponseStart (controller, statusCode, headers) {
        response = { statusCode, headers, rawHeaders: controller.rawHeaders }
      },
      onResponseData () {},
      onResponseEnd (controller, trailers) {
        resolve({ ...response, trailers, rawTrailers: controller.rawTrailers })
      },
      onResponseError (controller, err) {
        reject(err)
      }
    })
  })
}

const response = [
  'HTTP/1.1 200 OK',
  'Content-Type: text/plain',
  'ETAG: "x"',
  'x-Custom-Name: custom',
  'Accept-Ranges: bytes',
  'Set-Cookie: a=1',
  'set-COOKIE: b=2',
  'Transfer-Encoding: chunked',
  '',
  '2',
  'OK',
  '0',
  'Server-Timing: total;dur=1',
  'X-Trailer: t',
  '',
  ''
].join('\r\n')

const splits = {
  'one read': [response],
  'one byte per read': [...response],
  // `Accept` is a well-known name in its own right; `Content-` and `Server-T` are not.
  'names cut after a prefix': response.split(/(?<=Accept|Content-|Server-T)/)
}

for (const [name, chunks] of Object.entries(splits)) {
  test(`parsed headers are keyed lowercase and raw headers keep their case: ${name}`, async (t) => {
    const client = new Client('http://localhost', {
      connect: connectChunks([chunks.map((chunk) => Buffer.from(chunk, 'latin1'))])
    })
    t.after(() => client.destroy())

    const { statusCode, headers, rawHeaders, trailers, rawTrailers } = await dispatch(client, { path: '/', method: 'GET' })

    assert.strictEqual(statusCode, 200)
    assert.deepStrictEqual(headers, {
      'content-type': 'text/plain',
      etag: '"x"',
      'x-custom-name': 'custom',
      'accept-ranges': 'bytes',
      'set-cookie': ['a=1', 'b=2'],
      'transfer-encoding': 'chunked'
    })
    assert.deepStrictEqual(rawHeaders.filter((_, i) => i % 2 === 0).map(String), [
      'Content-Type', 'ETAG', 'x-Custom-Name', 'Accept-Ranges', 'Set-Cookie', 'set-COOKIE', 'Transfer-Encoding'
    ])
    assert.deepStrictEqual(trailers, { 'server-timing': 'total;dur=1', 'x-trailer': 't' })
    assert.deepStrictEqual(rawTrailers.filter((_, i) => i % 2 === 0).map(String), ['Server-Timing', 'X-Trailer'])
  })
}

for (const [name, split] of [['whole', false], ['split', true]]) {
  test(`a 304 with a non-zero Content-Length is not reused: ${name} name`, async (t) => {
    const head = 'HTTP/1.1 304 Not Modified\r\nCONTENT-LENGTH: 5\r\n\r\n'
    const first = split ? head.split(/(?<=CONTENT-LEN)/) : [head]
    let connections = 0
    const client = new Client('http://localhost', {
      connect: connectChunks([
        first.map((chunk) => Buffer.from(chunk)),
        [Buffer.from('HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n')]
      ], () => { connections++ })
    })
    t.after(() => client.destroy())

    assert.strictEqual((await dispatch(client, { path: '/', method: 'GET' })).statusCode, 304)
    assert.strictEqual((await dispatch(client, { path: '/', method: 'GET' })).statusCode, 200)
    assert.strictEqual(connections, 2)
  })
}
