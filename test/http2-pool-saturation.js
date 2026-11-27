'use strict'

const assert = require('node:assert/strict')
const { AsyncLocalStorage } = require('node:async_hooks')
const { once } = require('node:events')
const { createSecureServer, createServer } = require('node:http2')
const { test } = require('node:test')
const pem = require('@metcoder95/https-pem')

const { Client, Pool } = require('..')

for (const secure of [true, false]) {
  test(`Pool preserves ${secure ? 'h2' : 'h2c'} backpressure after a reentrant factory-error retry`, { timeout: 5000 }, async t => {
    const options = { settings: { maxConcurrentStreams: 1 } }
    const server = secure
      ? createSecureServer({ ...await pem.generate({ opts: { keySize: 2048 } }), ...options })
      : createServer(options)
    const sessions = new Set()
    const streams = new Map()
    server.on('session', session => sessions.add(session))
    server.on('stream', (stream, headers) => {
      streams.set(headers[':path'], stream)
      stream.on('error', () => {})
      stream.resume()
      stream.respond({ ':status': 200 })
      stream.write('live')
    })
    await once(server.listen(0), 'listening')
    let factoryCalls = 0
    const factoryError = new Error('factory failed')
    const pool = new Pool(`${secure ? 'https' : 'http'}://localhost:${server.address().port}`, {
      allowH2: true,
      useH2c: !secure,
      connections: 2,
      connect: { rejectUnauthorized: false },
      factory (origin, options) {
        if (++factoryCalls === 2) throw factoryError
        return new Client(origin, options)
      }
    })
    t.after(async () => {
      await pool.destroy()
      for (const session of sessions) session.destroy()
      await new Promise(resolve => server.close(resolve))
    })
    let drains = 0
    let errors = 0
    let retryEnds = 0
    let retryError
    pool.on('drain', () => drains++)
    const first = pool.request({ path: '/live', method: 'GET' })
    const retryHeaders = new Promise(resolve => {
      pool.dispatch({ path: '/mutation', method: 'POST', body: 'one' }, {
        onResponseError (_controller, err) {
          errors++
          assert.equal(err, factoryError)
          const ready = pool.dispatch({ path: '/retry', method: 'POST', body: 'one' }, {
            onRequestStart () {},
            onResponseStart () { resolve() },
            onResponseData () {},
            onResponseEnd () { retryEnds++ },
            onResponseError (_controller, err) { retryError = err }
          })
          assert.equal(ready, false)
        }
      })
    })
    const live = await first
    await retryHeaders
    assert.equal(drains, 0)
    assert.equal(errors, 1)
    assert.equal(factoryCalls, 3)
    assert.equal(sessions.size, 2)
    assert.deepEqual([...streams.keys()].sort(), ['/live', '/retry'])
    const drained = once(pool, 'drain')
    streams.get('/retry').end()
    await drained
    assert.equal(retryEnds, 1)
    assert.equal(retryError, undefined)
    streams.get('/live').end()
    await live.body.text()
    await pool.close()
  })

  for (const failAt of [2, 3]) {
    test(`Pool rejects queued ${secure ? 'h2' : 'h2c'} factory failure ${failAt} without replay`, { timeout: 5000 }, async t => {
      const options = { settings: { maxConcurrentStreams: 1 } }
      const server = secure
        ? createSecureServer({ ...await pem.generate({ opts: { keySize: 2048 } }), ...options })
        : createServer(options)
      const sessions = new Set()
      const received = []
      let liveStream
      server.on('session', session => sessions.add(session))
      server.on('stream', (stream, headers) => {
        stream.on('error', () => {})
        stream.resume()
        stream.respond({ ':status': 200 })
        if (headers[':path'] === '/live') {
          liveStream = stream
          stream.write('live')
        } else {
          received.push(headers[':path'])
          stream.end('ok')
        }
      })

      await once(server.listen(0), 'listening')
      let factoryCalls = 0
      const factoryError = new Error('factory failed')
      const pool = new Pool(`${secure ? 'https' : 'http'}://localhost:${server.address().port}`, {
        allowH2: true,
        useH2c: !secure,
        connections: 3,
        connect: { rejectUnauthorized: false },
        factory (origin, options) {
          if (++factoryCalls === failAt) throw factoryError
          return new Client(origin, options)
        }
      })
      t.after(async () => {
        await pool.destroy()
        for (const session of sessions) session.destroy()
        await new Promise(resolve => server.close(resolve))
      })

      const storage = new AsyncLocalStorage()
      const terminals = []
      const first = pool.request({ path: '/live', method: 'GET' })
      const mutations = [1, 2].map(id => storage.run(id, () => new Promise(resolve => {
        pool.dispatch({ path: `/mutation-${id}`, method: 'POST', body: 'one' }, {
          onRequestStart () {},
          onResponseStart () {},
          onResponseData () {},
          onResponseEnd () {
            terminals.push(id)
            resolve(null)
          },
          onResponseError (_controller, err) {
            terminals.push(id)
            assert.equal(storage.getStore(), id)
            resolve(err)
          }
        })
      })))
      assert.equal(pool.stats.queued, 2)
      const live = await first
      const outcomes = await Promise.all(mutations)
      assert.deepEqual(outcomes, failAt === 2 ? [factoryError, null] : [null, factoryError])
      assert.deepEqual(terminals.sort(), [1, 2])
      assert.deepEqual(received, [failAt === 2 ? '/mutation-2' : '/mutation-1'])
      assert.equal(factoryCalls, 3)
      assert.equal(pool.stats.queued, 0)
      assert.equal(sessions.size, 2)
      assert.equal(live.body.destroyed, false)
      liveStream.end()
      assert.equal(await live.body.text(), 'live')
      await pool.close()
    })
  }

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
