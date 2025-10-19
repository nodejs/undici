import { createServer } from 'node:http'
import { test, after } from 'node:test'
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

test('imported Client works with basic GET', (t, done) => {
  t.plan(10)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual('/', req.url)
    t.assert.strictEqual('GET', req.method)
    t.assert.strictEqual(`localhost:${server.address().port}`, req.headers.host)
    t.assert.strictEqual(undefined, req.headers.foo)
    t.assert.strictEqual('bar', req.headers.bar)
    t.assert.strictEqual(undefined, req.headers['content-length'])
    res.setHeader('Content-Type', 'text/plain')
    res.end('hello')
  })

  after(() => server.close())

  const reqHeaders = {
    foo: undefined,
    bar: 'bar'
  }

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.request({
      path: '/',
      method: 'GET',
      headers: reqHeaders
    }, (err, data) => {
      t.assert.ifError(err)
      const { statusCode, headers, body } = data
      t.assert.strictEqual(statusCode, 200)
      t.assert.strictEqual(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.assert.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
        done()
      })
    })
  })
})

test('imported errors work with request args validation', (t) => {
  t.plan(2)

  const client = new Client('http://localhost:5000')

  client.request(null, (err) => {
    t.assert.ok(err instanceof errors.InvalidArgumentError)
  })

  try {
    client.request(null, 'asd')
  } catch (err) {
    t.assert.ok(err instanceof errors.InvalidArgumentError)
  }
})

test('imported errors work with request args validation promise', (t) => {
  t.plan(1)

  const client = new Client('http://localhost:5000')

  client.request(null).catch((err) => {
    t.assert.ok(err instanceof errors.InvalidArgumentError)
  })
})

test('named exports', (t) => {
  t.plan(10)
  t.assert.strictEqual(typeof Client, 'function')
  t.assert.strictEqual(typeof Pool, 'function')
  t.assert.strictEqual(typeof Agent, 'function')
  t.assert.strictEqual(typeof request, 'function')
  t.assert.strictEqual(typeof stream, 'function')
  t.assert.strictEqual(typeof pipeline, 'function')
  t.assert.strictEqual(typeof connect, 'function')
  t.assert.strictEqual(typeof upgrade, 'function')
  t.assert.strictEqual(typeof setGlobalDispatcher, 'function')
  t.assert.strictEqual(typeof getGlobalDispatcher, 'function')
})
