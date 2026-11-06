'use strict'

const assert = require('node:assert/strict')
const { once } = require('node:events')
const { createSecureServer, createServer } = require('node:http2')
const { test } = require('node:test')
const pem = require('@metcoder95/https-pem')

const { Client, Pool } = require('..')

for (const secure of [true, false]) {
  test(`Pool defers spare ${secure ? 'h2' : 'h2c'} factories until dispatch`, { timeout: 5000 }, async t => {
    const options = { settings: { maxConcurrentStreams: 1 } }
    const server = secure
      ? createSecureServer({ ...await pem.generate({ opts: { keySize: 2048 } }), ...options })
      : createServer(options)
    const sessions = new Set()
    let liveStream
    let requests = 0
    server.on('session', session => sessions.add(session))
    server.on('stream', stream => {
      requests++
      liveStream = stream
      stream.on('error', () => {})
      stream.respond({ ':status': 200 })
      stream.write('live')
    })

    await once(server.listen(0), 'listening')
    let factoryCalls = 0
    let failFactory = false
    const factoryError = new Error('factory failed')
    const pool = new Pool(`${secure ? 'https' : 'http'}://localhost:${server.address().port}`, {
      allowH2: true,
      useH2c: !secure,
      connections: 2,
      connect: { rejectUnauthorized: false },
      factory (origin, options) {
        factoryCalls++
        if (failFactory) throw factoryError
        return new Client(origin, options)
      }
    })
    t.after(async () => {
      await pool.destroy()
      for (const session of sessions) session.destroy()
      await new Promise(resolve => server.close(resolve))
    })

    const live = await pool.request({ path: '/live', method: 'GET' })
    assert.equal(factoryCalls, 1)
    failFactory = true
    await assert.rejects(pool.request({ path: '/mutation', method: 'POST', body: 'one' }), error => error === factoryError)
    assert.equal(factoryCalls, 2)
    assert.equal(requests, 1)
    assert.equal(live.body.destroyed, false)
    liveStream.end()
    await live.body.text()
    await pool.close()
  })

  for (const connections of [1, 2]) {
    test(`Pool preserves ${secure ? 'h2' : 'h2c'} backpressure at connections=${connections}`, { timeout: 5000 }, async t => {
      const options = { settings: { maxConcurrentStreams: 1 } }
      const server = secure
        ? createSecureServer({ ...await pem.generate({ opts: { keySize: 2048 } }), ...options })
        : createServer(options)
      const sessions = new Set()
      let liveStream
      let mutations = 0
      server.on('session', session => sessions.add(session))
      server.on('stream', (stream, headers) => {
        stream.on('error', () => {})
        stream.resume()
        stream.respond({ ':status': 200 })
        if (headers[':path'] === '/live') {
          liveStream = stream
          stream.write('live')
        } else {
          mutations++
          stream.end('ok')
        }
      })

      await once(server.listen(0), 'listening')
      const pool = new Pool(`${secure ? 'https' : 'http'}://localhost:${server.address().port}`, {
        allowH2: true,
        useH2c: !secure,
        connections,
        connect: { rejectUnauthorized: false }
      })
      t.after(async () => {
        await pool.destroy()
        for (const session of sessions) session.destroy()
        await new Promise(resolve => server.close(resolve))
      })

      let drains = 0
      pool.on('drain', () => drains++)
      const live = await pool.request({ path: '/live', method: 'GET' })
      assert.equal(drains, connections === 1 ? 0 : 1)
      assert.equal(pool.stats.running, 1)

      const mutation = pool.request({ path: '/mutation', method: 'POST', body: 'one' })
      if (connections === 1) {
        assert.equal(pool.stats.queued, 1)
        liveStream.end()
        await live.body.text()
      }
      const response = await mutation
      assert.equal(await response.body.text(), 'ok')
      assert.equal(mutations, 1)
      assert.equal(sessions.size, connections)

      if (connections === 2) {
        assert.equal(live.body.destroyed, false)
        liveStream.end()
        await live.body.text()
      }
      await pool.close()
      assert.ok(drains > 0)
    })
  }

  for (const queuedDuringNegotiation of [true, false]) {
    test(`Pool serves requests beside a saturated ${secure ? 'h2' : 'h2c'} probe (queued during negotiation: ${queuedDuringNegotiation})`, { timeout: 5000 }, async t => {
      const options = { settings: { maxConcurrentStreams: 1 } }
      const server = secure
        ? createSecureServer({ ...await pem.generate({ opts: { keySize: 2048 } }), ...options })
        : createServer(options)
      const sessions = new Set()
      server.on('session', session => sessions.add(session))
      server.on('stream', stream => {
        stream.on('error', () => {})
        stream.respond({ ':status': 200 })
        stream.write('live')
      })

      await once(server.listen(0), 'listening')
      const pool = new Pool(`${secure ? 'https' : 'http'}://localhost:${server.address().port}`, {
        allowH2: true,
        useH2c: !secure,
        connect: { rejectUnauthorized: false }
      })
      t.after(async () => {
        await pool.destroy()
        for (const session of sessions) session.destroy()
        await new Promise(resolve => server.close(resolve))
      })

      const firstRequest = pool.request({ path: '/one', method: 'GET' })
      if (!queuedDuringNegotiation) await firstRequest
      const responses = await Promise.all([
        firstRequest,
        pool.request({ path: '/two', method: 'GET' })
      ])

      assert.equal(sessions.size, 2)
      for (const response of responses) {
        assert.equal(response.statusCode, 200)
        assert.equal(response.body.destroyed, false)
        response.body.destroy()
      }
    })
  }
}
