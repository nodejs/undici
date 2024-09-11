'use strict'

const { test, after } = require('node:test')
const { isIP } = require('node:net')
const { lookup } = require('node:dns')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { setTimeout: sleep } = require('node:timers/promises')

const { tspl } = require('@matteo.collina/tspl')

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
            t.equal(isIP(url.hostname.slice(1, 4)), 6)
            break
          default:
            t.fail('should not reach this point')
        }

        return dispatch(opts, handler)
      }
    },
    dns()
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
    dns()
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
    dns()
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
    origin: 'http://localhost'
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
  t = tspl(t, { plan: 7 })

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
          default:
            t.fail('should not reach this point')
        }

        return dispatch(opts, handler)
      }
    },
    dns({
      dualStack: false,
      affinity: 4,
      maxTTL: 100,
      lookup: (origin, opts, cb) => {
        ++lookupCounter
        lookup(
          origin.hostname,
          { all: true, family: opts.affinity },
          (err, addresses) => {
            if (err) {
              return cb(err)
            }

            const results = []

            for (const addr of addresses) {
              const record = {
                address: addr.address,
                ttl: opts.maxTTL,
                family: addr.family
              }

              results.push(record)
            }

            cb(null, results)
          }
        )
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

  await sleep(500)

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response2.statusCode, 200)
  t.equal(await response2.body.text(), 'hello world!')
  t.equal(lookupCounter, 2)
})

test('Should we handle TTL (6)', async t => {
  t = tspl(t, { plan: 7 })

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
          default:
            t.fail('should not reach this point')
        }

        return dispatch(opts, handler)
      }
    },
    dns({
      dualStack: false,
      affinity: 6,
      maxTTL: 100,
      lookup: (origin, opts, cb) => {
        ++lookupCounter
        lookup(
          origin.hostname,
          { all: true, family: opts.affinity },
          (err, addresses) => {
            if (err) {
              return cb(err)
            }

            const results = []

            for (const addr of addresses) {
              const record = {
                address: addr.address,
                ttl: opts.maxTTL,
                family: addr.family
              }

              results.push(record)
            }

            cb(null, results)
          }
        )
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

  await sleep(200)

  const response2 = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response2.statusCode, 200)
  t.equal(await response2.body.text(), 'hello world!')
  t.equal(lookupCounter, 2)
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
    dns({ maxItems: 1 })
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
