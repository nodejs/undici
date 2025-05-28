'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { createServer } = require('node:http')
const { test, after, describe } = require('node:test')
const { request, errors } = require('..')

test('no-slash/one-slash pathname should be included in req.path', async (t) => {
  t = tspl(t, { plan: 24 })

  const pathServer = createServer((req, res) => {
    t.fail('it shouldn\'t be called')
    res.statusCode = 200
    res.end('hello')
  })

  const requestedServer = createServer((req, res) => {
    t.strictEqual(`/localhost:${pathServer.address().port}`, req.url)
    t.strictEqual('GET', req.method)
    t.strictEqual(`localhost:${requestedServer.address().port}`, req.headers.host)
    res.statusCode = 200
    res.end('hello')
  })

  after(() => {
    requestedServer.close()
    pathServer.close()
  })

  await Promise.all([
    requestedServer.listen(0),
    pathServer.listen(0)
  ])

  const noSlashPathname = await request({
    method: 'GET',
    origin: `http://localhost:${requestedServer.address().port}`,
    pathname: `localhost:${pathServer.address().port}`
  })
  t.strictEqual(noSlashPathname.statusCode, 200)
  const noSlashPath = await request({
    method: 'GET',
    origin: `http://localhost:${requestedServer.address().port}`,
    path: `localhost:${pathServer.address().port}`
  })
  t.strictEqual(noSlashPath.statusCode, 200)
  const noSlashPath2Arg = await request(
    `http://localhost:${requestedServer.address().port}`,
    { path: `localhost:${pathServer.address().port}` }
  )
  t.strictEqual(noSlashPath2Arg.statusCode, 200)
  const oneSlashPathname = await request({
    method: 'GET',
    origin: `http://localhost:${requestedServer.address().port}`,
    pathname: `/localhost:${pathServer.address().port}`
  })
  t.strictEqual(oneSlashPathname.statusCode, 200)
  const oneSlashPath = await request({
    method: 'GET',
    origin: `http://localhost:${requestedServer.address().port}`,
    path: `/localhost:${pathServer.address().port}`
  })
  t.strictEqual(oneSlashPath.statusCode, 200)
  const oneSlashPath2Arg = await request(
    `http://localhost:${requestedServer.address().port}`,
    { path: `/localhost:${pathServer.address().port}` }
  )
  t.strictEqual(oneSlashPath2Arg.statusCode, 200)
  t.end()
})

test('protocol-relative URL as pathname should be included in req.path', async (t) => {
  t = tspl(t, { plan: 12 })

  const pathServer = createServer((req, res) => {
    t.fail('it shouldn\'t be called')
    res.statusCode = 200
    res.end('hello')
  })

  const requestedServer = createServer((req, res) => {
    t.strictEqual(`//localhost:${pathServer.address().port}`, req.url)
    t.strictEqual('GET', req.method)
    t.strictEqual(`localhost:${requestedServer.address().port}`, req.headers.host)
    res.statusCode = 200
    res.end('hello')
  })

  after(() => {
    requestedServer.close()
    pathServer.close()
  })

  await Promise.all([
    requestedServer.listen(0),
    pathServer.listen(0)
  ])

  const noSlashPathname = await request({
    method: 'GET',
    origin: `http://localhost:${requestedServer.address().port}`,
    pathname: `//localhost:${pathServer.address().port}`
  })
  t.strictEqual(noSlashPathname.statusCode, 200)
  const noSlashPath = await request({
    method: 'GET',
    origin: `http://localhost:${requestedServer.address().port}`,
    path: `//localhost:${pathServer.address().port}`
  })
  t.strictEqual(noSlashPath.statusCode, 200)
  const noSlashPath2Arg = await request(
    `http://localhost:${requestedServer.address().port}`,
    { path: `//localhost:${pathServer.address().port}` }
  )
  t.strictEqual(noSlashPath2Arg.statusCode, 200)
  t.end()
})

test('Absolute URL as pathname should be included in req.path', async (t) => {
  t = tspl(t, { plan: 12 })

  const pathServer = createServer((req, res) => {
    t.fail('it shouldn\'t be called')
    res.statusCode = 200
    res.end('hello')
  })

  const requestedServer = createServer((req, res) => {
    t.strictEqual(`/http://localhost:${pathServer.address().port}`, req.url)
    t.strictEqual('GET', req.method)
    t.strictEqual(`localhost:${requestedServer.address().port}`, req.headers.host)
    res.statusCode = 200
    res.end('hello')
  })

  after(() => {
    requestedServer.close()
    pathServer.close()
  })

  await Promise.all([
    requestedServer.listen(0),
    pathServer.listen(0)
  ])

  const noSlashPathname = await request({
    method: 'GET',
    origin: `http://localhost:${requestedServer.address().port}`,
    pathname: `http://localhost:${pathServer.address().port}`
  })
  t.strictEqual(noSlashPathname.statusCode, 200)
  const noSlashPath = await request({
    method: 'GET',
    origin: `http://localhost:${requestedServer.address().port}`,
    path: `http://localhost:${pathServer.address().port}`
  })
  t.strictEqual(noSlashPath.statusCode, 200)
  const noSlashPath2Arg = await request(
    `http://localhost:${requestedServer.address().port}`,
    { path: `http://localhost:${pathServer.address().port}` }
  )
  t.strictEqual(noSlashPath2Arg.statusCode, 200)
  t.end()
})

describe('DispatchOptions#expectContinue', () => {
  test('Should throw if invalid expectContinue option', async t => {
    t = tspl(t, { plan: 1 })

    await t.rejects(request({
      method: 'GET',
      origin: 'http://somehost.xyz',
      expectContinue: 0
    }), /invalid expectContinue/)

    await t.completed
  })
})

describe('DispatchOptions#reset', () => {
  test('Should throw if invalid reset option', async t => {
    t = tspl(t, { plan: 1 })

    await t.rejects(request({
      method: 'GET',
      origin: 'http://somehost.xyz',
      reset: 0
    }), /invalid reset/)

    await t.completed
  })

  test('Should include "connection:close" if reset true', async t => {
    t = tspl(t, { plan: 3 })

    const server = createServer((req, res) => {
      t.strictEqual('GET', req.method)
      t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
      t.strictEqual(req.headers.connection, 'close')
      res.statusCode = 200
      res.end('hello')
    })

    after(() => server.close())

    await new Promise((resolve, reject) => {
      server.listen(0, (err) => {
        if (err != null) reject(err)
        else resolve()
      })
    })

    await request({
      method: 'GET',
      origin: `http://localhost:${server.address().port}`,
      reset: true
    })
  })

  test('Should include "connection:keep-alive" if reset false', async t => {
    t = tspl(t, { plan: 3 })

    const server = createServer((req, res) => {
      t.strictEqual('GET', req.method)
      t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
      t.strictEqual(req.headers.connection, 'keep-alive')
      res.statusCode = 200
      res.end('hello')
    })

    after(() => server.close())

    await new Promise((resolve, reject) => {
      server.listen(0, (err) => {
        if (err != null) reject(err)
        else resolve()
      })
    })

    await request({
      method: 'GET',
      origin: `http://localhost:${server.address().port}`,
      reset: false
    })
  })

  test('Should react to manual set of "connection:close" header', async t => {
    t = tspl(t, { plan: 3 })

    const server = createServer((req, res) => {
      t.strictEqual('GET', req.method)
      t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
      t.strictEqual(req.headers.connection, 'close')
      res.statusCode = 200
      res.end('hello')
    })

    after(() => server.close())

    await new Promise((resolve, reject) => {
      server.listen(0, (err) => {
        if (err != null) reject(err)
        else resolve()
      })
    })

    await request({
      method: 'GET',
      origin: `http://localhost:${server.address().port}`,
      headers: {
        connection: 'close'
      }
    })
  })
})

describe('Should include headers from iterable objects', scope => {
  test('Should include headers built with Headers global object', { skip: !globalThis.Headers }, async t => {
    t = tspl(t, { plan: 3 })

    const server = createServer((req, res) => {
      t.strictEqual('GET', req.method)
      t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
      t.strictEqual(req.headers.hello, 'world')
      res.statusCode = 200
      res.end('hello')
    })

    const headers = new globalThis.Headers()
    headers.set('hello', 'world')

    after(() => server.close())

    await new Promise((resolve, reject) => {
      server.listen(0, (err) => {
        if (err != null) reject(err)
        else resolve()
      })
    })

    await request({
      method: 'GET',
      origin: `http://localhost:${server.address().port}`,
      reset: true,
      headers
    })
  })

  test('Should include headers built with Map', async t => {
    t = tspl(t, { plan: 3 })

    const server = createServer((req, res) => {
      t.strictEqual('GET', req.method)
      t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
      t.strictEqual(req.headers.hello, 'world')
      res.statusCode = 200
      res.end('hello')
    })

    const headers = new Map()
    headers.set('hello', 'world')

    after(() => server.close())

    await new Promise((resolve, reject) => {
      server.listen(0, (err) => {
        if (err != null) reject(err)
        else resolve()
      })
    })

    await request({
      method: 'GET',
      origin: `http://localhost:${server.address().port}`,
      reset: true,
      headers
    })
  })

  test('Should include headers built with custom iterable object', async t => {
    t = tspl(t, { plan: 3 })

    const server = createServer((req, res) => {
      t.strictEqual('GET', req.method)
      t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
      t.strictEqual(req.headers.hello, 'world')
      res.statusCode = 200
      res.end('hello')
    })

    const headers = {
      * [Symbol.iterator] () {
        yield ['hello', 'world']
      }
    }

    after(() => server.close())

    await new Promise((resolve, reject) => {
      server.listen(0, (err) => {
        if (err != null) reject(err)
        else resolve()
      })
    })

    await request({
      method: 'GET',
      origin: `http://localhost:${server.address().port}`,
      reset: true,
      headers
    })
  })

  test('Should throw error if headers iterable object does not yield key-value pairs', async t => {
    t = tspl(t, { plan: 2 })

    const server = createServer((req, res) => {
      res.end('hello')
    })

    const headers = {
      * [Symbol.iterator] () {
        yield 'Bad formatted header'
      }
    }

    after(() => server.close())

    await new Promise((resolve, reject) => {
      server.listen(0, (err) => {
        if (err != null) reject(err)
        else resolve()
      })
    })

    await request({
      method: 'GET',
      origin: `http://localhost:${server.address().port}`,
      reset: true,
      headers
    }).catch((err) => {
      t.ok(err instanceof errors.InvalidArgumentError)
      t.strictEqual(err.message, 'headers must be in key-value pair format')
    })
  })
})
