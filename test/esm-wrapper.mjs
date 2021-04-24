import tap from 'tap'

import { createServer } from 'http'

import { Agent, Client, Pool, errors, pipeline, request, setGlobalAgent, stream } from '../wrapper.mjs'

const { test } = tap

test('imported Client works with basic GET', (t) => {
  t.plan(10)

  const server = createServer((req, res) => {
    t.equal('/', req.url)
    t.equal('GET', req.method)
    t.equal(`localhost:${server.address().port}`, req.headers.host)
    t.equal(undefined, req.headers.foo)
    t.equal('bar', req.headers.bar)
    t.equal(undefined, req.headers['content-length'])
    res.setHeader('Content-Type', 'text/plain')
    res.end('hello')
  })

  t.teardown(server.close.bind(server))

  const reqHeaders = {
    foo: undefined,
    bar: 'bar'
  }

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'GET',
      headers: reqHeaders
    }, (err, data) => {
      t.error(err)
      const { statusCode, headers, body } = data
      t.equal(statusCode, 200)
      t.equal(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.equal('hello', Buffer.concat(bufs).toString('utf8'))
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

test('named exports', (t) => {
  t.equal(typeof Client, 'function')
  t.equal(typeof Pool, 'function')
  t.equal(typeof Agent, 'function')
  t.equal(typeof request, 'function')
  t.equal(typeof stream, 'function')
  t.equal(typeof pipeline, 'function')
  t.equal(typeof setGlobalAgent, 'function')
  t.end()
})
