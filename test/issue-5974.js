'use strict'

const assert = require('node:assert')
const { AsyncLocalStorage } = require('node:async_hooks')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { test } = require('node:test')

const { Agent, interceptors } = require('..')

function entryGate (expected) {
  let entered = 0
  let open
  const opened = new Promise(resolve => { open = resolve })
  const interceptor = dispatch => {
    return (opts, handler) => {
      if (++entered === expected) {
        open()
      }
      return dispatch(opts, handler)
    }
  }
  return { opened, interceptor }
}

// https://github.com/nodejs/undici/issues/5974
test('concurrent requests on a cold cache share a single lookup', async (t) => {
  const server = createServer((req, res) => {
    res.end('ok')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  let lookupCount = 0
  const gate = entryGate(20)
  const dispatcher = new Agent().compose([
    interceptors.dns({
      maxTTL: 60000,
      lookup (origin, options, callback) {
        lookupCount++
        gate.opened.then(() => {
          callback(null, [{ address: '127.0.0.1', family: 4, ttl: 60000 }])
        })
      }
    }),
    gate.interceptor
  ])

  t.after(async () => {
    await dispatcher.destroy()
    await new Promise((resolve, reject) => {
      server.close(err => err ? reject(err) : resolve())
    })
  })

  const origin = `http://dns-cache-test.invalid:${server.address().port}`

  const burst = () => Promise.all(
    Array.from({ length: 20 }, () =>
      dispatcher.request({ origin, path: '/', method: 'GET' })
        .then(res => res.body.dump())
    )
  )

  await burst()
  assert.strictEqual(lookupCount, 1)

  await burst()
  assert.strictEqual(lookupCount, 1)
})

test('each concurrent request picks its own address from the shared lookup', async (t) => {
  const serverA = createServer((req, res) => {
    res.end('first')
  })
  const serverB = createServer((req, res) => {
    res.end('second')
  })
  serverA.listen(0, '127.0.0.1')
  serverB.listen(0, '127.0.0.1')
  await Promise.all([once(serverA, 'listening'), once(serverB, 'listening')])

  const portA = serverA.address().port
  const portB = serverB.address().port

  let lookupCount = 0
  const dispatchedPorts = []
  const gate = entryGate(4)
  const dispatcher = new Agent().compose([
    dispatch => {
      return (opts, handler) => {
        dispatchedPorts.push(new URL(opts.origin).port)
        return dispatch(opts, handler)
      }
    },
    interceptors.dns({
      maxTTL: 60000,
      lookup (origin, options, callback) {
        lookupCount++
        gate.opened.then(() => {
          callback(null, [
            { address: '127.0.0.1', port: portA, family: 4, ttl: 60000 },
            { address: '127.0.0.1', port: portB, family: 4, ttl: 60000 }
          ])
        })
      }
    }),
    gate.interceptor
  ])

  t.after(async () => {
    await dispatcher.destroy()
    serverA.close()
    serverB.close()
    await Promise.all([once(serverA, 'close'), once(serverB, 'close')])
  })

  await Promise.all(
    Array.from({ length: 4 }, () =>
      dispatcher.request({ origin: 'http://dns-pick-test.invalid', path: '/', method: 'GET' })
        .then(res => res.body.dump())
    )
  )

  assert.strictEqual(lookupCount, 1)
  assert.ok(dispatchedPorts.includes(String(portA)))
  assert.ok(dispatchedPorts.includes(String(portB)))
})

test('a failed lookup is shared by concurrent requests and cleared for retries', async (t) => {
  const server = createServer((req, res) => {
    res.end('ok')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  let lookupCount = 0
  let shouldFail = true
  const gate = entryGate(10)
  const dispatcher = new Agent().compose([
    interceptors.dns({
      lookup (origin, options, callback) {
        lookupCount++
        gate.opened.then(() => {
          if (shouldFail) {
            const error = new Error('getaddrinfo ENOTFOUND dns-retry-test.invalid')
            error.code = 'ENOTFOUND'
            callback(error)
          } else {
            callback(null, [{ address: '127.0.0.1', family: 4, ttl: 60000 }])
          }
        })
      }
    }),
    gate.interceptor
  ])

  t.after(async () => {
    await dispatcher.destroy()
    await new Promise((resolve, reject) => {
      server.close(err => err ? reject(err) : resolve())
    })
  })

  const origin = `http://dns-retry-test.invalid:${server.address().port}`

  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () =>
      dispatcher.request({ origin, path: '/', method: 'GET' })
        .then(res => res.body.dump())
    )
  )

  assert.strictEqual(lookupCount, 1)
  for (const result of results) {
    assert.strictEqual(result.status, 'rejected')
    assert.strictEqual(result.reason.code, 'ENOTFOUND')
  }

  shouldFail = false

  const response = await dispatcher.request({ origin, path: '/', method: 'GET' })
  await response.body.dump()

  assert.strictEqual(lookupCount, 2)
})

test('records that expire while a shared lookup is delivered are resolved again', async (t) => {
  const server = createServer((req, res) => {
    res.end('ok')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  let now = Date.now()
  t.mock.method(Date, 'now', () => now)

  let lookupCount = 0
  const gate = entryGate(5)
  const dispatcher = new Agent().compose([
    dispatch => {
      return (opts, handler) => {
        now += 10
        return dispatch(opts, handler)
      }
    },
    interceptors.dns({
      maxTTL: 5,
      lookup (origin, options, callback) {
        lookupCount++
        gate.opened.then(() => {
          callback(null, [{ address: '127.0.0.1', family: 4, ttl: 5 }])
        })
      }
    }),
    gate.interceptor
  ])

  t.after(async () => {
    await dispatcher.destroy()
    await new Promise((resolve, reject) => {
      server.close(err => err ? reject(err) : resolve())
    })
  })

  const origin = `http://dns-expiry-test.invalid:${server.address().port}`

  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () =>
      dispatcher.request({ origin, path: '/', method: 'GET' })
        .then(res => res.body.text())
    )
  )

  for (const result of results) {
    assert.deepStrictEqual(result, { status: 'fulfilled', value: 'ok' })
  }
  assert.ok(lookupCount > 1)
})

test('a lookup that throws does not block later requests for the same hostname', async (t) => {
  const server = createServer((req, res) => {
    res.end('ok')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  let lookupCount = 0
  const dispatcher = new Agent().compose(interceptors.dns({
    lookup (origin, options, callback) {
      lookupCount++
      if (lookupCount === 1) {
        throw new Error('resolver initialization failed')
      }
      queueMicrotask(() => {
        callback(null, [{ address: '127.0.0.1', family: 4, ttl: 60000 }])
      })
    }
  }))

  t.after(async () => {
    await dispatcher.destroy()
    await new Promise((resolve, reject) => {
      server.close(err => err ? reject(err) : resolve())
    })
  })

  const origin = `http://dns-throw-test.invalid:${server.address().port}`

  await assert.rejects(
    dispatcher.request({ origin, path: '/', method: 'GET' }),
    { message: 'resolver initialization failed' }
  )

  const response = await dispatcher.request({ origin, path: '/', method: 'GET' })
  assert.strictEqual(await response.body.text(), 'ok')
  assert.strictEqual(lookupCount, 2)
})

test('each concurrent request keeps its own async context across the shared lookup', async (t) => {
  const server = createServer((req, res) => {
    res.end('ok')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const als = new AsyncLocalStorage()
  const seen = []
  const gate = entryGate(5)
  const dispatcher = new Agent().compose([
    dispatch => {
      return (opts, handler) => {
        seen.push(als.getStore())
        return dispatch(opts, handler)
      }
    },
    interceptors.dns({
      maxTTL: 60000,
      lookup (origin, options, callback) {
        gate.opened.then(() => {
          callback(null, [{ address: '127.0.0.1', family: 4, ttl: 60000 }])
        })
      }
    }),
    gate.interceptor
  ])

  t.after(async () => {
    await dispatcher.destroy()
    await new Promise((resolve, reject) => {
      server.close(err => err ? reject(err) : resolve())
    })
  })

  const origin = `http://dns-context-test.invalid:${server.address().port}`

  await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      als.run(index, () =>
        dispatcher.request({ origin, path: '/', method: 'GET' })
          .then(res => res.body.dump())
      )
    )
  )

  assert.deepStrictEqual(seen.sort(), [0, 1, 2, 3, 4])
})
