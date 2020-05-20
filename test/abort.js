'use strict'

const { test } = require('tap')
const EventEmitter = require('events')
const { Client, errors } = require('..')
const { createServer } = require('http')
const { createReadStream } = require('fs')

test('Abort while sending request - event emitter (no body)', { skip: 'never ending' }, (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    t.fail('The requets should be aborted')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const ee = new EventEmitter()
    t.teardown(client.close.bind(client))

    client.request({ path: '/', method: 'GET', signal: ee }, (err, response) => {
      t.ok(err instanceof errors.RequestAbortedError)
    })

    ee.emit('abort')
  })
})

test('Abort while waiting response - event emitter (no body)', (t) => {
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
    t.teardown(client.close.bind(client))

    client.request({ path: '/', method: 'GET', signal: ee }, (err, response) => {
      t.ok(err instanceof errors.RequestAbortedError)
    })

    setTimeout(() => {
      ee.emit('abort')
    }, 100)
  })
})

test('Abort while waiting response - event emitter (write headers started) (no body)', (t) => {
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
    t.teardown(client.close.bind(client))

    client.request({ path: '/', method: 'GET', signal: ee }, (err, response) => {
      t.ok(err instanceof errors.RequestAbortedError)
    })

    setTimeout(() => {
      ee.emit('abort')
    }, 100)
  })
})

test('Abort while waiting response - event emitter (write headers and write body started) (no body)', (t) => {
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
    t.teardown(client.close.bind(client))

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
  test(`Abort while waiting response - event emitter (with body ${type})`, (t) => {
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
      t.teardown(client.close.bind(client))

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
  test(`Abort while waiting response - event emitter (write headers started) (with body ${type})`, (t) => {
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
      t.teardown(client.close.bind(client))

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
  test(`Abort while waiting response - event emitter (write headers and write body started) (with body ${type})`, (t) => {
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
      t.teardown(client.close.bind(client))

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
