'use strict'

const assert = require('node:assert')
const { once } = require('node:events')
const { constants, createServer } = require('node:http2')
const { test } = require('node:test')
const { Agent, fetch } = require('..')

for (const api of ['request', 'fetch']) {
  for (const [failure, description] of [
    ['session error', 'preserves session errors'],
    ['protocol stream error', 'preserves the cause of protocol stream errors'],
    ['truncated body', 'rejects truncated bodies']
  ]) {
    test(`${api} ${description} after response headers`, { timeout: 5000 }, async (t) => {
      const server = createServer()
      const sessions = new Set()
      let responseStream
      let sessionCount = 0

      server.on('session', (session) => {
        sessionCount++
        sessions.add(session)
        session.on('error', () => {})
        session.on('close', () => sessions.delete(session))
      })
      server.on('stream', (stream, headers) => {
        stream.on('error', () => {})
        if (headers[':path'] === '/valid') {
          stream.respond({ ':status': 200, 'content-length': 2 })
          stream.end('ok')
          return
        }
        responseStream = stream
        stream.respond({ ':status': 200, 'content-length': 10 })
        stream.write('123')
      })

      const dispatcher = new Agent({ connections: 1, useH2c: true })
      t.after(async () => {
        await dispatcher.destroy()
        for (const session of sessions) session.destroy()
        await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()))
      })

      server.listen(0, '127.0.0.1')
      await once(server, 'listening')
      const origin = `http://127.0.0.1:${server.address().port}`
      const request = (path) => api === 'fetch'
        ? fetch(`${origin}${path}`, { dispatcher })
        : dispatcher.request({ origin, path, method: 'GET' })
      const readBody = (response) => api === 'fetch' ? response.text() : response.body.text()
      const response = await request('/')
      const body = response.body[Symbol.asyncIterator]()
      assert.strictEqual(Buffer.from((await body.next()).value).toString(), '123')
      const rejection = assert.rejects(body.next(), (err) => {
        if (api === 'fetch') {
          assert.ok(err instanceof TypeError)
          err = err.cause
        }
        if (failure === 'session error') {
          assert.strictEqual(err.code, 'ERR_HTTP2_SESSION_ERROR')
          assert.strictEqual(err.http2ErrorCode, constants.NGHTTP2_INTERNAL_ERROR)
        } else {
          assert.strictEqual(err.code, 'UND_ERR_RES_CONTENT_LENGTH_MISMATCH')
          if (failure === 'protocol stream error') {
            assert.strictEqual(err.http2ErrorCode, constants.NGHTTP2_PROTOCOL_ERROR)
            assert.ok(err.cause instanceof Error)
            assert.strictEqual(err.cause.code, 'ERR_HTTP2_STREAM_ERROR')
          }
        }
        return true
      })

      if (failure === 'session error') {
        responseStream.session.destroy(new Error('session failure'), constants.NGHTTP2_INTERNAL_ERROR)
      } else if (failure === 'protocol stream error') {
        responseStream.close(constants.NGHTTP2_PROTOCOL_ERROR)
      } else {
        responseStream.destroy()
      }
      await rejection

      assert.strictEqual(await readBody(await request('/valid')), 'ok')
      assert.strictEqual(sessionCount, failure === 'session error' ? 2 : 1)
    })
  }
}
