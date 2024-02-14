'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Client, errors } = require('..')
const { createServer } = require('node:http')
const { kSocket, kSize } = require('../lib/core/symbols')

test('close waits for queued requests to finish', async (t) => {
  t = tspl(t, { plan: 16 })

  const server = createServer()

  server.on('request', (req, res) => {
    t.ok(true, 'request received')
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

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
    t.ifError(err)
    t.strictEqual(statusCode, 200)
    const bufs = []
    body.on('data', (buf) => {
      bufs.push(buf)
    })
    body.on('end', () => {
      t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
    })
  }

  await t.completed
})

test('destroy invoked all pending callbacks', async (t) => {
  t = tspl(t, { plan: 4 })

  const server = createServer()

  server.on('request', (req, res) => {
    res.write('hello')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })
    after(() => client.destroy())

    client.request({ path: '/', method: 'GET' }, (err, data) => {
      t.ifError(err)
      data.body.on('error', (err) => {
        t.ok(err)
      }).resume()
      client.destroy()
    })
    client.request({ path: '/', method: 'GET' }, (err) => {
      t.ok(err instanceof errors.ClientDestroyedError)
    })
    client.request({ path: '/', method: 'GET' }, (err) => {
      t.ok(err instanceof errors.ClientDestroyedError)
    })
  })

  await t.completed
})

test('destroy invoked all pending callbacks ticked', async (t) => {
  t = tspl(t, { plan: 4 })

  const server = createServer()

  server.on('request', (req, res) => {
    res.write('hello')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })
    after(() => client.destroy())

    let ticked = false
    client.request({ path: '/', method: 'GET' }, (err) => {
      t.strictEqual(ticked, true)
      t.ok(err instanceof errors.ClientDestroyedError)
    })
    client.request({ path: '/', method: 'GET' }, (err) => {
      t.strictEqual(ticked, true)
      t.ok(err instanceof errors.ClientDestroyedError)
    })
    client.destroy()
    ticked = true
  })

  await t.completed
})

test('close waits until socket is destroyed', async (t) => {
  t = tspl(t, { plan: 4 })

  const server = createServer((req, res) => {
    res.end(req.url)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    makeRequest()

    client.once('connect', () => {
      let done = false
      client[kSocket].on('close', () => {
        done = true
      })
      client.close((err) => {
        t.ifError(err)
        t.strictEqual(client.closed, true)
        t.strictEqual(done, true)
      })
    })

    function makeRequest () {
      client.request({ path: '/', method: 'GET' }, (err, data) => {
        t.ifError(err)
      })
      return client[kSize] <= client.pipelining
    }
  })

  await t.completed
})

test('close should still reconnect', async (t) => {
  t = tspl(t, { plan: 6 })

  const server = createServer((req, res) => {
    res.end(req.url)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    t.ok(makeRequest())
    t.ok(!makeRequest())

    client.close((err) => {
      t.ifError(err)
      t.strictEqual(client.closed, true)
    })
    client.once('connect', () => {
      client[kSocket].destroy()
    })

    function makeRequest () {
      client.request({ path: '/', method: 'GET' }, (err, data) => {
        t.ifError(err)
        data.body.resume()
      })
      return client[kSize] <= client.pipelining
    }
  })

  await t.completed
})

test('close should call callback once finished', async (t) => {
  t = tspl(t, { plan: 6 })

  const server = createServer((req, res) => {
    setImmediate(function () {
      res.end(req.url)
    })
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    t.ok(makeRequest())
    t.ok(!makeRequest())

    client.close((err) => {
      t.ifError(err)
      t.strictEqual(client.closed, true)
    })

    function makeRequest () {
      client.request({ path: '/', method: 'GET' }, (err, data) => {
        t.ifError(err)
        data.body.resume()
      })
      return client[kSize] <= client.pipelining
    }
  })

  await t.completed
})

test('closed and destroyed errors', async (t) => {
  t = tspl(t, { plan: 4 })

  const client = new Client('http://localhost:4000')
  after(() => client.destroy())

  client.request({ path: '/', method: 'GET' }, (err) => {
    t.ok(err)
  })
  client.close((err) => {
    t.ifError(err)
  })
  client.request({ path: '/', method: 'GET' }, (err) => {
    t.ok(err instanceof errors.ClientClosedError)
    client.destroy()
    client.request({ path: '/', method: 'GET' }, (err) => {
      t.ok(err instanceof errors.ClientDestroyedError)
    })
  })

  await t.completed
})

test('close after and destroy should error', async (t) => {
  t = tspl(t, { plan: 2 })

  const client = new Client('http://localhost:4000')
  after(() => client.destroy())

  client.destroy()
  client.close((err) => {
    t.ok(err instanceof errors.ClientDestroyedError)
  })
  client.close().catch((err) => {
    t.ok(err instanceof errors.ClientDestroyedError)
  })

  await t.completed
})

test('close socket and reconnect after maxRequestsPerClient reached', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.end(req.url)
  })

  after(() => server.close())

  server.listen(0, async () => {
    let connections = 0
    server.on('connection', () => {
      connections++
    })
    const client = new Client(
      `http://localhost:${server.address().port}`,
      { maxRequestsPerClient: 2 }
    )
    after(() => client.destroy())

    await makeRequest()
    await makeRequest()
    await makeRequest()
    await makeRequest()
    t.strictEqual(connections, 2)

    function makeRequest () {
      return client.request({ path: '/', method: 'GET' })
    }
  })

  await t.completed
})

test('close socket and reconnect after maxRequestsPerClient reached (async)', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.end(req.url)
  })

  after(() => server.close())

  server.listen(0, async () => {
    let connections = 0
    server.on('connection', () => {
      connections++
    })
    const client = new Client(
      `http://localhost:${server.address().port}`,
      { maxRequestsPerClient: 2 }
    )
    after(() => client.destroy())

    await Promise.all([
      makeRequest(),
      makeRequest(),
      makeRequest(),
      makeRequest()
    ])
    t.strictEqual(connections, 2)

    function makeRequest () {
      return client.request({ path: '/', method: 'GET' })
    }
  })

  await t.completed
})

test('should not close socket when no maxRequestsPerClient is provided', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.end(req.url)
  })

  after(() => server.close())

  server.listen(0, async () => {
    let connections = 0
    server.on('connection', () => {
      connections++
    })
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    await makeRequest()
    await makeRequest()
    await makeRequest()
    await makeRequest()
    t.strictEqual(connections, 1)

    function makeRequest () {
      return client.request({ path: '/', method: 'GET' })
    }
  })

  await t.completed
})
