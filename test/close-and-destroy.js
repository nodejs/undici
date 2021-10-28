'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('http')
const { kSocket, kSize } = require('../lib/core/symbols')

test('close waits for queued requests to finish', (t) => {
  t.plan(16)

  const server = createServer()

  server.on('request', (req, res) => {
    t.pass('request received')
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

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
    t.equal(statusCode, 200)
    const bufs = []
    body.on('data', (buf) => {
      bufs.push(buf)
    })
    body.on('end', () => {
      t.equal('hello', Buffer.concat(bufs).toString('utf8'))
    })
  }
})

test('destroy invoked all pending callbacks', (t) => {
  t.plan(4)

  const server = createServer()

  server.on('request', (req, res) => {
    res.write('hello')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, data) => {
      t.error(err)
      data.body.on('error', (err) => {
        t.ok(err)
      }).resume()
      client.destroy()
    })
    client.request({ path: '/', method: 'GET' }, (err) => {
      t.type(err, errors.ClientDestroyedError)
    })
    client.request({ path: '/', method: 'GET' }, (err) => {
      t.type(err, errors.ClientDestroyedError)
    })
  })
})

test('destroy invoked all pending callbacks ticked', (t) => {
  t.plan(4)

  const server = createServer()

  server.on('request', (req, res) => {
    res.write('hello')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })
    t.teardown(client.destroy.bind(client))

    let ticked = false
    client.request({ path: '/', method: 'GET' }, (err) => {
      t.equal(ticked, true)
      t.type(err, errors.ClientDestroyedError)
    })
    client.request({ path: '/', method: 'GET' }, (err) => {
      t.equal(ticked, true)
      t.type(err, errors.ClientDestroyedError)
    })
    client.destroy()
    ticked = true
  })
})

test('close waits until socket is destroyed', (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    res.end(req.url)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    makeRequest()

    client.once('connect', () => {
      let done = false
      client[kSocket].on('close', () => {
        done = true
      })
      client.close((err) => {
        t.error(err)
        t.equal(client.closed, true)
        t.equal(done, true)
      })
    })

    function makeRequest () {
      client.request({ path: '/', method: 'GET' }, (err, data) => {
        t.error(err)
      })
      return client[kSize] <= client.pipelining
    }
  })
})

test('close should still reconnect', (t) => {
  t.plan(6)

  const server = createServer((req, res) => {
    res.end(req.url)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    t.ok(makeRequest())
    t.ok(!makeRequest())

    client.close((err) => {
      t.equal(err, null)
      t.equal(client.closed, true)
    })
    client.once('connect', () => {
      client[kSocket].destroy()
    })

    function makeRequest () {
      client.request({ path: '/', method: 'GET' }, (err, data) => {
        t.error(err)
        data.body.resume()
      })
      return client[kSize] <= client.pipelining
    }
  })
})

test('close should call callback once finished', (t) => {
  t.plan(6)

  const server = createServer((req, res) => {
    setImmediate(function () {
      res.end(req.url)
    })
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    t.ok(makeRequest())
    t.ok(!makeRequest())

    client.close((err) => {
      t.equal(err, null)
      t.equal(client.closed, true)
    })

    function makeRequest () {
      client.request({ path: '/', method: 'GET' }, (err, data) => {
        t.error(err)
        data.body.resume()
      })
      return client[kSize] <= client.pipelining
    }
  })
})

test('closed and destroyed errors', (t) => {
  t.plan(4)

  const client = new Client('http://localhost:4000')
  t.teardown(client.destroy.bind(client))

  client.request({ path: '/', method: 'GET' }, (err) => {
    t.ok(err)
  })
  client.close((err) => {
    t.error(err)
  })
  client.request({ path: '/', method: 'GET' }, (err) => {
    t.type(err, errors.ClientClosedError)
    client.destroy()
    client.request({ path: '/', method: 'GET' }, (err) => {
      t.type(err, errors.ClientDestroyedError)
    })
  })
})

test('close after and destroy should error', (t) => {
  t.plan(2)

  const client = new Client('http://localhost:4000')
  t.teardown(client.destroy.bind(client))

  client.destroy()
  client.close((err) => {
    t.type(err, errors.ClientDestroyedError)
  })
  client.close().catch((err) => {
    t.type(err, errors.ClientDestroyedError)
  })
})

test('close socket and reconnect after maxRequestsPerClient reached', (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    res.end(req.url)
  })

  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    let connections = 0
    server.on('connection', () => {
      connections++
    })
    const client = new Client(
      `http://localhost:${server.address().port}`,
      { maxRequestsPerClient: 2 }
    )
    t.teardown(client.destroy.bind(client))

    await t.resolves(makeRequest())
    await t.resolves(makeRequest())
    await t.resolves(makeRequest())
    await t.resolves(makeRequest())
    t.equal(connections, 2)

    function makeRequest () {
      return client.request({ path: '/', method: 'GET' })
    }
  })
})

test('close socket and reconnect after maxRequestsPerClient reached (async)', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.end(req.url)
  })

  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    let connections = 0
    server.on('connection', () => {
      connections++
    })
    const client = new Client(
      `http://localhost:${server.address().port}`,
      { maxRequestsPerClient: 2 }
    )
    t.teardown(client.destroy.bind(client))

    await t.resolves(
      Promise.all([
        makeRequest(),
        makeRequest(),
        makeRequest(),
        makeRequest()
      ])
    )
    t.equal(connections, 2)

    function makeRequest () {
      return client.request({ path: '/', method: 'GET' })
    }
  })
})

test('should not close socket when no maxRequestsPerClient is provided', (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    res.end(req.url)
  })

  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    let connections = 0
    server.on('connection', () => {
      connections++
    })
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    await t.resolves(makeRequest())
    await t.resolves(makeRequest())
    await t.resolves(makeRequest())
    await t.resolves(makeRequest())
    t.equal(connections, 1)

    function makeRequest () {
      return client.request({ path: '/', method: 'GET' })
    }
  })
})
