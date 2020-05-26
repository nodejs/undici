'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('http')
const { Readable } = require('stream')

test('aborted response errors', (t) => {
  t.plan(3)

  const server = createServer()
  server.once('request', (req, res) => {
    // TODO: res.write will cause body to emit 'error' twice
    // due to bug in readable-stream.
    res.end('asd')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      body.destroy()
      body
        .on('error', err => {
          t.ok(err instanceof errors.RequestAbortedError)
        })
        .on('close', () => {
          t.pass()
        })
    })
  })
})

test('aborted GET maxAbortedPayload reset', (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    res.end(Buffer.alloc(1e6 - 1))
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2,
      maxAbortedPayload: 1e6
    })
    t.tearDown(client.close.bind(client))

    client.on('disconnect', () => {
      t.fail()
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.once('data', (chunk) => {
        body.destroy()
      }).once('error', (err) => {
        t.ok(err)
      }).on('end', () => {
        t.fail()
      })
    })

    // Make sure read counter is reset.
    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.once('data', (chunk) => {
        body.destroy()
      }).on('error', (err) => {
        t.ok(err)
      }).on('end', () => {
        t.fail()
      })
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.resume()
    })
  })
})

test('aborted GET maxAbortedPayload', (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    res.end(Buffer.alloc(100000 + 1, 'a'))
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1,
      maxAbortedPayload: 100000
    })
    t.tearDown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.once('data', () => {
        body.destroy()
      }).once('error', (err) => {
        t.ok(err)
      })
        // old Readable emits error twice
        .on('error', () => {})
    })

    client.on('disconnect', () => {
      t.pass()
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.resume()
    })

    client.close((err) => {
      t.error(err)
    })
  })
})

test('aborted GET maxAbortedPayload less than HWM', (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    res.end(Buffer.alloc(4 + 1, 'a'))
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1,
      maxAbortedPayload: 4
    })
    t.tearDown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.once('data', () => {
        body.destroy()
      }).once('error', (err) => {
        t.ok(err)
      })
        // old Readable emits error twice
        .on('error', () => {})
    })

    client.on('disconnect', () => {
      t.fail()
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.resume()
    })

    client.close((err) => {
      t.error(err)
    })
  })
})

test('aborted req', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.end(Buffer.alloc(4 + 1, 'a'))
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.request({
      method: 'POST',
      path: '/',
      body: new Readable({
        read () {
          setImmediate(() => {
            this.destroy()
          })
        }
      })
    }, (err) => {
      t.ok(err instanceof errors.RequestAbortedError)
    })
  })
})
