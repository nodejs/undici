'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { kConnect } = require('../lib/core/symbols')
const { createServer } = require('http')
const EventEmitter = require('events')
const FakeTimers = require('@sinonjs/fake-timers')
const { AbortController } = require('abort-controller')
const {
  pipeline,
  Readable,
  Writable,
  PassThrough
} = require('stream')

test('request timeout', (t) => {
  t.plan(1)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 100)
    clock.tick(100)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, { headersTimeout: 50 })
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, response) => {
      t.ok(err instanceof errors.HeadersTimeoutError)
    })

    clock.tick(50)
  })
})

test('body timeout', (t) => {
  t.plan(2)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const server = createServer((req, res) => {
    res.write('hello')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, { bodyTimeout: 50 })
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, { body }) => {
      t.error(err)
      body.on('data', () => {
        clock.tick(100)
      }).on('error', (err) => {
        t.ok(err instanceof errors.BodyTimeoutError)
      })
    })

    clock.tick(50)
  })
})

test('With EE signal', (t) => {
  t.plan(1)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 100)
    clock.tick(100)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 50
    })
    const ee = new EventEmitter()
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', signal: ee }, (err, response) => {
      t.ok(err instanceof errors.HeadersTimeoutError)
    })

    clock.tick(50)
  })
})

test('With abort-controller signal', (t) => {
  t.plan(1)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 100)
    clock.tick(100)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 50
    })
    const abortController = new AbortController()
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', signal: abortController.signal }, (err, response) => {
      t.ok(err instanceof errors.HeadersTimeoutError)
    })

    clock.tick(50)
  })
})

test('Abort before timeout (EE)', (t) => {
  t.plan(1)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const ee = new EventEmitter()
  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 100)
    ee.emit('abort')
    clock.tick(50)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 50
    })
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', signal: ee }, (err, response) => {
      t.ok(err instanceof errors.RequestAbortedError)
      clock.tick(100)
    })
  })
})

test('Abort before timeout (abort-controller)', (t) => {
  t.plan(1)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const abortController = new AbortController()
  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 100)
    abortController.abort()
    clock.tick(50)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 50
    })
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', signal: abortController.signal }, (err, response) => {
      t.ok(err instanceof errors.RequestAbortedError)
      clock.tick(100)
    })
  })
})

test('Timeout with pipelining', (t) => {
  t.plan(3)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 100)
    clock.tick(50)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 10,
      headersTimeout: 50
    })
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, response) => {
      t.ok(err instanceof errors.HeadersTimeoutError)
    })

    client.request({ path: '/', method: 'GET' }, (err, response) => {
      t.ok(err instanceof errors.HeadersTimeoutError)
    })

    client.request({ path: '/', method: 'GET' }, (err, response) => {
      t.ok(err instanceof errors.HeadersTimeoutError)
    })
  })
})

test('Global option', (t) => {
  t.plan(1)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 100)
    clock.tick(100)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 50
    })
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, response) => {
      t.ok(err instanceof errors.HeadersTimeoutError)
    })

    clock.tick(50)
  })
})

test('Request options overrides global option', (t) => {
  t.plan(1)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 100)
    clock.tick(100)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 50
    })
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, response) => {
      t.ok(err instanceof errors.HeadersTimeoutError)
    })

    clock.tick(50)
  })
})

test('client.destroy should cancel the timeout', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 100
    })

    client.request({ path: '/', method: 'GET' }, (err, response) => {
      t.ok(err instanceof errors.ClientDestroyedError)
    })

    client.destroy(err => {
      t.error(err)
    })
  })
})

test('client.close should wait for the timeout', (t) => {
  t.plan(2)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const server = createServer((req, res) => {
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 100
    })
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, response) => {
      t.ok(err instanceof errors.HeadersTimeoutError)
    })

    client.close((err) => {
      t.error(err)
    })

    client.on('connect', () => {
      process.nextTick(() => {
        clock.tick(100)
      })
    })
  })
})

test('Validation', (t) => {
  t.plan(4)

  try {
    const client = new Client('http://localhost:3000', {
      headersTimeout: 'foobar'
    })
    t.teardown(client.destroy.bind(client))
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
  }

  try {
    const client = new Client('http://localhost:3000', {
      headersTimeout: -1
    })
    t.teardown(client.destroy.bind(client))
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
  }

  try {
    const client = new Client('http://localhost:3000', {
      bodyTimeout: 'foobar'
    })
    t.teardown(client.destroy.bind(client))
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
  }

  try {
    const client = new Client('http://localhost:3000', {
      bodyTimeout: -1
    })
    t.teardown(client.destroy.bind(client))
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
  }
})

test('Disable request timeout', (t) => {
  t.plan(2)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 32e3)
    clock.tick(33e3)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 0
    })
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

    clock.tick(31e3)
  })
})

test('Disable request timeout for a single request', (t) => {
  t.plan(2)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 32e3)
    clock.tick(33e3)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 0
    })
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

    clock.tick(31e3)
  })
})

test('stream timeout', (t) => {
  t.plan(1)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 31e3)
    clock.tick(31e3)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.stream({
      path: '/',
      method: 'GET',
      opaque: new PassThrough()
    }, (result) => {
      t.fail('Should not be called')
    }, (err) => {
      t.ok(err instanceof errors.HeadersTimeoutError)
    })
  })
})

test('stream custom timeout', (t) => {
  t.plan(1)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 31e3)
    clock.tick(31e3)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 30e3
    })
    t.teardown(client.destroy.bind(client))

    client.stream({
      path: '/',
      method: 'GET',
      opaque: new PassThrough()
    }, (result) => {
      t.fail('Should not be called')
    }, (err) => {
      t.ok(err instanceof errors.HeadersTimeoutError)
    })
  })
})

test('pipeline timeout', (t) => {
  t.plan(1)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const server = createServer((req, res) => {
    setTimeout(() => {
      req.pipe(res)
    }, 31e3)
    clock.tick(31e3)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const buf = Buffer.alloc(1e6).toString()
    pipeline(
      new Readable({
        read () {
          this.push(buf)
          this.push(null)
        }
      }),
      client.pipeline({
        path: '/',
        method: 'PUT'
      }, (result) => {
        t.fail('Should not be called')
      }, (e) => {
        t.fail('Should not be called')
      }),
      new Writable({
        write (chunk, encoding, callback) {
          callback()
        },
        final (callback) {
          callback()
        }
      }),
      (err) => {
        t.ok(err instanceof errors.HeadersTimeoutError)
      }
    )
  })
})

test('pipeline timeout', (t) => {
  t.plan(1)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const server = createServer((req, res) => {
    setTimeout(() => {
      req.pipe(res)
    }, 31e3)
    clock.tick(31e3)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 30e3
    })
    t.teardown(client.destroy.bind(client))

    const buf = Buffer.alloc(1e6).toString()
    pipeline(
      new Readable({
        read () {
          this.push(buf)
          this.push(null)
        }
      }),
      client.pipeline({
        path: '/',
        method: 'PUT'
      }, (result) => {
        t.fail('Should not be called')
      }, (e) => {
        t.fail('Should not be called')
      }),
      new Writable({
        write (chunk, encoding, callback) {
          callback()
        },
        final (callback) {
          callback()
        }
      }),
      (err) => {
        t.ok(err instanceof errors.HeadersTimeoutError)
      }
    )
  })
})

test('client.close should not deadlock', (t) => {
  t.plan(2)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const server = createServer((req, res) => {
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 200,
      headersTimeout: 100
    })
    t.teardown(client.destroy.bind(client))

    client[kConnect](() => {
      client.request({
        path: '/',
        method: 'GET'
      }, (err, response) => {
        t.ok(err instanceof errors.HeadersTimeoutError)
      })

      client.close((err) => {
        t.error(err)
      })

      clock.tick(100)
    })
  })
})
