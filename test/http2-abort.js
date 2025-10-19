'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

test('#2364 - Concurrent aborts', async t => {
  t = tspl(t, { plan: 10 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  server.on('stream', (stream, headers, _flags, rawHeaders) => {
    setTimeout(() => {
      stream.respond({
        'content-type': 'text/plain; charset=utf-8',
        'x-custom-h2': 'hello',
        ':status': 200
      })
      stream.end('hello h2!')
    }, 100)
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })

  after(() => client.close())
  const signal = AbortSignal.timeout(100)

  client.request(
    {
      path: '/1',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      }
    },
    (err, response) => {
      t.ifError(err)
      t.strictEqual(
        response.headers['content-type'],
        'text/plain; charset=utf-8'
      )
      t.strictEqual(response.headers['x-custom-h2'], 'hello')
      t.strictEqual(response.statusCode, 200)
    }
  )

  client.request(
    {
      path: '/2',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      },
      signal
    },
    (err, response) => {
      t.strictEqual(err.name, 'TimeoutError')
    }
  )

  client.request(
    {
      path: '/3',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      }
    },
    (err, response) => {
      t.ifError(err)
      t.strictEqual(
        response.headers['content-type'],
        'text/plain; charset=utf-8'
      )
      t.strictEqual(response.headers['x-custom-h2'], 'hello')
      t.strictEqual(response.statusCode, 200)
    }
  )

  client.request(
    {
      path: '/4',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      },
      signal
    },
    (err, response) => {
      t.strictEqual(err.name, 'TimeoutError')
    }
  )

  await t.completed
})

test('#2364 - Concurrent aborts (2nd variant)', async t => {
  t = tspl(t, { plan: 10 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  let counter = 0

  server.on('stream', (stream, headers, _flags, rawHeaders) => {
    counter++

    if (counter % 2 === 0) {
      setTimeout(() => {
        if (stream.destroyed) {
          return
        }

        stream.respond({
          'content-type': 'text/plain; charset=utf-8',
          'x-custom-h2': 'hello',
          ':status': 200
        })

        stream.end('hello h2!')
      }, 400)

      return
    }

    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'hello',
      ':status': 200
    })

    stream.end('hello h2!')
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })
  after(() => client.close())

  const signal = AbortSignal.timeout(300)

  client.request(
    {
      path: '/1',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      }
    },
    (err, response) => {
      t.ifError(err)
      t.strictEqual(
        response.headers['content-type'],
        'text/plain; charset=utf-8'
      )
      t.strictEqual(response.headers['x-custom-h2'], 'hello')
      t.strictEqual(response.statusCode, 200)
    }
  )

  client.request(
    {
      path: '/2',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      },
      signal
    },
    (err, response) => {
      t.strictEqual(err.name, 'TimeoutError')
    }
  )

  client.request(
    {
      path: '/3',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      }
    },
    (err, response) => {
      t.ifError(err)
      t.strictEqual(
        response.headers['content-type'],
        'text/plain; charset=utf-8'
      )
      t.strictEqual(response.headers['x-custom-h2'], 'hello')
      t.strictEqual(response.statusCode, 200)
    }
  )

  client.request(
    {
      path: '/4',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      },
      signal
    },
    (err, response) => {
      t.strictEqual(err.name, 'TimeoutError')
    }
  )

  await t.completed
})
