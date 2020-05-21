'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('http')
const EventEmitter = require('events')
const FakeTimers = require('@sinonjs/fake-timers')
const { AbortController } = require('abort-controller')

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
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', requestTimeout: 50 }, (err, response) => {
      t.ok(err instanceof errors.RequestTimeoutError)
    })

    clock.tick(50)
  })
})

test('Subsequent request starves', (t) => {
  t.plan(2)

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
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, response) => {
      t.error(err)
    })

    client.request({ path: '/', method: 'GET', requestTimeout: 50 }, (err, response) => {
      t.ok(err instanceof errors.RequestTimeoutError)
      clock.tick(100)
    })
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
    const client = new Client(`http://localhost:${server.address().port}`)
    const ee = new EventEmitter()
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', requestTimeout: 50, signal: ee }, (err, response) => {
      t.ok(err instanceof errors.RequestTimeoutError)
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
    const client = new Client(`http://localhost:${server.address().port}`)
    const abortController = new AbortController()
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', requestTimeout: 50, signal: abortController.signal }, (err, response) => {
      t.ok(err instanceof errors.RequestTimeoutError)
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
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', requestTimeout: 50, signal: ee }, (err, response) => {
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
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', requestTimeout: 50, signal: abortController.signal }, (err, response) => {
      t.ok(err instanceof errors.RequestAbortedError)
      clock.tick(100)
    })
  })
})

test('Abort after timeout (EE)', (t) => {
  t.plan(1)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const ee = new EventEmitter()
  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 100)
    clock.tick(50)
    ee.emit('abort')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', requestTimeout: 50, signal: ee }, (err, response) => {
      t.ok(err instanceof errors.RequestTimeoutError)
      clock.tick(100)
    })
  })
})

test('Abort after timeout (abort-controller)', (t) => {
  t.plan(1)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const abortController = new AbortController()
  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 100)
    clock.tick(50)
    abortController.abort()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', requestTimeout: 50, signal: abortController.signal }, (err, response) => {
      t.ok(err instanceof errors.RequestTimeoutError)
      clock.tick(100)
    })
  })
})

test('If a request starves, the server should never receive the request', (t) => {
  t.plan(4)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  let count = 0
  const server = createServer((req, res) => {
    count += 1
    t.is(count, 1)
    setTimeout(() => {
      res.end('hello')
    }, 100)
    clock.tick(50)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', requestTimeout: 50 }, (err, response) => {
      t.ok(err instanceof errors.RequestTimeoutError)
    })

    client.request({ path: '/', method: 'GET', requestTimeout: 50 }, (err, response) => {
      t.ok(err instanceof errors.RequestTimeoutError)
    })

    client.request({ path: '/', method: 'GET', requestTimeout: 50 }, (err, response) => {
      t.ok(err instanceof errors.RequestTimeoutError)
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
    const client = new Client(`http://localhost:${server.address().port}`, { pipelining: 10 })
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', requestTimeout: 50 }, (err, response) => {
      t.ok(err instanceof errors.RequestTimeoutError)
    })

    client.request({ path: '/', method: 'GET', requestTimeout: 50 }, (err, response) => {
      t.ok(err instanceof errors.RequestTimeoutError)
    })

    client.request({ path: '/', method: 'GET', requestTimeout: 50 }, (err, response) => {
      t.ok(err instanceof errors.RequestTimeoutError)
    })
  })
})
