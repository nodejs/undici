'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const net = require('node:net')
const { Client, errors, fetch } = require('..')

const truncatedChunkedResponse = Buffer.from(
  'HTTP/1.1 200 OK\r\n' +
  'Transfer-Encoding: chunked\r\n' +
  'Connection: close\r\n' +
  '\r\n' +
  '3\r\n' +
  'hel\r\n'
)

function createTrackedServer (onConnection) {
  const sockets = new Set()
  const server = net.createServer(socket => {
    sockets.add(socket)
    socket.on('close', () => {
      sockets.delete(socket)
    })
    onConnection(socket)
  })

  return {
    server,
    close () {
      for (const socket of sockets) {
        socket.destroy()
      }

      return new Promise((resolve, reject) => {
        server.close(err => {
          if (err != null) {
            reject(err)
            return
          }

          resolve()
        })
      })
    }
  }
}

function listen (server) {
  return new Promise(resolve => server.listen(0, resolve))
}

test('https://github.com/mcollina/undici/issues/268', async (t) => {
  const ctx = t
  t = tspl(t, { plan: 2 })

  const { server, close } = createTrackedServer(socket => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Transfer-Encoding: chunked\r\n\r\n')
    setTimeout(() => {
      socket.write('1\r\n')
      socket.write('\n\r\n')
      setTimeout(() => {
        socket.write('1\r\n')
        socket.write('\n\r\n')
      }, 500)
    }, 500)
  })

  await listen(server)

  const client = new Client(`http://localhost:${server.address().port}`)
  ctx.after(async () => {
    client.destroy()
    await close()
  })

  client.on('disconnect', () => {
    if (!client.closed && !client.destroyed) {
      t.fail('unexpected disconnect')
    }
  })

  client.request({
    method: 'GET',
    path: '/nxt/_changes?feed=continuous&heartbeat=5000',
    headersTimeout: 1e3
  }, (err, data) => {
    t.ifError(err)
    data.body.resume()
    setTimeout(() => {
      t.ok(true, 'pass')
      data.body.on('error', () => {})
    }, 2e3)
  })

  await t.completed
})

test('parser fail', async (t) => {
  const ctx = t
  t = tspl(t, { plan: 2 })

  const { server, close } = createTrackedServer(socket => {
    socket.end('HTT/1.1 200 OK\r\n')
  })

  await listen(server)

  const client = new Client(`http://localhost:${server.address().port}`)
  ctx.after(async () => {
    client.destroy()
    await close()
  })

  client.request({
    method: 'GET',
    path: '/'
  }, (err, data) => {
    t.ok(err)
    t.ok(err instanceof errors.HTTPParserError)
  })

  await t.completed
})

test('split header field', async (t) => {
  const ctx = t
  t = tspl(t, { plan: 2 })

  const { server, close } = createTrackedServer(socket => {
    socket.write('HTTP/1.1 200 OK\r\nA')
    setTimeout(() => {
      socket.end('SD: asd,asd\r\nContent-Length: 0\r\n\r\n')
    }, 100)
  })

  await listen(server)

  const client = new Client(`http://localhost:${server.address().port}`)
  ctx.after(async () => {
    client.destroy()
    await close()
  })

  client.request({
    method: 'GET',
    path: '/'
  }, (err, data) => {
    t.ifError(err)
    t.equal(data.headers.asd, 'asd,asd')
    data.body.resume()
  })

  await t.completed
})

test('split header value', async (t) => {
  const ctx = t
  t = tspl(t, { plan: 2 })

  const { server, close } = createTrackedServer(socket => {
    socket.write('HTTP/1.1 200 OK\r\nASD: asd')
    setTimeout(() => {
      socket.end(',asd\r\nContent-Length: 0\r\n\r\n')
    }, 100)
  })

  await listen(server)

  const client = new Client(`http://localhost:${server.address().port}`)
  ctx.after(async () => {
    client.destroy()
    await close()
  })

  client.request({
    method: 'GET',
    path: '/'
  }, (err, data) => {
    t.ifError(err)
    t.equal(data.headers.asd, 'asd,asd')
    data.body.resume()
  })

  await t.completed
})

test('refreshes wasm input view after reallocating parser buffer', async (t) => {
  const ctx = t
  t = tspl(t, { plan: 4 })

  const smallBody = Buffer.from('ok')
  const largeBody = Buffer.alloc(8192, 'a')
  const responses = [
    Buffer.concat([
      Buffer.from(`HTTP/1.1 200 OK\r\nContent-Length: ${smallBody.length}\r\n\r\n`),
      smallBody
    ]),
    Buffer.concat([
      Buffer.from(`HTTP/1.1 200 OK\r\nContent-Length: ${largeBody.length}\r\n\r\n`),
      largeBody
    ])
  ]

  const { server, close } = createTrackedServer(socket => {
    let responsesSent = 0

    socket.on('data', () => {
      socket.write(responses[responsesSent++])
    })
  })

  await listen(server)

  const client = new Client(`http://localhost:${server.address().port}`)
  ctx.after(async () => {
    client.destroy()
    await close()
  })

  function request () {
    return new Promise((resolve, reject) => {
      client.request({
        method: 'GET',
        path: '/'
      }, (err, { statusCode, body } = {}) => {
        if (err) {
          reject(err)
          return
        }

        const bufs = []

        body.on('data', buf => {
          bufs.push(buf)
        })
        body.on('end', () => {
          resolve({
            statusCode,
            body: Buffer.concat(bufs)
          })
        })
        body.on('error', reject)
      })
    })
  }

  const smallResponse = await request()
  t.strictEqual(smallResponse.statusCode, 200)
  t.strictEqual(smallResponse.body.toString(), smallBody.toString())

  const largeResponse = await request()
  t.strictEqual(largeResponse.statusCode, 200)
  t.strictEqual(largeResponse.body.toString(), largeBody.toString())
})

test('truncated chunked responses terminated by EOF error the response body', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = net.createServer((socket) => {
    socket.end(truncatedChunkedResponse)
  })
  after(() => server.close())

  await new Promise(resolve => server.listen(0, resolve))

  const client = new Client(`http://localhost:${server.address().port}`)
  after(() => client.destroy())

  client.request({
    method: 'GET',
    path: '/'
  }, (err, { body } = {}) => {
    t.ifError(err)
    body
      .on('end', () => {
        t.fail('expected the truncated chunked body to fail')
      })
      .on('error', (err) => {
        t.strictEqual(err.name, 'HTTPParserError')
        t.strictEqual(err.message, 'Response does not match the HTTP/1.1 protocol (Invalid EOF state)')
      })
      .resume()
  })

  await t.completed
})

test('fetch rejects truncated chunked responses terminated by EOF', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = net.createServer((socket) => {
    socket.end(truncatedChunkedResponse)
  })
  after(() => server.close())

  await new Promise(resolve => server.listen(0, resolve))

  const res = await fetch(`http://localhost:${server.address().port}`)
  t.strictEqual(res.status, 200)

  try {
    await res.text()
    t.fail('expected fetch to reject the truncated chunked body')
  } catch (err) {
    t.strictEqual(err.name, 'TypeError')
    t.strictEqual(err.cause?.message, 'Response does not match the HTTP/1.1 protocol (Invalid EOF state)')
  }
})
