'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { Agent, Dispatcher1Wrapper } = require('..')

// See https://github.com/nodejs/undici/issues/5500

function legacyDispatch (wrapper, opts) {
  return new Promise((resolve, reject) => {
    let body = ''
    wrapper.dispatch(opts, {
      onConnect () {},
      onHeaders (statusCode) {
        this.statusCode = statusCode
        return true
      },
      onData (chunk) {
        body += chunk
        return true
      },
      onComplete () {
        resolve({ statusCode: this.statusCode, body })
      },
      onError (err) {
        reject(err)
      }
    })
  })
}

async function startServer () {
  const server = createServer((req, res) => {
    let length = 0
    req.on('data', (chunk) => { length += chunk.length })
    req.on('end', () => {
      res.end(`${length}:${req.headers['content-length']}`)
    })
  })
  server.listen(0)
  await once(server, 'listening')
  return server
}

test('collapses identical repeated content-length from a legacy consumer', async (t) => {
  const server = await startServer()
  const agent = new Agent()
  const wrapper = new Dispatcher1Wrapper(agent)
  t.after(() => { server.close(); return agent.close() })

  const { statusCode, body } = await legacyDispatch(wrapper, {
    origin: `http://127.0.0.1:${server.address().port}`,
    path: '/',
    method: 'POST',
    headers: { 'Content-Length': '13, 13', 'content-type': 'text/plain' },
    body: 'update=INSERT'
  })

  assert.strictEqual(statusCode, 200)
  assert.strictEqual(body, '13:13')
})

test('collapses identical repeated content-length in flat array headers', async (t) => {
  const server = await startServer()
  const agent = new Agent()
  const wrapper = new Dispatcher1Wrapper(agent)
  t.after(() => { server.close(); return agent.close() })

  const { statusCode, body } = await legacyDispatch(wrapper, {
    origin: `http://127.0.0.1:${server.address().port}`,
    path: '/',
    method: 'POST',
    headers: ['content-length', '13 , 13', 'content-type', 'text/plain'],
    body: 'update=INSERT'
  })

  assert.strictEqual(statusCode, 200)
  assert.strictEqual(body, '13:13')
})

test('leaves a single content-length untouched', async (t) => {
  const server = await startServer()
  const agent = new Agent()
  const wrapper = new Dispatcher1Wrapper(agent)
  t.after(() => { server.close(); return agent.close() })

  const { statusCode, body } = await legacyDispatch(wrapper, {
    origin: `http://127.0.0.1:${server.address().port}`,
    path: '/',
    method: 'POST',
    headers: { 'content-length': '13' },
    body: 'update=INSERT'
  })

  assert.strictEqual(statusCode, 200)
  assert.strictEqual(body, '13:13')
})

test('still rejects conflicting or malformed repeated content-length', async (t) => {
  const server = await startServer()
  const agent = new Agent()
  const wrapper = new Dispatcher1Wrapper(agent)
  t.after(() => { server.close(); return agent.close() })

  for (const value of ['10, 13', ', 13']) {
    await assert.rejects(
      legacyDispatch(wrapper, {
        origin: `http://127.0.0.1:${server.address().port}`,
        path: '/',
        method: 'POST',
        headers: { 'content-length': value },
        body: 'update=INSERT'
      }),
      { code: 'UND_ERR_INVALID_ARG', message: 'invalid content-length header' }
    )
  }
})

test('does not mutate the caller-provided headers object', async (t) => {
  const server = await startServer()
  const agent = new Agent()
  const wrapper = new Dispatcher1Wrapper(agent)
  t.after(() => { server.close(); return agent.close() })

  const headers = { 'content-length': '13, 13' }
  await legacyDispatch(wrapper, {
    origin: `http://127.0.0.1:${server.address().port}`,
    path: '/',
    method: 'POST',
    headers,
    body: 'update=INSERT'
  })

  assert.strictEqual(headers['content-length'], '13, 13')
})
