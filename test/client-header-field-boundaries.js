'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { once } = require('node:events')
const { createServer } = require('node:net')
const { setImmediate } = require('node:timers/promises')
const { Client } = require('..')
const { kKeepAliveTimeoutValue } = require('../lib/core/symbols')

async function setup (t, chunks, options = {}) {
  const server = createServer(socket => {
    socket.on('error', () => {})
    let pending = ''
    socket.on('data', chunk => {
      pending += chunk.toString()
      if (!pending.includes('\r\n\r\n')) return
      pending = ''
      send().catch(err => socket.destroy(err))
    })
    async function send () {
      for (const chunk of chunks) {
        socket.write(chunk)
        await setImmediate()
      }
    }
  })
  t.after(() => server.close())
  await once(server.listen(0), 'listening')
  const client = new Client(`http://localhost:${server.address().port}`, {
    keepAliveTimeoutThreshold: 0,
    keepAliveTimeout: 7000,
    ...options
  })
  t.after(() => client.destroy())
  return client
}

for (const [name, fields, timeout] of [
  ['numeric extension must not extend timeout', ['timeout=1', '0=max'], 1000],
  ['parameter names must not span fields', ['time', 'out=30'], 7000],
  ['longer parameter names do not match', ['x-timeout=30', 'timeout=3'], 3000],
  ['case-insensitive timeout parameter', ['max=2', 'TIMEOUT=3'], 3000],
  ['timeout in a later field', ['max=2', 'timeout=30'], 30000],
  ['empty field before timeout', ['', 'timeout=3'], 3000]
]) {
  test(`Keep-Alive field boundaries: ${name}`, { timeout: 5000 }, async t => {
    const client = await setup(t, [
      'HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: keep-alive\r\n',
      ...fields.map(value => `Keep-Alive: ${value}\r\n`),
      '\r\n'
    ])
    const response = await client.request({ path: '/', method: 'GET' })
    await response.body.dump()
    assert.equal(client[kKeepAliveTimeoutValue], timeout)
    assert.deepEqual(response.headers['keep-alive'], fields)
  })
}

test('tracked field names and values may span chunks', { timeout: 5000 }, async t => {
  const client = await setup(t, [
    'HTTP/1.1 200 OK\r\nKeep-Al', 'ive: time', 'out=3\r\nContent-Len',
    'gth: 1', '2\r\nConnection: keep-', 'alive\r\nX-Note: ab\r\nX-No',
    'te: c', 'd\r\n\r\nhello world!'
  ], { useMilo: false })
  const response = await client.request({ path: '/', method: 'GET' })
  assert.equal(await response.body.text(), 'hello world!')
  assert.equal(client[kKeepAliveTimeoutValue], 3000)
  assert.equal(response.headers['content-length'], '12')
  assert.deepEqual(response.headers['x-note'], ['ab', 'cd'])
})

for (const fields of [['2', '2'], ['2', '3'], ['2, 2']]) {
  test(`Content-Length duplicates are rejected: ${fields.join('/')}`, { timeout: 5000 }, async t => {
    const client = await setup(t, [
      'HTTP/1.1 200 OK\r\n', ...fields.map(value => `Content-Length: ${value}\r\n`),
      '\r\nok'
    ])
    await assert.rejects(client.request({ path: '/', method: 'GET' }), err => {
      assert.match(err.code, /^(?:HPE_|UND_ERR_RES_CONTENT_LENGTH_MISMATCH$)/)
      return true
    })
  })
}
