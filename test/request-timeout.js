'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { resolve: pathResolve } = require('node:path')
const { test, after, beforeEach } = require('node:test')
const { createReadStream, writeFileSync, unlinkSync } = require('node:fs')
const { Client, errors } = require('..')
const { kConnect } = require('../lib/core/symbols')
const { createServer } = require('node:http')
const EventEmitter = require('node:events')
const FakeTimers = require('@sinonjs/fake-timers')
const { AbortController } = require('abort-controller')
const {
  pipeline,
  Readable,
  Writable,
  PassThrough
} = require('node:stream')
const {
  tick: fastTimersTick,
  reset: resetFastTimers
} = require('../lib/util/timers')

beforeEach(() => {
  resetFastTimers()
})

test('request timeout', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 2000)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, { headersTimeout: 500 })
    after(() => client.destroy())

    client.request({ path: '/', method: 'GET' }, (err, response) => {
      t.ok(err instanceof errors.HeadersTimeoutError)
    })
  })

  await t.completed
})

test('request timeout with readable body', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
  })
  after(() => server.close())

  const tempfile = pathResolve(__dirname, 'request-timeout.10mb.bin')
  writeFileSync(tempfile, Buffer.alloc(10 * 1024 * 1024))
  after(() => unlinkSync(tempfile))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, { headersTimeout: 1e3 })
    after(() => client.destroy())

    const body = createReadStream(tempfile)
    client.request({ path: '/', method: 'POST', body }, (err, response) => {
      t.ok(err instanceof errors.HeadersTimeoutError)
    })
  })

  await t.completed
})

test('body timeout', async (t) => {
  t = tspl(t, { plan: 2 })

  const clock = FakeTimers.install({
    shouldClearNativeTimers: true,
    toFake: ['setTimeout', 'clearTimeout']
  })
  after(() => clock.uninstall())

  const server = createServer((req, res) => {
    res.write('hello')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, { bodyTimeout: 50 })
    after(() => client.destroy())

    client.request({ path: '/', method: 'GET' }, (err, { body }) => {
      t.ifError(err)
      body.on('data', () => {
        clock.tick(100)
        fastTimersTick(100)
      }).on('error', (err) => {
        t.ok(err instanceof errors.BodyTimeoutError)
      })
    })

    clock.tick(50)
    fastTimersTick(50)
  })

  await t.completed
})

test('overridden request timeout', async (t) => {
  t = tspl(t, { plan: 1 })

  const clock = FakeTimers.install({
    shouldClearNativeTimers: true,
    toFake: ['setTimeout', 'clearTimeout']
  })
  after(() => clock.uninstall())

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 100)
    clock.tick(100)
    fastTimersTick(100)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, { headersTimeout: 500 })
    after(() => client.destroy())

    client.request({ path: '/', method: 'GET', headersTimeout: 50 }, (err, response) => {
      t.ok(err instanceof errors.HeadersTimeoutError)
    })

    clock.tick(50)
    fastTimersTick(50)
  })

  await t.completed
})

test('overridden body timeout', async (t) => {
  t = tspl(t, { plan: 2 })

  const clock = FakeTimers.install({
    shouldClearNativeTimers: true,
    toFake: ['setTimeout', 'clearTimeout']
  })
  after(() => clock.uninstall())

  const server = createServer((req, res) => {
    res.write('hello')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, { bodyTimeout: 500 })
    after(() => client.destroy())

    client.request({ path: '/', method: 'GET', bodyTimeout: 50 }, (err, { body }) => {
      t.ifError(err)
      body.on('data', () => {
        fastTimersTick()
        fastTimersTick()
      }).on('error', (err) => {
        t.ok(err instanceof errors.BodyTimeoutError)
      })
    })

    fastTimersTick()
    fastTimersTick()
  })

  await t.completed
})

test('With EE signal', async (t) => {
  t = tspl(t, { plan: 1 })

  const clock = FakeTimers.install({
    shouldClearNativeTimers: true,
    toFake: ['setTimeout', 'clearTimeout']
  })
  after(() => clock.uninstall())

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 100)
    clock.tick(100)
    fastTimersTick(100)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 50
    })
    const ee = new EventEmitter()
    after(() => client.destroy())

    client.request({ path: '/', method: 'GET', signal: ee }, (err, response) => {
      t.ok(err instanceof errors.HeadersTimeoutError)
    })

    clock.tick(50)
    fastTimersTick(50)
  })

  await t.completed
})

test('With abort-controller signal', async (t) => {
  t = tspl(t, { plan: 1 })

  const clock = FakeTimers.install({
    shouldClearNativeTimers: true,
    toFake: ['setTimeout', 'clearTimeout']
  })
  after(() => clock.uninstall())

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 100)
    clock.tick(100)
    fastTimersTick(100)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 50
    })
    const abortController = new AbortController()
    after(() => client.destroy())

    client.request({ path: '/', method: 'GET', signal: abortController.signal }, (err, response) => {
      t.ok(err instanceof errors.HeadersTimeoutError)
    })

    clock.tick(50)
    fastTimersTick(50)
  })

  await t.completed
})

test('Abort before timeout (EE)', async (t) => {
  t = tspl(t, { plan: 1 })

  const clock = FakeTimers.install({
    shouldClearNativeTimers: true,
    toFake: ['setTimeout', 'clearTimeout']
  })
  after(() => clock.uninstall())

  const ee = new EventEmitter()
  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 100)
    ee.emit('abort')
    clock.tick(50)
    fastTimersTick(50)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 50
    })
    after(() => client.destroy())

    client.request({ path: '/', method: 'GET', signal: ee }, (err, response) => {
      t.ok(err instanceof errors.RequestAbortedError)
      clock.tick(100)
      fastTimersTick(100)
    })
  })

  await t.completed
})

test('Abort before timeout (abort-controller)', async (t) => {
  t = tspl(t, { plan: 1 })

  const clock = FakeTimers.install({
    shouldClearNativeTimers: true,
    toFake: ['setTimeout', 'clearTimeout']
  })
  after(() => clock.uninstall())

  const abortController = new AbortController()
  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 100)
    abortController.abort()
    clock.tick(50)
    fastTimersTick(50)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 50
    })
    after(() => client.destroy())

    client.request({ path: '/', method: 'GET', signal: abortController.signal }, (err, response) => {
      t.ok(err instanceof errors.RequestAbortedError)
      clock.tick(100)
      fastTimersTick(100)
    })
  })

  await t.completed
})

test('Timeout with pipelining', async (t) => {
  t = tspl(t, { plan: 3 })

  const clock = FakeTimers.install({
    shouldClearNativeTimers: true,
    toFake: ['setTimeout', 'clearTimeout']
  })
  after(() => clock.uninstall())

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 100)
    clock.tick(50)
    fastTimersTick(50)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 10,
      headersTimeout: 50
    })
    after(() => client.destroy())

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

  await t.completed
})

test('Global option', async (t) => {
  t = tspl(t, { plan: 1 })

  const clock = FakeTimers.install({
    shouldClearNativeTimers: true,
    toFake: ['setTimeout', 'clearTimeout']
  })
  after(() => clock.uninstall())

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 100)
    clock.tick(100)
    fastTimersTick(100)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 50
    })
    after(() => client.destroy())

    client.request({ path: '/', method: 'GET' }, (err, response) => {
      t.ok(err instanceof errors.HeadersTimeoutError)
    })

    clock.tick(50)
    fastTimersTick(50)
  })

  await t.completed
})

test('Request options overrides global option', async (t) => {
  t = tspl(t, { plan: 1 })

  const clock = FakeTimers.install({
    shouldClearNativeTimers: true,
    toFake: ['setTimeout', 'clearTimeout']
  })
  after(() => clock.uninstall())

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 100)
    clock.tick(100)
    fastTimersTick(100)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 50
    })
    after(() => client.destroy())

    client.request({ path: '/', method: 'GET' }, (err, response) => {
      t.ok(err instanceof errors.HeadersTimeoutError)
    })

    clock.tick(50)
    fastTimersTick(50)
  })

  await t.completed
})

test('client.destroy should cancel the timeout', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 100
    })

    client.request({ path: '/', method: 'GET' }, (err, response) => {
      t.ok(err instanceof errors.ClientDestroyedError)
    })

    client.destroy(err => {
      t.ifError(err)
    })
  })

  await t.completed
})

test('client.close should wait for the timeout', async (t) => {
  t = tspl(t, { plan: 2 })

  const clock = FakeTimers.install({
    shouldClearNativeTimers: true,
    toFake: ['setTimeout', 'clearTimeout']
  })
  after(() => clock.uninstall())

  const server = createServer((req, res) => {
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 100
    })
    after(() => client.destroy())

    client.request({ path: '/', method: 'GET' }, (err, response) => {
      t.ok(err instanceof errors.HeadersTimeoutError)
    })

    client.close((err) => {
      t.ifError(err)
    })

    client.on('connect', () => {
      process.nextTick(() => {
        clock.tick(100)
        fastTimersTick(100)
      })
    })
  })

  await t.completed
})

test('Validation', async (t) => {
  t = tspl(t, { plan: 4 })

  try {
    const client = new Client('http://localhost:3000', {
      headersTimeout: 'foobar'
    })
    after(() => client.destroy())
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
  }

  try {
    const client = new Client('http://localhost:3000', {
      headersTimeout: -1
    })
    after(() => client.destroy())
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
  }

  try {
    const client = new Client('http://localhost:3000', {
      bodyTimeout: 'foobar'
    })
    after(() => client.destroy())
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
  }

  try {
    const client = new Client('http://localhost:3000', {
      bodyTimeout: -1
    })
    after(() => client.destroy())
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
  }

  await t.completed
})

test('Disable request timeout', async (t) => {
  t = tspl(t, { plan: 2 })

  const clock = FakeTimers.install({
    shouldClearNativeTimers: true,
    toFake: ['setTimeout', 'clearTimeout']
  })
  after(() => clock.uninstall())

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 32e3)
    clock.tick(33e3)
    fastTimersTick(33e3)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 0,
      connectTimeout: 0
    })
    after(() => client.destroy())

    client.request({ path: '/', method: 'GET' }, (err, response) => {
      t.ifError(err)
      const bufs = []
      response.body.on('data', (buf) => {
        bufs.push(buf)
      })
      response.body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })

    clock.tick(31e3)
    fastTimersTick(31e3)
  })

  await t.completed
})

test('Disable request timeout for a single request', async (t) => {
  t = tspl(t, { plan: 2 })

  const clock = FakeTimers.install({
    shouldClearNativeTimers: true,
    toFake: ['setTimeout', 'clearTimeout']
  })
  after(() => clock.uninstall())

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 32e3)
    clock.tick(33e3)
    fastTimersTick(33e3)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 0,
      connectTimeout: 0
    })
    after(() => client.destroy())

    client.request({ path: '/', method: 'GET' }, (err, response) => {
      t.ifError(err)
      const bufs = []
      response.body.on('data', (buf) => {
        bufs.push(buf)
      })
      response.body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })

    clock.tick(31e3)
    fastTimersTick(31e3)
  })

  await t.completed
})

test('stream timeout', async (t) => {
  t = tspl(t, { plan: 1 })

  const clock = FakeTimers.install({
    shouldClearNativeTimers: true,
    toFake: ['setTimeout', 'clearTimeout']
  })
  after(() => clock.uninstall())

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 301e3)
    clock.tick(301e3)
    fastTimersTick(301e3)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, { connectTimeout: 0 })
    after(() => client.destroy())

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

  await t.completed
})

test('stream custom timeout', async (t) => {
  t = tspl(t, { plan: 1 })

  const clock = FakeTimers.install({
    shouldClearNativeTimers: true,
    toFake: ['setTimeout', 'clearTimeout']
  })
  after(() => clock.uninstall())

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 31e3)
    clock.tick(31e3)
    fastTimersTick(31e3)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 30e3
    })
    after(() => client.destroy())

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

  await t.completed
})

test('pipeline timeout', async (t) => {
  t = tspl(t, { plan: 1 })

  const clock = FakeTimers.install({
    shouldClearNativeTimers: true,
    toFake: ['setTimeout', 'clearTimeout']
  })
  after(() => clock.uninstall())

  const server = createServer((req, res) => {
    setTimeout(() => {
      req.pipe(res)
    }, 301e3)
    clock.tick(301e3)
    fastTimersTick(301e3)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

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

  await t.completed
})

test('pipeline timeout', async (t) => {
  t = tspl(t, { plan: 1 })

  const clock = FakeTimers.install({
    shouldClearNativeTimers: true,
    toFake: ['setTimeout', 'clearTimeout']
  })
  after(() => clock.uninstall())

  const server = createServer((req, res) => {
    setTimeout(() => {
      req.pipe(res)
    }, 31e3)
    clock.tick(31e3)
    fastTimersTick(31e3)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 30e3
    })
    after(() => client.destroy())

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

  await t.completed
})

test('client.close should not deadlock', async (t) => {
  t = tspl(t, { plan: 2 })

  const clock = FakeTimers.install({
    shouldClearNativeTimers: true,
    toFake: ['setTimeout', 'clearTimeout']
  })
  after(() => clock.uninstall())

  const server = createServer((req, res) => {
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 200,
      headersTimeout: 100
    })
    after(() => client.destroy())

    client[kConnect](() => {
      client.request({
        path: '/',
        method: 'GET'
      }, (err, response) => {
        t.ok(err instanceof errors.HeadersTimeoutError)
      })

      client.close((err) => {
        t.ifError(err)
      })

      clock.tick(100)
      fastTimersTick(100)
    })
  })
  await t.completed
})
