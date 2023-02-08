'use strict'

const { createServer } = require('http')
const { test } = require('tap')
const { request } = require('..')

function createPromise () {
  const result = {}
  result.promise = new Promise((resolve) => {
    result.resolve = resolve
  })
  return result
}

test('should parse content-disposition consistencely', async (t) => {
  t.plan(5)

  // create promise to allow server spinup in parallel
  const spinup1 = createPromise()
  const spinup2 = createPromise()
  const spinup3 = createPromise()

  // variables to store content-disposition header
  const header = []

  const server = createServer((req, res) => {
    res.writeHead(200, {
      'content-length': 2,
      'content-disposition': "attachment; filename='år.pdf'"
    })
    header.push("attachment; filename='år.pdf'")
    res.end('OK', spinup1.resolve)
  })
  t.teardown(server.close.bind(server))
  server.listen(0, spinup1.resolve)

  const proxy1 = createServer(async (req, res) => {
    const { statusCode, headers, body } = await request(`http://localhost:${server.address().port}`, {
      method: 'GET'
    })
    header.push(headers['content-disposition'])
    delete headers['transfer-encoding']
    res.writeHead(statusCode, headers)
    body.pipe(res)
  })
  t.teardown(proxy1.close.bind(proxy1))
  proxy1.listen(0, spinup2.resolve)

  const proxy2 = createServer(async (req, res) => {
    const { statusCode, headers, body } = await request(`http://localhost:${proxy1.address().port}`, {
      method: 'GET'
    })
    header.push(headers['content-disposition'])
    delete headers['transfer-encoding']
    res.writeHead(statusCode, headers)
    body.pipe(res)
  })
  t.teardown(proxy2.close.bind(proxy2))
  proxy2.listen(0, spinup3.resolve)

  // wait until all server spinup
  await Promise.all([spinup1.promise, spinup2.promise, spinup3.promise])

  const { statusCode, headers, body } = await request(`http://localhost:${proxy2.address().port}`, {
    method: 'GET'
  })
  header.push(headers['content-disposition'])
  t.equal(statusCode, 200)
  t.equal(await body.text(), 'OK')

  // we check header
  // must not be the same in first proxy
  t.notSame(header[0], header[1])
  // chaining always the same value
  t.equal(header[1], header[2])
  t.equal(header[2], header[3])
})
