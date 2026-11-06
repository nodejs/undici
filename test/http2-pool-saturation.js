'use strict'

const assert = require('node:assert/strict')
const { once } = require('node:events')
const { createSecureServer, createServer } = require('node:http2')
const { test } = require('node:test')
const pem = require('@metcoder95/https-pem')

const { Pool } = require('..')

for (const secure of [true, false]) {
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
