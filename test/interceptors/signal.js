'use strict'

const { createServer } = require('node:http')
const { test, after } = require('node:test')
const { once } = require('node:events')
const { tspl } = require('@matteo.collina/tspl')
const { Client, interceptors } = require('../..')
const { signal } = interceptors

test('should abort request when signal is already aborted', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('asd')
  })

  server.listen(0)
  await once(server, 'listening')

  const ac = new AbortController()
  const _err = new Error('Custom abort reason')
  ac.abort(_err)

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(signal())

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  try {
    await client.request({ method: 'GET', path: '/', signal: ac.signal })
  } catch (err) {
    t.equal(err, _err)
  }

  await t.completed
})

test('should abort request when signal is aborted after request starts', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('asd')
  })

  server.listen(0)
  await once(server, 'listening')

  const ac = new AbortController()

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(signal())

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const ures = await client.request({ method: 'GET', path: '/', signal: ac.signal })
  ac.abort()

  try {
    /* eslint-disable-next-line no-unused-vars */
    for await (const chunk of ures.body) {
      // Do nothing...
    }
  } catch (err) {
    t.equal(err.name, 'AbortError')
  }

  await t.completed
})

test('should abort request with custom reason when signal is aborted', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('asd')
  })

  server.listen(0)
  await once(server, 'listening')

  const ac = new AbortController()
  const _err = new Error('Custom abort reason')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(signal())

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const ures = await client.request({ method: 'GET', path: '/', signal: ac.signal })
  ac.abort(_err)
  try {
    /* eslint-disable-next-line no-unused-vars */
    for await (const chunk of ures.body) {
      // Do nothing...
    }
  } catch (err) {
    t.equal(err, _err)
  }

  await t.completed
})

test('should not interfere when signal is not provided', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('hello')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(signal())

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({ method: 'GET', path: '/' })
  const body = await response.body.text()
  t.equal(body, 'hello')

  await t.completed
})

test('should cleanup abort listener on response end', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('hello')
  })

  server.listen(0)
  await once(server, 'listening')

  const ac = new AbortController()

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(signal())

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({ method: 'GET', path: '/', signal: ac.signal })
  await response.body.text()

  ac.abort()
  t.ok(true, 'Cleanup successful')

  await t.completed
})

test('should cleanup abort listener on response error', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.destroy()
  })

  server.listen(0)
  await once(server, 'listening')

  const ac = new AbortController()

  const client = new Client(
    `http://localhost:${server.address().port}`
  ).compose(signal())

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  try {
    await client.request({ method: 'GET', path: '/', signal: ac.signal })
  } catch (err) {
    t.ok(err)
  }

  ac.abort()
  t.ok(true, 'Cleanup successful')

  await t.completed
})
