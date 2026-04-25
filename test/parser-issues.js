'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const net = require('node:net')
const { Client, errors } = require('..')

test('https://github.com/mcollina/undici/issues/268', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = net.createServer(socket => {
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
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

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
      data.body
        .resume()
      setTimeout(() => {
        t.ok(true, 'pass')
        data.body.on('error', () => {})
      }, 2e3)
    })
  })

  await t.completed
})

test('parser fail', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = net.createServer(socket => {
    socket.write('HTT/1.1 200 OK\r\n')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    client.request({
      method: 'GET',
      path: '/'
    }, (err, data) => {
      t.ok(err)
      t.ok(err instanceof errors.HTTPParserError)
    })
  })

  await t.completed
})

test('split header field', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = net.createServer(socket => {
    socket.write('HTTP/1.1 200 OK\r\nA')
    setTimeout(() => {
      socket.write('SD: asd,asd\r\n\r\n\r\n')
    }, 100)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    client.request({
      method: 'GET',
      path: '/'
    }, (err, data) => {
      t.ifError(err)
      t.equal(data.headers.asd, 'asd,asd')
      data.body.destroy().on('error', () => {})
    })
  })

  await t.completed
})

test('split header value', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = net.createServer(socket => {
    socket.write('HTTP/1.1 200 OK\r\nASD: asd')
    setTimeout(() => {
      socket.write(',asd\r\n\r\n\r\n')
    }, 100)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    client.request({
      method: 'GET',
      path: '/'
    }, (err, data) => {
      t.ifError(err)
      t.equal(data.headers.asd, 'asd,asd')
      data.body.destroy().on('error', () => {})
    })
  })

  await t.completed
})

test('refreshes wasm input view after reallocating parser buffer', async (t) => {
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

  const server = net.createServer(socket => {
    let responsesSent = 0

    socket.on('data', () => {
      socket.write(responses[responsesSent++])
    })
  })
  after(() => server.close())

  await new Promise(resolve => server.listen(0, resolve))

  const client = new Client(`http://localhost:${server.address().port}`)
  after(() => client.destroy())

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
