'use strict'

const FakeTimers = require('@sinonjs/fake-timers')
const { test, after } = require('node:test')
const { isIP } = require('node:net')
const { lookup } = require('node:dns')
const { createServer } = require('node:http')
const { createServer: createSecureServer } = require('node:https')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { interceptors, Agent } = require('../..')
const { dns } = interceptors

test('Should validate options', t => {
  t.plan(10)

  t.assert.throws(() => dns({ dualStack: 'true' }), { code: 'UND_ERR_INVALID_ARG' })
  t.assert.throws(() => dns({ dualStack: 0 }), { code: 'UND_ERR_INVALID_ARG' })
  t.assert.throws(() => dns({ affinity: '4' }), { code: 'UND_ERR_INVALID_ARG' })
  t.assert.throws(() => dns({ affinity: 7 }), { code: 'UND_ERR_INVALID_ARG' })
  t.assert.throws(() => dns({ maxTTL: -1 }), { code: 'UND_ERR_INVALID_ARG' })
  t.assert.throws(() => dns({ maxTTL: '0' }), { code: 'UND_ERR_INVALID_ARG' })
  t.assert.throws(() => dns({ maxItems: '1' }), { code: 'UND_ERR_INVALID_ARG' })
  t.assert.throws(() => dns({ maxItems: -1 }), { code: 'UND_ERR_INVALID_ARG' })
  t.assert.throws(() => dns({ lookup: {} }), { code: 'UND_ERR_INVALID_ARG' })
  t.assert.throws(() => dns({ pick: [] }), { code: 'UND_ERR_INVALID_ARG' })
})

test('Should automatically resolve IPs (dual stack)', async t => {
  t.plan(8)

  const hostsnames = []
  const server = createServer({ joinDuplicateHeaders: true })
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world!')
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Agent().compose([
    dispatch => {
      return (opts, handler) => {
        const url = new URL(opts.origin)

        t.assert.strictEqual(hostsnames.includes(url.hostname), false)

        if (url.hostname[0] === '[') {
          // [::1] -> ::1
          t.assert.strictEqual(isIP(url.hostname.slice(1, 4)), 6)
        } else {
          t.assert.strictEqual(isIP(url.hostname), 4)
        }

        hostsnames.push(url.hostname)

        return dispatch(opts, handler)
      }
    },
    dns({
      lookup: (_origin, _opts, cb) => {
        cb(null, [
          {
            address: '::1',
            family: 6
          },
          {
            address: '127.0.0.1',
            family: 4
          }
        ])
      }
    })
  ])

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(await response.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response2.statusCode, 200)
  t.assert.strictEqual(await response2.body.text(), 'hello world!')
})

test('Should respect DNS origin hostname for SNI on TLS', async t => {
  t.plan(12)

  const hostsnames = []
  const server = createSecureServer(pem)
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server.on('request', (req, res) => {
    t.assert.strictEqual(req.headers.host, `localhost:${server.address().port}`)
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world!')
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Agent({
    connect: {
      rejectUnauthorized: false
    }
  }).compose([
    dispatch => {
      return (opts, handler) => {
        const url = new URL(opts.origin)

        t.assert.strictEqual(hostsnames.includes(url.hostname), false)
        t.assert.strictEqual(opts.servername, 'localhost')

        if (url.hostname[0] === '[') {
          // [::1] -> ::1
          t.assert.strictEqual(isIP(url.hostname.slice(1, 4)), 6)
        } else {
          t.assert.strictEqual(isIP(url.hostname), 4)
        }

        hostsnames.push(url.hostname)

        return dispatch(opts, handler)
      }
    },
    dns({
      lookup: (_origin, _opts, cb) => {
        cb(null, [
          {
            address: '::1',
            family: 6
          },
          {
            address: '127.0.0.1',
            family: 4
          }
        ])
      }
    })
  ])

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request({
    ...requestOptions,
    origin: `https://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(await response.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: `https://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response2.statusCode, 200)
  t.assert.strictEqual(await response2.body.text(), 'hello world!')
})

test('Should recover on network errors (dual stack - 4)', async t => {
  t.plan(7)

  let counter = 0
  const server = createServer({ joinDuplicateHeaders: true })
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world!')
  })

  server.listen(0, '::1')

  await once(server, 'listening')

  const client = new Agent().compose([
    dispatch => {
      return (opts, handler) => {
        ++counter
        const url = new URL(opts.origin)

        switch (counter) {
          case 1:
            t.assert.strictEqual(isIP(url.hostname), 4)
            break

          case 2:
            // [::1] -> ::1
            t.assert.strictEqual(isIP(url.hostname.slice(1, 4)), 6)
            break

          case 3:
            // [::1] -> ::1
            t.assert.strictEqual(isIP(url.hostname.slice(1, 4)), 6)
            break
          default:
            t.assert.fail('should not reach this point')
        }

        return dispatch(opts, handler)
      }
    },
    dns({
      lookup: (_origin, _opts, cb) => {
        cb(null, [
          {
            address: '::1',
            family: 6
          },
          {
            address: '127.0.0.1',
            family: 4
          }
        ])
      }
    })
  ])

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(await response.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response2.statusCode, 200)
  t.assert.strictEqual(await response2.body.text(), 'hello world!')
})

test('Should recover on network errors (dual stack - 6)', async t => {
  t.plan(7)

  let counter = 0
  const server = createServer({ joinDuplicateHeaders: true })
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world!')
  })

  server.listen(0, '127.0.0.1')

  await once(server, 'listening')

  const client = new Agent().compose([
    dispatch => {
      return (opts, handler) => {
        ++counter
        const url = new URL(opts.origin)

        switch (counter) {
          case 1:
            t.assert.strictEqual(isIP(url.hostname), 4)
            break

          case 2:
            // [::1] -> ::1
            t.assert.strictEqual(isIP(url.hostname.slice(1, 4)), 6)
            break

          case 3:
            // [::1] -> ::1
            t.assert.strictEqual(isIP(url.hostname), 4)
            break
          default:
            t.assert.fail('should not reach this point')
        }

        return dispatch(opts, handler)
      }
    },
    dns({
      lookup: (_origin, _opts, cb) => {
        cb(null, [
          {
            address: '::1',
            family: 6
          },
          {
            address: '127.0.0.1',
            family: 4
          }
        ])
      }
    })
  ])

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(await response.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response2.statusCode, 200)
  t.assert.strictEqual(await response2.body.text(), 'hello world!')
})

test('Should throw when on dual-stack disabled (4)', async t => {
  t.plan(2)

  let counter = 0
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  const client = new Agent().compose([
    dispatch => {
      return (opts, handler) => {
        ++counter
        const url = new URL(opts.origin)

        switch (counter) {
          case 1:
            t.assert.strictEqual(isIP(url.hostname), 4)
            break

          default:
            t.assert.fail('should not reach this point')
        }

        return dispatch(opts, handler)
      }
    },
    dns({ dualStack: false, affinity: 4 })
  ])

  const promise = client.request({
    ...requestOptions,
    origin: 'http://localhost:1234'
  })

  await t.assert.rejects(promise, 'ECONNREFUSED')
})

test('Should throw when on dual-stack disabled (6)', async t => {
  t.plan(2)

  let counter = 0
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  const client = new Agent().compose([
    dispatch => {
      return (opts, handler) => {
        ++counter
        const url = new URL(opts.origin)

        switch (counter) {
          case 1:
            // [::1] -> ::1
            t.assert.strictEqual(isIP(url.hostname.slice(1, 4)), 6)
            break

          default:
            t.assert.fail('should not reach this point')
        }

        return dispatch(opts, handler)
      }
    },
    dns({ dualStack: false, affinity: 6 })
  ])

  const promise = client.request({
    ...requestOptions,
    origin: 'http://localhost:9999'
  })

  await t.assert.rejects(promise, 'ECONNREFUSED')
})

test('Should automatically resolve IPs (dual stack disabled - 4)', async t => {
  t.plan(6)

  let counter = 0
  const server = createServer({ joinDuplicateHeaders: true })
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world!')
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Agent().compose([
    dispatch => {
      return (opts, handler) => {
        ++counter
        const url = new URL(opts.origin)

        switch (counter) {
          case 1:
            t.assert.strictEqual(isIP(url.hostname), 4)
            break

          case 2:
            // [::1] -> ::1
            t.assert.strictEqual(isIP(url.hostname), 4)
            break
          default:
            t.assert.fail('should not reach this point')
        }

        return dispatch(opts, handler)
      }
    },
    dns({ dualStack: false })
  ])

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(await response.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response2.statusCode, 200)
  t.assert.strictEqual(await response2.body.text(), 'hello world!')
})

test('Should automatically resolve IPs (dual stack disabled - 6)', async t => {
  t.plan(6)

  let counter = 0
  const server = createServer({ joinDuplicateHeaders: true })
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world!')
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Agent().compose([
    dispatch => {
      return (opts, handler) => {
        ++counter
        const url = new URL(opts.origin)

        switch (counter) {
          case 1:
            // [::1] -> ::1
            t.assert.strictEqual(isIP(url.hostname.slice(1, 4)), 6)
            break

          case 2:
            // [::1] -> ::1
            t.assert.strictEqual(isIP(url.hostname.slice(1, 4)), 6)
            break
          default:
            t.assert.fail('should not reach this point')
        }

        return dispatch(opts, handler)
      }
    },
    dns({ dualStack: false, affinity: 6 })
  ])

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(await response.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response2.statusCode, 200)
  t.assert.strictEqual(await response2.body.text(), 'hello world!')
})

test('Should we handle TTL (4)', async t => {
  t.plan(10)

  const clock = FakeTimers.install()
  let counter = 0
  let lookupCounter = 0
  const server = createServer({ joinDuplicateHeaders: true })
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world!')
  })

  server.listen(0, '127.0.0.1')

  await once(server, 'listening')

  const client = new Agent().compose([
    dispatch => {
      return (opts, handler) => {
        ++counter
        const url = new URL(opts.origin)

        switch (counter) {
          case 1:
            t.assert.strictEqual(isIP(url.hostname), 4)
            break

          case 2:
            t.assert.strictEqual(isIP(url.hostname), 4)
            break

          case 3:
            t.assert.strictEqual(isIP(url.hostname), 4)
            break
          default:
            t.assert.fail('should not reach this point')
        }

        return dispatch(opts, handler)
      }
    },
    dns({
      dualStack: false,
      affinity: 4,
      maxTTL: 400,
      lookup: (origin, opts, cb) => {
        ++lookupCounter
        lookup(
          origin.hostname,
          { all: true, family: opts.affinity },
          cb
        )
      }
    })
  ])

  after(async () => {
    clock.uninstall()
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(await response.body.text(), 'hello world!')

  clock.tick(200)

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response2.statusCode, 200)
  t.assert.strictEqual(await response2.body.text(), 'hello world!')

  clock.tick(300)

  const response3 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response3.statusCode, 200)
  t.assert.strictEqual(await response3.body.text(), 'hello world!')

  t.assert.strictEqual(lookupCounter, 2)
})

test('Should we handle TTL (6)', async t => {
  t.plan(10)

  const clock = FakeTimers.install()
  let counter = 0
  let lookupCounter = 0
  const server = createServer({ joinDuplicateHeaders: true })
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world!')
  })

  server.listen(0, '::1')

  await once(server, 'listening')

  const client = new Agent().compose([
    dispatch => {
      return (opts, handler) => {
        ++counter
        const url = new URL(opts.origin)

        switch (counter) {
          case 1:
            // [::1] -> ::1
            t.assert.strictEqual(isIP(url.hostname.slice(1, 4)), 6)
            break

          case 2:
            // [::1] -> ::1
            t.assert.strictEqual(isIP(url.hostname.slice(1, 4)), 6)
            break

          case 3:
            // [::1] -> ::1
            t.assert.strictEqual(isIP(url.hostname.slice(1, 4)), 6)
            break
          default:
            t.assert.fail('should not reach this point')
        }

        return dispatch(opts, handler)
      }
    },
    dns({
      dualStack: false,
      affinity: 6,
      maxTTL: 400,
      lookup: (origin, opts, cb) => {
        ++lookupCounter
        lookup(
          origin.hostname,
          { all: true, family: opts.affinity },
          cb
        )
      }
    })
  ])

  after(async () => {
    clock.uninstall()
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(await response.body.text(), 'hello world!')

  clock.tick(200)

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response2.statusCode, 200)
  t.assert.strictEqual(await response2.body.text(), 'hello world!')

  clock.tick(300)

  const response3 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response3.statusCode, 200)
  t.assert.strictEqual(await response3.body.text(), 'hello world!')
  t.assert.strictEqual(lookupCounter, 2)
})

test('Should set lowest TTL between resolved and option maxTTL', async t => {
  t.plan(9)

  const clock = FakeTimers.install()
  let lookupCounter = 0
  const server = createServer({ joinDuplicateHeaders: true })
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world!')
  })

  server.listen(0, '127.0.0.1')

  await once(server, 'listening')

  const client = new Agent().compose(
    dns({
      dualStack: false,
      affinity: 4,
      maxTTL: 200,
      lookup: (origin, opts, cb) => {
        ++lookupCounter
        cb(null, [
          {
            address: '127.0.0.1',
            family: 4,
            ttl: lookupCounter === 1 ? 50 : 500
          }
        ])
      }
    })
  )

  after(async () => {
    clock.uninstall()
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(await response.body.text(), 'hello world!')

  clock.tick(100)

  // 100ms: lookup since ttl = Math.min(50, maxTTL: 200)
  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response2.statusCode, 200)
  t.assert.strictEqual(await response2.body.text(), 'hello world!')

  clock.tick(100)

  // 100ms: cached since ttl = Math.min(500, maxTTL: 200)
  const response3 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response3.statusCode, 200)
  t.assert.strictEqual(await response3.body.text(), 'hello world!')

  clock.tick(150)

  // 250ms: lookup since ttl = Math.min(500, maxTTL: 200)
  const response4 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response4.statusCode, 200)
  t.assert.strictEqual(await response4.body.text(), 'hello world!')

  t.assert.strictEqual(lookupCounter, 3)
})

test('Should use all dns entries (dual stack)', async t => {
  t.plan(16)

  let counter = 0
  let lookupCounter = 0
  const server = createServer({ joinDuplicateHeaders: true })
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world!')
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Agent().compose([
    dispatch => {
      return (opts, handler) => {
        ++counter
        const url = new URL(opts.origin)
        switch (counter) {
          case 1:
            t.assert.strictEqual(url.hostname, '1.1.1.1')
            break

          case 2:
            t.assert.strictEqual(url.hostname, '[::1]')
            break

          case 3:
            t.assert.strictEqual(url.hostname, '2.2.2.2')
            break

          case 4:
            t.assert.strictEqual(url.hostname, '[::2]')
            break

          case 5:
            t.assert.strictEqual(url.hostname, '1.1.1.1')
            break
          default:
            t.assert.fail('should not reach this point')
        }

        url.hostname = '127.0.0.1'
        opts.origin = url.toString()
        return dispatch(opts, handler)
      }
    },
    dns({
      lookup (origin, opts, cb) {
        lookupCounter++
        cb(null, [
          { address: '::1', family: 6 },
          { address: '::2', family: 6 },
          { address: '1.1.1.1', family: 4 },
          { address: '2.2.2.2', family: 4 }
        ])
      }
    })
  ])

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  for (let i = 0; i < 5; i++) {
    const response = await client.request({
      ...requestOptions,
      origin: `http://localhost:${server.address().port}`
    })

    t.assert.strictEqual(response.statusCode, 200)
    t.assert.strictEqual(await response.body.text(), 'hello world!')
  }

  t.assert.strictEqual(lookupCounter, 1)
})

test('Should use all dns entries (dual stack disabled - 4)', async t => {
  t.plan(10)

  let counter = 0
  let lookupCounter = 0
  const server = createServer({ joinDuplicateHeaders: true })
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world!')
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Agent().compose([
    dispatch => {
      return (opts, handler) => {
        ++counter
        const url = new URL(opts.origin)

        switch (counter) {
          case 1:
            t.assert.strictEqual(url.hostname, '1.1.1.1')
            break

          case 2:
            t.assert.strictEqual(url.hostname, '2.2.2.2')
            break

          case 3:
            t.assert.strictEqual(url.hostname, '1.1.1.1')
            break
          default:
            t.assert.fail('should not reach this point')
        }

        url.hostname = '127.0.0.1'
        opts.origin = url.toString()
        return dispatch(opts, handler)
      }
    },
    dns({
      dualStack: false,
      lookup (origin, opts, cb) {
        lookupCounter++
        cb(null, [
          { address: '1.1.1.1', family: 4 },
          { address: '2.2.2.2', family: 4 }
        ])
      }
    })
  ])

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response1 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response1.statusCode, 200)
  t.assert.strictEqual(await response1.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response2.statusCode, 200)
  t.assert.strictEqual(await response2.body.text(), 'hello world!')

  const response3 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response3.statusCode, 200)
  t.assert.strictEqual(await response3.body.text(), 'hello world!')

  t.assert.strictEqual(lookupCounter, 1)
})

test('Should use all dns entries (dual stack disabled - 6)', async t => {
  t.plan(10)

  let counter = 0
  let lookupCounter = 0
  const server = createServer({ joinDuplicateHeaders: true })
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world!')
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Agent().compose([
    dispatch => {
      return (opts, handler) => {
        ++counter
        const url = new URL(opts.origin)

        switch (counter) {
          case 1:
            t.assert.strictEqual(url.hostname, '[::1]')
            break

          case 2:
            t.assert.strictEqual(url.hostname, '[::2]')
            break

          case 3:
            t.assert.strictEqual(url.hostname, '[::1]')
            break
          default:
            t.assert.fail('should not reach this point')
        }

        url.hostname = '127.0.0.1'
        opts.origin = url.toString()
        return dispatch(opts, handler)
      }
    },
    dns({
      dualStack: false,
      affinity: 6,
      lookup (origin, opts, cb) {
        lookupCounter++
        cb(null, [
          { address: '::1', family: 6 },
          { address: '::2', family: 6 }
        ])
      }
    })
  ])

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response1 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response1.statusCode, 200)
  t.assert.strictEqual(await response1.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response2.statusCode, 200)
  t.assert.strictEqual(await response2.body.text(), 'hello world!')

  const response3 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response3.statusCode, 200)
  t.assert.strictEqual(await response3.body.text(), 'hello world!')

  t.assert.strictEqual(lookupCounter, 1)
})

test('Should handle single family resolved (dual stack)', async t => {
  t.plan(7)

  const clock = FakeTimers.install()
  let counter = 0
  let lookupCounter = 0
  const server = createServer({ joinDuplicateHeaders: true })
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world!')
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Agent().compose([
    dispatch => {
      return (opts, handler) => {
        ++counter
        const url = new URL(opts.origin)

        switch (counter) {
          case 1:
            t.assert.strictEqual(isIP(url.hostname), 4)
            break

          case 2:
            // [::1] -> ::1
            t.assert.strictEqual(isIP(url.hostname.slice(1, 4)), 6)
            break
          default:
            t.assert.fail('should not reach this point')
        }

        return dispatch(opts, handler)
      }
    },
    dns({
      lookup (origin, opts, cb) {
        lookupCounter++
        if (lookupCounter === 1) {
          cb(null, [
            { address: '127.0.0.1', family: 4, ttl: 50 }
          ])
        } else {
          cb(null, [
            { address: '::1', family: 6, ttl: 50 }
          ])
        }
      }
    })
  ])

  after(async () => {
    clock.uninstall()
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(await response.body.text(), 'hello world!')

  clock.tick(100)

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response2.statusCode, 200)
  t.assert.strictEqual(await response2.body.text(), 'hello world!')

  t.assert.strictEqual(lookupCounter, 2)
})

test('Should prefer affinity (dual stack - 4)', async t => {
  t.plan(10)

  const clock = FakeTimers.install()
  let counter = 0
  let lookupCounter = 0
  const server = createServer({ joinDuplicateHeaders: true })
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world!')
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Agent().compose([
    dispatch => {
      return (opts, handler) => {
        ++counter
        const url = new URL(opts.origin)

        switch (counter) {
          case 1:
            t.assert.strictEqual(url.hostname, '1.1.1.1')
            break

          case 2:
            t.assert.strictEqual(url.hostname, '2.2.2.2')
            break

          case 3:
            t.assert.strictEqual(url.hostname, '1.1.1.1')
            break
          default:
            t.assert.fail('should not reach this point')
        }

        url.hostname = '127.0.0.1'
        opts.origin = url.toString()
        return dispatch(opts, handler)
      }
    },
    dns({
      affinity: 4,
      lookup (origin, opts, cb) {
        lookupCounter++
        cb(null, [
          { address: '1.1.1.1', family: 4 },
          { address: '2.2.2.2', family: 4 },
          { address: '::1', family: 6 },
          { address: '::2', family: 6 }
        ])
      }
    })
  ])

  after(async () => {
    clock.uninstall()
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(await response.body.text(), 'hello world!')

  clock.tick(100)

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response2.statusCode, 200)
  t.assert.strictEqual(await response2.body.text(), 'hello world!')

  const response3 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response3.statusCode, 200)
  t.assert.strictEqual(await response3.body.text(), 'hello world!')

  t.assert.strictEqual(lookupCounter, 1)
})

test('Should prefer affinity (dual stack - 6)', async t => {
  t.plan(10)

  const clock = FakeTimers.install()
  let counter = 0
  let lookupCounter = 0
  const server = createServer({ joinDuplicateHeaders: true })
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world!')
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Agent().compose([
    dispatch => {
      return (opts, handler) => {
        ++counter
        const url = new URL(opts.origin)

        switch (counter) {
          case 1:
            t.assert.strictEqual(url.hostname, '[::1]')
            break

          case 2:
            t.assert.strictEqual(url.hostname, '[::2]')
            break

          case 3:
            t.assert.strictEqual(url.hostname, '[::1]')
            break
          default:
            t.assert.fail('should not reach this point')
        }

        url.hostname = '127.0.0.1'
        opts.origin = url.toString()
        return dispatch(opts, handler)
      }
    },
    dns({
      affinity: 6,
      lookup (origin, opts, cb) {
        lookupCounter++
        cb(null, [
          { address: '1.1.1.1', family: 4 },
          { address: '2.2.2.2', family: 4 },
          { address: '::1', family: 6 },
          { address: '::2', family: 6 }
        ])
      }
    })
  ])

  after(async () => {
    clock.uninstall()
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(await response.body.text(), 'hello world!')

  clock.tick(100)

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response2.statusCode, 200)
  t.assert.strictEqual(await response2.body.text(), 'hello world!')

  const response3 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response3.statusCode, 200)
  t.assert.strictEqual(await response3.body.text(), 'hello world!')

  t.assert.strictEqual(lookupCounter, 1)
})

test('Should use resolved ports (4)', async t => {
  t.plan(5)

  let lookupCounter = 0
  const server1 = createServer({ joinDuplicateHeaders: true })
  const server2 = createServer({ joinDuplicateHeaders: true })
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server1.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world!')
  })

  server1.listen(0)

  server2.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world! (x2)')
  })
  server2.listen(0)

  await Promise.all([once(server1, 'listening'), once(server2, 'listening')])

  const client = new Agent().compose([
    dns({
      lookup (origin, opts, cb) {
        lookupCounter++
        cb(null, [
          { address: '127.0.0.1', family: 4, port: server1.address().port },
          { address: '127.0.0.1', family: 4, port: server2.address().port }
        ])
      }
    })
  ])

  after(async () => {
    await client.close()
    server1.close()
    server2.close()

    await Promise.all([once(server1, 'close'), once(server2, 'close')])
  })

  const response = await client.request({
    ...requestOptions,
    origin: 'http://localhost'
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(await response.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: 'http://localhost'
  })

  t.assert.strictEqual(response2.statusCode, 200)
  t.assert.strictEqual(await response2.body.text(), 'hello world! (x2)')

  t.assert.strictEqual(lookupCounter, 1)
})

test('Should use resolved ports (6)', async t => {
  t.plan(5)

  let lookupCounter = 0
  const server1 = createServer({ joinDuplicateHeaders: true })
  const server2 = createServer({ joinDuplicateHeaders: true })
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server1.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world!')
  })

  server1.listen(0, '::1')

  server2.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world! (x2)')
  })
  server2.listen(0, '::1')

  await Promise.all([once(server1, 'listening'), once(server2, 'listening')])

  const client = new Agent().compose([
    dns({
      lookup (origin, opts, cb) {
        lookupCounter++
        cb(null, [
          { address: '::1', family: 6, port: server1.address().port },
          { address: '::1', family: 6, port: server2.address().port }
        ])
      }
    })
  ])

  after(async () => {
    await client.close()
    server1.close()
    server2.close()

    await Promise.all([once(server1, 'close'), once(server2, 'close')])
  })

  const response = await client.request({
    ...requestOptions,
    origin: 'http://localhost'
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(await response.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: 'http://localhost'
  })

  t.assert.strictEqual(response2.statusCode, 200)
  t.assert.strictEqual(await response2.body.text(), 'hello world! (x2)')

  t.assert.strictEqual(lookupCounter, 1)
})

test('Should handle max cached items', async t => {
  t.plan(9)

  let counter = 0
  const server1 = createServer({ joinDuplicateHeaders: true })
  const server2 = createServer({ joinDuplicateHeaders: true })
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server1.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world!')
  })

  server1.listen(0)

  server2.on('request', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world! (x2)')
  })
  server2.listen(0)

  await Promise.all([once(server1, 'listening'), once(server2, 'listening')])

  const client = new Agent().compose([
    dispatch => {
      return (opts, handler) => {
        ++counter
        const url = new URL(opts.origin)

        switch (counter) {
          case 1:
            t.assert.strictEqual(isIP(url.hostname), 4)
            break

          case 2:
            // [::1] -> ::1
            t.assert.strictEqual(isIP(url.hostname.slice(1, 4)), 6)
            break

          case 3:
            t.assert.strictEqual(url.hostname, 'developer.mozilla.org')
            // Rewrite origin to avoid reaching internet
            opts.origin = `http://127.0.0.1:${server2.address().port}`
            break
          default:
            t.assert.fails('should not reach this point')
        }

        return dispatch(opts, handler)
      }
    },
    dns({
      maxItems: 1,
      lookup: (_origin, _opts, cb) => {
        cb(null, [
          {
            address: '::1',
            family: 6
          },
          {
            address: '127.0.0.1',
            family: 4
          }
        ])
      }
    })
  ])

  after(async () => {
    await client.close()
    server1.close()
    server2.close()

    await Promise.all([once(server1, 'close'), once(server2, 'close')])
  })

  const response = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server1.address().port}`
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(await response.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server1.address().port}`
  })

  t.assert.strictEqual(response2.statusCode, 200)
  t.assert.strictEqual(await response2.body.text(), 'hello world!')

  const response3 = await client.request({
    ...requestOptions,
    origin: 'https://developer.mozilla.org'
  })

  t.assert.strictEqual(response3.statusCode, 200)
  t.assert.strictEqual(await response3.body.text(), 'hello world! (x2)')
})

test('retry once with dual-stack', async t => {
  t.plan(2)

  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  let counter = 0
  const client = new Agent().compose([
    dispatch => {
      return (opts, handler) => {
        counter++
        return dispatch(opts, handler)
      }
    },
    dns({
      lookup: (_origin, _opts, cb) => {
        cb(null, [
          {
            address: '127.0.0.1',
            port: 3669,
            family: 4,
            ttl: 1000
          },
          {
            address: '::1',
            port: 3669,
            family: 6,
            ttl: 1000
          }
        ])
      }
    })
  ])

  after(async () => {
    await client.close()
  })

  await t.assert.rejects(client.request({
    ...requestOptions,
    origin: 'http://localhost'
  }), 'ECONNREFUSED')

  t.assert.strictEqual(counter, 2)
})

test('Should handle ENOTFOUND response error', async t => {
  t.plan(3)
  let lookupCounter = 0

  const requestOptions = {
    method: 'GET',
    path: '/',
    origin: 'http://localhost'
  }

  const client = new Agent().compose([
    dns({
      lookup (origin, opts, cb) {
        lookupCounter++
        if (lookupCounter === 1) {
          const err = new Error('test error')
          err.code = 'ENOTFOUND'
          cb(err)
        } else {
          // Causes InformationalError
          cb(null, [])
        }
      }
    })
  ])

  after(async () => {
    await client.close()
  })

  let error1
  try {
    await client.request(requestOptions)
  } catch (err) {
    error1 = err
  }
  t.assert.strictEqual(error1.code, 'ENOTFOUND')

  // Test that the records in the dns interceptor were deleted after the
  // previous request
  let error2
  try {
    await client.request(requestOptions)
  } catch (err) {
    error2 = err
  }
  t.assert.strictEqual(error2.name, 'InformationalError')

  t.assert.strictEqual(lookupCounter, 2)
})

test('#3937 - Handle host correctly', async t => {
  t.plan(10)

  const hostsnames = []
  const server = createServer({ joinDuplicateHeaders: true })
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server.on('request', (req, res) => {
    t.assert.strictEqual(req.headers.host, `localhost:${server.address().port}`)

    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world!')
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Agent().compose([
    dispatch => {
      return (opts, handler) => {
        const url = new URL(opts.origin)

        t.assert.strictEqual(hostsnames.includes(url.hostname), false)

        if (url.hostname[0] === '[') {
          // [::1] -> ::1
          t.assert.strictEqual(isIP(url.hostname.slice(1, 4)), 6)
        } else {
          t.assert.strictEqual(isIP(url.hostname), 4)
        }

        hostsnames.push(url.hostname)

        return dispatch(opts, handler)
      }
    },
    dns({
      lookup: (_origin, _opts, cb) => {
        cb(null, [
          {
            address: '::1',
            family: 6
          },
          {
            address: '127.0.0.1',
            family: 4
          }
        ])
      }
    })
  ])

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response.statusCode, 200)
  t.assert.strictEqual(await response.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.assert.strictEqual(response2.statusCode, 200)
  t.assert.strictEqual(await response2.body.text(), 'hello world!')
})

test('#3951 - Should handle lookup errors correctly', async t => {
  t.plan(1)

  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  const client = new Agent().compose([
    dns({
      lookup: (_origin, _opts, cb) => {
        cb(new Error('lookup error'))
      }
    })
  ])

  await t.assert.rejects(client.request({
    ...requestOptions,
    origin: 'http://localhost'
  }), new Error('lookup error'))
})
