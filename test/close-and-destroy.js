'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('http')
const { kSocket } = require('../lib/symbols')

test('close waits for queued requests to finish', (t) => {
  t.plan(16)

  const server = createServer()

  server.on('request', (req, res) => {
    t.pass('request received')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })

    client.request({ path: '/', method: 'GET' }, function (err, data) {
      onRequest(err, data)

      client.request({ path: '/', method: 'GET' }, onRequest)
      client.request({ path: '/', method: 'GET' }, onRequest)
      client.request({ path: '/', method: 'GET' }, onRequest)

      // needed because the next element in the queue will be called
      // after the current function completes
      process.nextTick(function () {
        client.close()
      })
    })
  })

  function onRequest (err, { statusCode, headers, body }) {
    t.error(err)
    t.strictEqual(statusCode, 200)
    const bufs = []
    body.on('data', (buf) => {
      bufs.push(buf)
    })
    body.on('end', () => {
      t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
    })
  }
})

test('destroy invoked all pending callbacks', (t) => {
  t.plan(4)

  const server = createServer()

  server.on('request', (req, res) => {
    res.write('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })

    client.request({ path: '/', method: 'GET' }, (err, data) => {
      t.error(err)
      data.body.on('error', (err) => {
        t.ok(err)
      })
      client.destroy()
    })
    client.request({ path: '/', method: 'GET' }, (err) => {
      t.ok(err instanceof errors.ClientDestroyedError)
    })
    client.request({ path: '/', method: 'GET' }, (err) => {
      t.ok(err instanceof errors.ClientDestroyedError)
    })
  })
})

test('close waits until socket is destroyed', (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    res.end(req.url)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })

    makeRequest()

    client.once('connect', () => {
      let done = false
      client[kSocket].on('close', () => {
        done = true
      })
      client.close((err) => {
        t.error(err)
        t.strictEqual(client.closed, true)
        t.strictEqual(done, true)
      })
    })

    function makeRequest () {
      return client.request({ path: '/', method: 'GET' }, (err, data) => {
        t.error(err instanceof errors.ClientClosedError)
      })
    }
  })
})

test('close should still reconnect', (t) => {
  t.plan(6)

  const server = createServer((req, res) => {
    res.end(req.url)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })

    t.ok(makeRequest())
    t.ok(!makeRequest())

    client.close((err) => {
      t.strictEqual(err, null)
      t.strictEqual(client.closed, true)
    })
    client[kSocket].destroy()

    function makeRequest () {
      return client.request({ path: '/', method: 'GET' }, (err, data) => {
        data.body.resume()
        t.error(err)
      })
    }
  })
})

test('close should call callback once finished', (t) => {
  t.plan(6)

  const server = createServer((req, res) => {
    setTimeout(function () {
      res.end(req.url)
    }, 10)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })

    t.ok(makeRequest())
    t.ok(!makeRequest())

    client.close((err) => {
      t.strictEqual(err, null)
      t.strictEqual(client.closed, true)
    })

    function makeRequest () {
      return client.request({ path: '/', method: 'GET' }, (err, data) => {
        t.error(err)
        data.body.resume()
      })
    }
  })
})

test('closed and destroyed errors', (t) => {
  t.plan(3)

  const client = new Client('http://localhost:4000', {
    pipelining: 1
  })
  client.request({ path: '/', method: 'GET' }, (err) => {
    t.ok(err)
  })
  client.close()
  client.request({}, (err) => {
    t.ok(err instanceof errors.ClientClosedError)
    client.destroy()
    client.request({}, (err) => {
      t.ok(err instanceof errors.ClientDestroyedError)
    })
  })
})

test('close after and destroy should error', (t) => {
  t.plan(2)

  const client = new Client('http://localhost:4000')
  client.destroy()
  client.close((err) => {
    t.ok(err instanceof errors.ClientDestroyedError)
  })
  client.close().catch((err) => {
    t.ok(err instanceof errors.ClientDestroyedError)
  })
})
