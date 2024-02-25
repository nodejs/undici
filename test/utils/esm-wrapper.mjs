import { tspl } from '@matteo.collina/tspl'
import { createServer } from 'http'
import { test, after } from 'node:test'
import { once } from 'node:events'
import {
  Agent,
  Client,
  errors,
  pipeline,
  Pool,
  request,
  connect,
  upgrade,
  setGlobalDispatcher,
  getGlobalDispatcher,
  stream
} from '../../index.js'

test('imported Client works with basic GET', async (t) => {
  t = tspl(t, { plan: 10 })

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

  after(() => server.close())

  const reqHeaders = {
    foo: undefined,
    bar: 'bar'
  }

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
  after(() => client.close())

  client.request({
    path: '/',
    method: 'GET',
    headers: reqHeaders
  }, (err, data) => {
    t.ifError(err)
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
  await t.completed
})

test('imported errors work with request args validation', (t) => {
  t = tspl(t, { plan: 2 })

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
  t = tspl(t, { plan: 1 })

  const client = new Client('http://localhost:5000')

  client.request(null).catch((err) => {
    t.ok(err instanceof errors.InvalidArgumentError)
  })
})

test('named exports', (t) => {
  t = tspl(t, { plan: 10 })
  t.strictEqual(typeof Client, 'function')
  t.strictEqual(typeof Pool, 'function')
  t.strictEqual(typeof Agent, 'function')
  t.strictEqual(typeof request, 'function')
  t.strictEqual(typeof stream, 'function')
  t.strictEqual(typeof pipeline, 'function')
  t.strictEqual(typeof connect, 'function')
  t.strictEqual(typeof upgrade, 'function')
  t.strictEqual(typeof setGlobalDispatcher, 'function')
  t.strictEqual(typeof getGlobalDispatcher, 'function')
})
