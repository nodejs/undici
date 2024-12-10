'use strict'

const FakeTimers = require('@sinonjs/fake-timers')
const { test, after } = require('node:test')
const { isIP } = require('node:net')
const { lookup } = require('node:dns')
const { createServer } = require('node:http')
const { createServer: createSecureServer } = require('node:https')
const { once } = require('node:events')

const { tspl } = require('@matteo.collina/tspl')
const pem = require('https-pem')

const { interceptors, Agent } = require('../..')
const { dns } = interceptors

test('Should validate options', t => {
  t = tspl(t, { plan: 10 })

  t.throws(() => dns({ dualStack: 'true' }), { code: 'UND_ERR_INVALID_ARG' })
  t.throws(() => dns({ dualStack: 0 }), { code: 'UND_ERR_INVALID_ARG' })
  t.throws(() => dns({ affinity: '4' }), { code: 'UND_ERR_INVALID_ARG' })
  t.throws(() => dns({ affinity: 7 }), { code: 'UND_ERR_INVALID_ARG' })
  t.throws(() => dns({ maxTTL: -1 }), { code: 'UND_ERR_INVALID_ARG' })
  t.throws(() => dns({ maxTTL: '0' }), { code: 'UND_ERR_INVALID_ARG' })
  t.throws(() => dns({ maxItems: '1' }), { code: 'UND_ERR_INVALID_ARG' })
  t.throws(() => dns({ maxItems: -1 }), { code: 'UND_ERR_INVALID_ARG' })
  t.throws(() => dns({ lookup: {} }), { code: 'UND_ERR_INVALID_ARG' })
  t.throws(() => dns({ pick: [] }), { code: 'UND_ERR_INVALID_ARG' })
})

test('Should automatically resolve IPs (dual stack)', async t => {
  t = tspl(t, { plan: 8 })

  const hostsnames = []
  const server = createServer()
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

        t.equal(hostsnames.includes(url.hostname), false)

        if (url.hostname[0] === '[') {
          // [::1] -> ::1
          t.equal(isIP(url.hostname.slice(1, 4)), 6)
        } else {
          t.equal(isIP(url.hostname), 4)
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

  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response2.statusCode, 200)
  t.equal(await response2.body.text(), 'hello world!')
})

test('Should respect DNS origin hostname for SNI on TLS', async t => {
  t = tspl(t, { plan: 12 })

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
    t.equal(req.headers.host, `localhost:${server.address().port}`)
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

        t.equal(hostsnames.includes(url.hostname), false)
        t.equal(opts.servername, 'localhost')

        if (url.hostname[0] === '[') {
          // [::1] -> ::1
          t.equal(isIP(url.hostname.slice(1, 4)), 6)
        } else {
          t.equal(isIP(url.hostname), 4)
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

  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: `https://localhost:${server.address().port}`
  })

  t.equal(response2.statusCode, 200)
  t.equal(await response2.body.text(), 'hello world!')
})

test('Should recover on network errors (dual stack - 4)', async t => {
  t = tspl(t, { plan: 8 })

  let counter = 0
  const server = createServer()
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
            t.equal(isIP(url.hostname), 4)
            break

          case 2:
            // [::1] -> ::1
            t.equal(isIP(url.hostname.slice(1, 4)), 6)
            break

          case 3:
            // [::1] -> ::1
            t.equal(isIP(url.hostname), 4)
            break

          case 4:
            // [::1] -> ::1
            t.equal(isIP(url.hostname.slice(1, 4)), 6)
            break
          default:
            t.fail('should not reach this point')
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

  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response2.statusCode, 200)
  t.equal(await response2.body.text(), 'hello world!')
})

test('Should recover on network errors (dual stack - 6)', async t => {
  t = tspl(t, { plan: 7 })

  let counter = 0
  const server = createServer()
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
            t.equal(isIP(url.hostname), 4)
            break

          case 2:
            // [::1] -> ::1
            t.equal(isIP(url.hostname.slice(1, 4)), 6)
            break

          case 3:
            // [::1] -> ::1
            t.equal(isIP(url.hostname), 4)
            break
          default:
            t.fail('should not reach this point')
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

  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response2.statusCode, 200)
  t.equal(await response2.body.text(), 'hello world!')
})

test('Should throw when on dual-stack disabled (4)', async t => {
  t = tspl(t, { plan: 2 })

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
            t.equal(isIP(url.hostname), 4)
            break

          default:
            t.fail('should not reach this point')
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

  await t.rejects(promise, 'ECONNREFUSED')

  await t.complete
})

test('Should throw when on dual-stack disabled (6)', async t => {
  t = tspl(t, { plan: 2 })

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
            t.equal(isIP(url.hostname.slice(1, 4)), 6)
            break

          default:
            t.fail('should not reach this point')
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

  await t.rejects(promise, 'ECONNREFUSED')

  await t.complete
})

test('Should automatically resolve IPs (dual stack disabled - 4)', async t => {
  t = tspl(t, { plan: 6 })

  let counter = 0
  const server = createServer()
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
            t.equal(isIP(url.hostname), 4)
            break

          case 2:
            // [::1] -> ::1
            t.equal(isIP(url.hostname), 4)
            break
          default:
            t.fail('should not reach this point')
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

  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response2.statusCode, 200)
  t.equal(await response2.body.text(), 'hello world!')
})

test('Should automatically resolve IPs (dual stack disabled - 6)', async t => {
  t = tspl(t, { plan: 6 })

  let counter = 0
  const server = createServer()
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
            t.equal(isIP(url.hostname.slice(1, 4)), 6)
            break

          case 2:
            // [::1] -> ::1
            t.equal(isIP(url.hostname.slice(1, 4)), 6)
            break
          default:
            t.fail('should not reach this point')
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

  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response2.statusCode, 200)
  t.equal(await response2.body.text(), 'hello world!')
})

test('Should we handle TTL (4)', async t => {
  t = tspl(t, { plan: 10 })

  const clock = FakeTimers.install()
  let counter = 0
  let lookupCounter = 0
  const server = createServer()
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
            t.equal(isIP(url.hostname), 4)
            break

          case 2:
            t.equal(isIP(url.hostname), 4)
            break

          case 3:
            t.equal(isIP(url.hostname), 4)
            break
          default:
            t.fail('should not reach this point')
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

  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), 'hello world!')

  clock.tick(200)

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response2.statusCode, 200)
  t.equal(await response2.body.text(), 'hello world!')

  clock.tick(300)

  const response3 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response3.statusCode, 200)
  t.equal(await response3.body.text(), 'hello world!')

  t.equal(lookupCounter, 2)
})

test('Should we handle TTL (6)', async t => {
  t = tspl(t, { plan: 10 })

  const clock = FakeTimers.install()
  let counter = 0
  let lookupCounter = 0
  const server = createServer()
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
            t.equal(isIP(url.hostname.slice(1, 4)), 6)
            break

          case 2:
            // [::1] -> ::1
            t.equal(isIP(url.hostname.slice(1, 4)), 6)
            break

          case 3:
            // [::1] -> ::1
            t.equal(isIP(url.hostname.slice(1, 4)), 6)
            break
          default:
            t.fail('should not reach this point')
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

  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), 'hello world!')

  clock.tick(200)

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response2.statusCode, 200)
  t.equal(await response2.body.text(), 'hello world!')

  clock.tick(300)

  const response3 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response3.statusCode, 200)
  t.equal(await response3.body.text(), 'hello world!')
  t.equal(lookupCounter, 2)
})

test('Should set lowest TTL between resolved and option maxTTL', async t => {
  t = tspl(t, { plan: 9 })

  const clock = FakeTimers.install()
  let lookupCounter = 0
  const server = createServer()
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

  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), 'hello world!')

  clock.tick(100)

  // 100ms: lookup since ttl = Math.min(50, maxTTL: 200)
  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response2.statusCode, 200)
  t.equal(await response2.body.text(), 'hello world!')

  clock.tick(100)

  // 100ms: cached since ttl = Math.min(500, maxTTL: 200)
  const response3 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response3.statusCode, 200)
  t.equal(await response3.body.text(), 'hello world!')

  clock.tick(150)

  // 250ms: lookup since ttl = Math.min(500, maxTTL: 200)
  const response4 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response4.statusCode, 200)
  t.equal(await response4.body.text(), 'hello world!')

  t.equal(lookupCounter, 3)
})

test('Should use all dns entries (dual stack)', async t => {
  t = tspl(t, { plan: 16 })

  let counter = 0
  let lookupCounter = 0
  const server = createServer()
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
            t.equal(url.hostname, '1.1.1.1')
            break

          case 2:
            t.equal(url.hostname, '[::1]')
            break

          case 3:
            t.equal(url.hostname, '2.2.2.2')
            break

          case 4:
            t.equal(url.hostname, '[::2]')
            break

          case 5:
            t.equal(url.hostname, '1.1.1.1')
            break
          default:
            t.fail('should not reach this point')
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

    t.equal(response.statusCode, 200)
    t.equal(await response.body.text(), 'hello world!')
  }

  t.equal(lookupCounter, 1)
})

test('Should use all dns entries (dual stack disabled - 4)', async t => {
  t = tspl(t, { plan: 10 })

  let counter = 0
  let lookupCounter = 0
  const server = createServer()
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
            t.equal(url.hostname, '1.1.1.1')
            break

          case 2:
            t.equal(url.hostname, '2.2.2.2')
            break

          case 3:
            t.equal(url.hostname, '1.1.1.1')
            break
          default:
            t.fail('should not reach this point')
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

  t.equal(response1.statusCode, 200)
  t.equal(await response1.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response2.statusCode, 200)
  t.equal(await response2.body.text(), 'hello world!')

  const response3 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response3.statusCode, 200)
  t.equal(await response3.body.text(), 'hello world!')

  t.equal(lookupCounter, 1)
})

test('Should use all dns entries (dual stack disabled - 6)', async t => {
  t = tspl(t, { plan: 10 })

  let counter = 0
  let lookupCounter = 0
  const server = createServer()
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
            t.equal(url.hostname, '[::1]')
            break

          case 2:
            t.equal(url.hostname, '[::2]')
            break

          case 3:
            t.equal(url.hostname, '[::1]')
            break
          default:
            t.fail('should not reach this point')
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

  t.equal(response1.statusCode, 200)
  t.equal(await response1.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response2.statusCode, 200)
  t.equal(await response2.body.text(), 'hello world!')

  const response3 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response3.statusCode, 200)
  t.equal(await response3.body.text(), 'hello world!')

  t.equal(lookupCounter, 1)
})

test('Should handle single family resolved (dual stack)', async t => {
  t = tspl(t, { plan: 7 })

  const clock = FakeTimers.install()
  let counter = 0
  let lookupCounter = 0
  const server = createServer()
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
            t.equal(isIP(url.hostname), 4)
            break

          case 2:
            // [::1] -> ::1
            t.equal(isIP(url.hostname.slice(1, 4)), 6)
            break
          default:
            t.fail('should not reach this point')
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

  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), 'hello world!')

  clock.tick(100)

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response2.statusCode, 200)
  t.equal(await response2.body.text(), 'hello world!')

  t.equal(lookupCounter, 2)
})

test('Should prefer affinity (dual stack - 4)', async t => {
  t = tspl(t, { plan: 10 })

  const clock = FakeTimers.install()
  let counter = 0
  let lookupCounter = 0
  const server = createServer()
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
            t.equal(url.hostname, '1.1.1.1')
            break

          case 2:
            t.equal(url.hostname, '2.2.2.2')
            break

          case 3:
            t.equal(url.hostname, '1.1.1.1')
            break
          default:
            t.fail('should not reach this point')
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

  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), 'hello world!')

  clock.tick(100)

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response2.statusCode, 200)
  t.equal(await response2.body.text(), 'hello world!')

  const response3 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response3.statusCode, 200)
  t.equal(await response3.body.text(), 'hello world!')

  t.equal(lookupCounter, 1)
})

test('Should prefer affinity (dual stack - 6)', async t => {
  t = tspl(t, { plan: 10 })

  const clock = FakeTimers.install()
  let counter = 0
  let lookupCounter = 0
  const server = createServer()
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
            t.equal(url.hostname, '[::1]')
            break

          case 2:
            t.equal(url.hostname, '[::2]')
            break

          case 3:
            t.equal(url.hostname, '[::1]')
            break
          default:
            t.fail('should not reach this point')
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

  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), 'hello world!')

  clock.tick(100)

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response2.statusCode, 200)
  t.equal(await response2.body.text(), 'hello world!')

  const response3 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response3.statusCode, 200)
  t.equal(await response3.body.text(), 'hello world!')

  t.equal(lookupCounter, 1)
})

test('Should use resolved ports (4)', async t => {
  t = tspl(t, { plan: 5 })

  let lookupCounter = 0
  const server1 = createServer()
  const server2 = createServer()
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

  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: 'http://localhost'
  })

  t.equal(response2.statusCode, 200)
  t.equal(await response2.body.text(), 'hello world! (x2)')

  t.equal(lookupCounter, 1)
})

test('Should use resolved ports (6)', async t => {
  t = tspl(t, { plan: 5 })

  let lookupCounter = 0
  const server1 = createServer()
  const server2 = createServer()
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

  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: 'http://localhost'
  })

  t.equal(response2.statusCode, 200)
  t.equal(await response2.body.text(), 'hello world! (x2)')

  t.equal(lookupCounter, 1)
})

test('Should handle max cached items', async t => {
  t = tspl(t, { plan: 9 })

  let counter = 0
  const server1 = createServer()
  const server2 = createServer()
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
            t.equal(isIP(url.hostname), 4)
            break

          case 2:
            // [::1] -> ::1
            t.equal(isIP(url.hostname.slice(1, 4)), 6)
            break

          case 3:
            t.equal(url.hostname, 'developer.mozilla.org')
            // Rewrite origin to avoid reaching internet
            opts.origin = `http://127.0.0.1:${server2.address().port}`
            break
          default:
            t.fails('should not reach this point')
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

  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server1.address().port}`
  })

  t.equal(response2.statusCode, 200)
  t.equal(await response2.body.text(), 'hello world!')

  const response3 = await client.request({
    ...requestOptions,
    origin: 'https://developer.mozilla.org'
  })

  t.equal(response3.statusCode, 200)
  t.equal(await response3.body.text(), 'hello world! (x2)')
})

test('#3937 - Handle host correctly', async t => {
  t = tspl(t, { plan: 10 })

  const hostsnames = []
  const server = createServer()
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server.on('request', (req, res) => {
    t.equal(req.headers.host, `localhost:${server.address().port}`)

    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world!')
  })

  server.listen(0)

  await once(server, 'listening')

  const client = new Agent().compose([
    dispatch => {
      return (opts, handler) => {
        const url = new URL(opts.origin)

        t.equal(hostsnames.includes(url.hostname), false)

        if (url.hostname[0] === '[') {
          // [::1] -> ::1
          t.equal(isIP(url.hostname.slice(1, 4)), 6)
        } else {
          t.equal(isIP(url.hostname), 4)
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

  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), 'hello world!')

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response2.statusCode, 200)
  t.equal(await response2.body.text(), 'hello world!')
})
