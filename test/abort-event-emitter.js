'use strict'

const { test } = require('tap')
const EventEmitter = require('events')
const { Client, errors } = require('..')
const { createServer } = require('http')
const { createReadStream } = require('fs')

test('Abort before sending request (no body)', (t) => {
  t.plan(3)

  let count = 0
  const server = createServer((req, res) => {
    if (count === 1) {
      t.fail('The second request should never be executed')
    }
    count += 1
    res.end('hello')
  })

  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const ee = new EventEmitter()
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, response) => {
      t.error(err)
      const bufs = []
      response.body.on('data', (buf) => {
        bufs.push(buf)
      })
      response.body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })

    client.request({ path: '/', method: 'GET', signal: ee }, (err, response) => {
      t.ok(err instanceof errors.RequestAbortedError)
    })

    ee.emit('abort')
  })
})

test('Abort while waiting response (no body)', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.setHeader('content-type', 'text/plain')
      res.end('hello world')
    }, 200)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const ee = new EventEmitter()
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', signal: ee }, (err, response) => {
      t.ok(err instanceof errors.RequestAbortedError)
    })

    setTimeout(() => {
      ee.emit('abort')
    }, 100)
  })
})

test('Abort while waiting response (write headers started) (no body)', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    setTimeout(() => {
      res.end('hello world')
    }, 200)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const ee = new EventEmitter()
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', signal: ee }, (err, response) => {
      t.ok(err instanceof errors.RequestAbortedError)
    })

    setTimeout(() => {
      ee.emit('abort')
    }, 100)
  })
})

test('Abort while waiting response (write headers and write body started) (no body)', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.write('hello')
    setTimeout(() => {
      res.end('world')
    }, 200)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const ee = new EventEmitter()
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', signal: ee }, (err, response) => {
      t.error(err)
      response.body.on('error', err => {
        t.ok(err instanceof errors.RequestAbortedError)
      })
    })

    setTimeout(() => {
      ee.emit('abort')
    }, 100)
  })
})

function waitingWithBody (body, type) {
  test(`Abort while waiting response (with body ${type})`, (t) => {
    t.plan(1)

    const server = createServer((req, res) => {
      setTimeout(() => {
        res.setHeader('content-type', 'text/plain')
        res.end('hello world')
      }, 200)
    })
    t.teardown(server.close.bind(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      const ee = new EventEmitter()
      t.teardown(client.destroy.bind(client))

      client.request({ path: '/', method: 'POST', body, signal: ee }, (err, response) => {
        t.ok(err instanceof errors.RequestAbortedError)
      })

      setTimeout(() => {
        ee.emit('abort')
      }, 100)
    })
  })
}

waitingWithBody('hello', 'string')
waitingWithBody(createReadStream(__filename), 'stream')
waitingWithBody(new Uint8Array([42]), 'Uint8Array')

function writeHeadersStartedWithBody (body, type) {
  test(`Abort while waiting response (write headers started) (with body ${type})`, (t) => {
    t.plan(1)

    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      setTimeout(() => {
        res.end('hello world')
      }, 200)
    })
    t.teardown(server.close.bind(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      const ee = new EventEmitter()
      t.teardown(client.destroy.bind(client))

      client.request({ path: '/', method: 'POST', body, signal: ee }, (err, response) => {
        t.ok(err instanceof errors.RequestAbortedError)
      })

      setTimeout(() => {
        ee.emit('abort')
      }, 100)
    })
  })
}

writeHeadersStartedWithBody('hello', 'string')
writeHeadersStartedWithBody(createReadStream(__filename), 'stream')
writeHeadersStartedWithBody(new Uint8Array([42]), 'Uint8Array')

function writeBodyStartedWithBody (body, type) {
  test(`Abort while waiting response (write headers and write body started) (with body ${type})`, (t) => {
    t.plan(2)

    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.write('hello')
      setTimeout(() => {
        res.end('world')
      }, 200)
    })
    t.teardown(server.close.bind(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      const ee = new EventEmitter()
      t.teardown(client.destroy.bind(client))

      client.request({ path: '/', method: 'POST', body, signal: ee }, (err, response) => {
        t.error(err)
        response.body.on('error', err => {
          t.ok(err instanceof errors.RequestAbortedError)
        })
      })

      setTimeout(() => {
        ee.emit('abort')
      }, 100)
    })
  })
}

writeBodyStartedWithBody('hello', 'string')
writeBodyStartedWithBody(createReadStream(__filename), 'stream')
writeBodyStartedWithBody(new Uint8Array([42]), 'Uint8Array')
