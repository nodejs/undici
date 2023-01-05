'use strict'

const { createServer } = require('http')
const { test } = require('tap')
const { request } = require('..')

test('no-slash/one-slash pathname should be included in req.path', async (t) => {
  const pathServer = createServer((req, res) => {
    t.fail('it shouldn\'t be called')
    res.statusCode = 200
    res.end('hello')
  })

  const requestedServer = createServer((req, res) => {
    t.equal(`/localhost:${pathServer.address().port}`, req.url)
    t.equal('GET', req.method)
    t.equal(`localhost:${requestedServer.address().port}`, req.headers.host)
    res.statusCode = 200
    res.end('hello')
  })

  t.teardown(requestedServer.close.bind(requestedServer))
  t.teardown(pathServer.close.bind(pathServer))

  await Promise.all([
    requestedServer.listen(0),
    pathServer.listen(0)
  ])

  const noSlashPathname = await request({
    method: 'GET',
    origin: `http://localhost:${requestedServer.address().port}`,
    pathname: `localhost:${pathServer.address().port}`
  })
  t.equal(noSlashPathname.statusCode, 200)
  const noSlashPath = await request({
    method: 'GET',
    origin: `http://localhost:${requestedServer.address().port}`,
    path: `localhost:${pathServer.address().port}`
  })
  t.equal(noSlashPath.statusCode, 200)
  const noSlashPath2Arg = await request(
    `http://localhost:${requestedServer.address().port}`,
    { path: `localhost:${pathServer.address().port}` }
  )
  t.equal(noSlashPath2Arg.statusCode, 200)
  const oneSlashPathname = await request({
    method: 'GET',
    origin: `http://localhost:${requestedServer.address().port}`,
    pathname: `/localhost:${pathServer.address().port}`
  })
  t.equal(oneSlashPathname.statusCode, 200)
  const oneSlashPath = await request({
    method: 'GET',
    origin: `http://localhost:${requestedServer.address().port}`,
    path: `/localhost:${pathServer.address().port}`
  })
  t.equal(oneSlashPath.statusCode, 200)
  const oneSlashPath2Arg = await request(
    `http://localhost:${requestedServer.address().port}`,
    { path: `/localhost:${pathServer.address().port}` }
  )
  t.equal(oneSlashPath2Arg.statusCode, 200)
  t.end()
})

test('protocol-relative URL as pathname should be included in req.path', async (t) => {
  const pathServer = createServer((req, res) => {
    t.fail('it shouldn\'t be called')
    res.statusCode = 200
    res.end('hello')
  })

  const requestedServer = createServer((req, res) => {
    t.equal(`//localhost:${pathServer.address().port}`, req.url)
    t.equal('GET', req.method)
    t.equal(`localhost:${requestedServer.address().port}`, req.headers.host)
    res.statusCode = 200
    res.end('hello')
  })

  t.teardown(requestedServer.close.bind(requestedServer))
  t.teardown(pathServer.close.bind(pathServer))

  await Promise.all([
    requestedServer.listen(0),
    pathServer.listen(0)
  ])

  const noSlashPathname = await request({
    method: 'GET',
    origin: `http://localhost:${requestedServer.address().port}`,
    pathname: `//localhost:${pathServer.address().port}`
  })
  t.equal(noSlashPathname.statusCode, 200)
  const noSlashPath = await request({
    method: 'GET',
    origin: `http://localhost:${requestedServer.address().port}`,
    path: `//localhost:${pathServer.address().port}`
  })
  t.equal(noSlashPath.statusCode, 200)
  const noSlashPath2Arg = await request(
    `http://localhost:${requestedServer.address().port}`,
    { path: `//localhost:${pathServer.address().port}` }
  )
  t.equal(noSlashPath2Arg.statusCode, 200)
  t.end()
})

test('Absolute URL as pathname should be included in req.path', async (t) => {
  const pathServer = createServer((req, res) => {
    t.fail('it shouldn\'t be called')
    res.statusCode = 200
    res.end('hello')
  })

  const requestedServer = createServer((req, res) => {
    t.equal(`/http://localhost:${pathServer.address().port}`, req.url)
    t.equal('GET', req.method)
    t.equal(`localhost:${requestedServer.address().port}`, req.headers.host)
    res.statusCode = 200
    res.end('hello')
  })

  t.teardown(requestedServer.close.bind(requestedServer))
  t.teardown(pathServer.close.bind(pathServer))

  await Promise.all([
    requestedServer.listen(0),
    pathServer.listen(0)
  ])

  const noSlashPathname = await request({
    method: 'GET',
    origin: `http://localhost:${requestedServer.address().port}`,
    pathname: `http://localhost:${pathServer.address().port}`
  })
  t.equal(noSlashPathname.statusCode, 200)
  const noSlashPath = await request({
    method: 'GET',
    origin: `http://localhost:${requestedServer.address().port}`,
    path: `http://localhost:${pathServer.address().port}`
  })
  t.equal(noSlashPath.statusCode, 200)
  const noSlashPath2Arg = await request(
    `http://localhost:${requestedServer.address().port}`,
    { path: `http://localhost:${pathServer.address().port}` }
  )
  t.equal(noSlashPath2Arg.statusCode, 200)
  t.end()
})

test('DispatchOptions#reset', scope => {
  scope.plan(4)

  scope.test('Should throw if invalid reset option', t => {
    t.plan(1)

    t.rejects(request({
      method: 'GET',
      origin: 'http://somehost.xyz',
      reset: 0
    }), 'invalid reset')
  })

  scope.test('Should include "connection:close" if reset true', async t => {
    const server = createServer((req, res) => {
      t.equal('GET', req.method)
      t.equal(`localhost:${server.address().port}`, req.headers.host)
      t.equal(req.headers.connection, 'close')
      res.statusCode = 200
      res.end('hello')
    })

    t.plan(3)

    t.teardown(server.close.bind(server))

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

  scope.test('Should include "connection:keep-alive" if reset false', async t => {
    const server = createServer((req, res) => {
      t.equal('GET', req.method)
      t.equal(`localhost:${server.address().port}`, req.headers.host)
      t.equal(req.headers.connection, 'keep-alive')
      res.statusCode = 200
      res.end('hello')
    })

    t.plan(3)

    t.teardown(server.close.bind(server))

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

  scope.test('Should react to manual set of "connection:close" header', async t => {
    const server = createServer((req, res) => {
      t.equal('GET', req.method)
      t.equal(`localhost:${server.address().port}`, req.headers.host)
      t.equal(req.headers.connection, 'close')
      res.statusCode = 200
      res.end('hello')
    })

    t.plan(3)

    t.teardown(server.close.bind(server))

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
