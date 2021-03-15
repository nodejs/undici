import tap from 'tap'

import { createServer } from 'http'

import { Client, errors, Pool, Agent, request, stream, pipeline, setGlobalAgent } from '../index.js'

const { test } = tap

test('imported Client works with basic GET', (t) => {
  t.plan(10)

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
    t.strictEqual(undefined, req.headers.foo)
    t.strictEqual('bar', req.headers.bar)
    t.strictEqual(undefined, req.headers['content-length'])
    res.setHeader('Content-Type', 'text/plain')
    res.end('hello')
  })

  t.tearDown(server.close.bind(server))

  const reqHeaders = {
    foo: undefined,
    bar: 'bar'
  }

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'GET',
      headers: reqHeaders
    }, (err, data) => {
      t.error(err)
      const { statusCode, headers, body } = data
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})

test('imported errors work with request args validation', (t) => {
  t.plan(2)

  const client = new Client('http://localhost:5000')

  client.request(null, (err) => {
    t.ok(err instanceof errors.InvalidArgumentError)
  })

  try {
    client.request(null, 'asd')
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
  }
})

test('imported errors work with request args validation promise', (t) => {
  t.plan(1)

  const client = new Client('http://localhost:5000')

  client.request(null).catch((err) => {
    t.ok(err instanceof errors.InvalidArgumentError)
  })
})

test('name dexports', (t) => {
  t.is(typeof Client, 'function')
  t.is(typeof Pool, 'function')
  t.is(typeof Agent, 'function')
  t.is(typeof request, 'function')
  t.is(typeof stream, 'function')
  t.is(typeof pipeline, 'function')
  t.is(typeof setGlobalAgent, 'function')
  t.end()
})
