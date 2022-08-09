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
