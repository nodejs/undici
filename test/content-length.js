'use strict'

const { tspl } = require('@matteo.collina/tspl')
const assert = require('node:assert')
const { test, after } = require('node:test')
const { Client, errors } = require('..')
const { createServer } = require('node:http')
const net = require('node:net')
const { once } = require('node:events')
const { Readable } = require('node:stream')
const { maybeWrapStream, consts } = require('./utils/async-iterators')

test('request invalid content-length', async (t) => {
  t = tspl(t, { plan: 7 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end()
  })
  after(() => server.close())
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.request({
      path: '/',
      method: 'PUT',
      headers: {
        'content-length': 10
      },
      body: 'asd'
    }, (err, data) => {
      t.ok(err instanceof errors.RequestContentLengthMismatchError)
    })

    client.request({
      path: '/',
      method: 'PUT',
      headers: {
        'content-length': 10
      },
      body: 'asdasdasdasdasdasda'
    }, (err, data) => {
      t.ok(err instanceof errors.RequestContentLengthMismatchError)
    })

    client.request({
      path: '/',
      method: 'PUT',
      headers: {
        'content-length': 10
      },
      body: Buffer.alloc(9)
    }, (err, data) => {
      t.ok(err instanceof errors.RequestContentLengthMismatchError)
    })

    client.request({
      path: '/',
      method: 'PUT',
      headers: {
        'content-length': 10
      },
      body: Buffer.alloc(11)
    }, (err, data) => {
      t.ok(err instanceof errors.RequestContentLengthMismatchError)
    })

    client.request({
      path: '/',
      method: 'GET',
      headers: {
        'content-length': 4
      },
      body: ['asd']
    }, (err, data) => {
      t.ok(err instanceof errors.RequestContentLengthMismatchError)
    })

    client.request({
      path: '/',
      method: 'GET',
      headers: {
        'content-length': 4
      },
      body: ['asasdasdasdd']
    }, (err, data) => {
      t.ok(err instanceof errors.RequestContentLengthMismatchError)
    })

    client.request({
      path: '/',
      method: 'DELETE',
      headers: {
        'content-length': 4
      },
      body: ['asasdasdasdd']
    }, (err, data) => {
      t.ok(err instanceof errors.RequestContentLengthMismatchError)
    })
  })

  await t.completed
})

function invalidContentLength (bodyType) {
  test(`request streaming ${bodyType} invalid content-length`, async (t) => {
    t = tspl(t, { plan: 4 })

    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.end()
    })
    after(() => server.close())
    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      after(() => client.close())

      client.once('disconnect', () => {
        t.ok(true, 'pass')
        client.once('disconnect', () => {
          t.ok(true, 'pass')
        })
      })

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 10
        },
        body: maybeWrapStream(new Readable({
          read () {
            setImmediate(() => {
              this.push('asdasdasdkajsdnasdkjasnd')
              this.push(null)
            })
          }
        }), bodyType)
      }, (err, data) => {
        t.ok(err instanceof errors.RequestContentLengthMismatchError)
      })

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 10
        },
        body: maybeWrapStream(new Readable({
          read () {
            setImmediate(() => {
              this.push('asd')
              this.push(null)
            })
          }
        }), bodyType)
      }, (err, data) => {
        t.ok(err instanceof errors.RequestContentLengthMismatchError)
      })
    })
    await t.completed
  })
}

invalidContentLength(consts.STREAM)
invalidContentLength(consts.ASYNC_ITERATOR)

function zeroContentLength (bodyType) {
  test(`request ${bodyType} streaming data when content-length=0`, async (t) => {
    t = tspl(t, { plan: 1 })

    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.end()
    })
    after(() => server.close())
    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      after(() => client.close())

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 0
        },
        body: maybeWrapStream(new Readable({
          read () {
            setImmediate(() => {
              this.push('asdasdasdkajsdnasdkjasnd')
              this.push(null)
            })
          }
        }), bodyType)
      }, (err, data) => {
        t.ok(err instanceof errors.RequestContentLengthMismatchError)
      })
    })
    await t.completed
  })
}

zeroContentLength(consts.STREAM)
zeroContentLength(consts.ASYNC_ITERATOR)

test('request streaming no body data when content-length=0', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    req.pipe(res)
  })
  after(() => server.close())
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.on('disconnect', () => {
      if (!client.closed && !client.destroyed) {
        t.fail('unexpected disconnect')
      }
    })

    client.request({
      path: '/',
      method: 'PUT',
      headers: {
        'content-length': 0
      }
    }, (err, data) => {
      t.ifError(err)
      data.body
        .on('data', () => {
          t.fail()
        })
        .on('end', () => {
          t.ok(true, 'pass')
        })
    })
  })

  await t.completed
})

test('response invalid content length with close', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(200, {
      'content-length': 10
    })
    res.end('123')
  })
  after(() => server.close())
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 0
    })
    after(() => client.close())

    client.on('disconnect', (origin, client, err) => {
      t.strictEqual(err.code, 'UND_ERR_RES_CONTENT_LENGTH_MISMATCH')
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.ifError(err)
      data.body
        .on('end', () => {
          t.fail()
        })
        .on('error', (err) => {
          t.strictEqual(err.code, 'UND_ERR_RES_CONTENT_LENGTH_MISMATCH')
        })
        .resume()
    })
  })

  await t.completed
})

test('request streaming with Readable.from(buf)', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    req.pipe(res)
  })
  after(() => server.close())
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.on('disconnect', () => {
      if (!client.closed && !client.destroyed) {
        t.fail('unexpected disconnect')
      }
    })

    client.request({
      path: '/',
      method: 'PUT',
      body: Readable.from(Buffer.from('hello'))
    }, (err, data) => {
      const chunks = []
      t.ifError(err)
      data.body
        .on('data', (chunk) => {
          chunks.push(chunk)
        })
        .on('end', () => {
          t.strictEqual(Buffer.concat(chunks).toString(), 'hello')
          t.ok(true, 'pass')
          t.end()
        })
    })
  })

  await t.completed
})

test('request DELETE, content-length=0, with body', async (t) => {
  t = tspl(t, { plan: 5 })
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.shouldKeepAlive = false
    res.end()
  })
  server.on('request', (req, res) => {
    t.strictEqual(req.headers['content-length'], undefined)
  })
  after(() => server.close())
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.request({
      path: '/',
      method: 'DELETE',
      headers: {
        'content-length': 0
      },
      body: new Readable({
        read () {
          this.push('asd')
          this.push(null)
        }
      })
    }, (err) => {
      t.ok(err instanceof errors.RequestContentLengthMismatchError)
    })

    client.request({
      path: '/',
      method: 'DELETE',
      headers: {
        'content-length': 0
      }
    }, (err, resp) => {
      t.strictEqual(resp.headers['content-length'], '0')
      t.ifError(err)
    })

    client.on('disconnect', () => {
      t.ok(true, 'pass')
    })
  })

  await t.completed
})

test('content-length shouldSendContentLength=false', async (t) => {
  t = tspl(t, { plan: 15 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end()
  })
  server.on('request', (req, res) => {
    switch (req.url) {
      case '/put0':
        t.strictEqual(req.headers['content-length'], '0')
        break
      case '/head':
        t.strictEqual(req.headers['content-length'], undefined)
        break
      case '/get':
        t.strictEqual(req.headers['content-length'], undefined)
        break
    }
  })
  after(() => server.close())
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.request({
      path: '/put0',
      method: 'PUT',
      headers: {
        'content-length': 0
      }
    }, (err, resp) => {
      t.strictEqual(resp.headers['content-length'], '0')
      t.ifError(err)
    })

    client.request({
      path: '/head',
      method: 'HEAD',
      headers: {
        'content-length': 10
      }
    }, (err, resp) => {
      t.strictEqual(resp.headers['content-length'], undefined)
      t.ifError(err)
    })

    client.request({
      path: '/get',
      method: 'GET',
      headers: {
        'content-length': 0
      }
    }, (err) => {
      t.ifError(err)
    })

    client.request({
      path: '/',
      method: 'GET',
      headers: {
        'content-length': 4
      },
      body: new Readable({
        read () {
          this.push('asd')
          this.push(null)
        }
      })
    }, (err) => {
      t.ifError(err)
    })

    client.request({
      path: '/',
      method: 'GET',
      headers: {
        'content-length': 4
      },
      body: new Readable({
        read () {
          this.push('asasdasdasdd')
          this.push(null)
        }
      })
    }, (err) => {
      t.ifError(err)
    })

    client.request({
      path: '/',
      method: 'HEAD',
      headers: {
        'content-length': 4
      },
      body: new Readable({
        read () {
          this.push('asasdasdasdd')
          this.push(null)
        }
      })
    }, (err) => {
      t.ifError(err)
    })

    client.on('disconnect', () => {
      t.ok(true, 'pass')
    })
  })

  await t.completed
})

function createRawServer (t, onData) {
  const sockets = new Set()
  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    onData(socket)
  })
  t.after(() => {
    for (const socket of sockets) socket.destroy()
    server.close()
  })
  return server
}

function dispatchPaused (client) {
  return new Promise((resolve) => {
    const result = { statusCode: null, body: false, error: null }
    client.dispatch({ path: '/', method: 'GET' }, {
      onRequestStart () {},
      onResponseStart (controller, statusCode) {
        result.statusCode = statusCode
        controller.pause()
        setTimeout(() => controller.resume(), 50)
      },
      onResponseData () {
        result.body = true
      },
      onResponseEnd () {
        resolve(result)
      },
      onResponseError (controller, err) {
        result.error = err
        resolve(result)
      }
    })
  })
}

for (const statusCode of [204, 304]) {
  test(`response ${statusCode} with content-length is not a mismatch but closes the connection`, async (t) => {
    let connections = 0
    const server = createRawServer(t, (socket) => {
      connections++
      socket.on('data', () => {
        // A Content-Length on a 204/304 describes the representation,
        // not bytes on the wire (RFC 9110 §8.6).
        socket.write(`HTTP/1.1 ${statusCode} X\r\ncontent-length: 100\r\n\r\n`)
      })
    })
    server.listen(0)
    await once(server, 'listening')

    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => client.destroy())

    const disconnects = []
    client.on('disconnect', (origin, targets, err) => { disconnects.push(err.code) })

    for (let i = 0; i < 2; i++) {
      const { statusCode: status, headers, body } = await client.request({ path: '/', method: 'GET' })
      assert.strictEqual(status, statusCode)
      assert.strictEqual(headers['content-length'], '100')
      assert.strictEqual(await body.text(), '')
    }

    // The server may have sent content that would be parsed as the next
    // response, so the connection must not be reused.
    assert.strictEqual(connections, 2)
    assert.ok(disconnects.length >= 1)
    assert.ok(disconnects.every((code) => code === 'UND_ERR_INFO'))
  })

  test(`response ${statusCode} with content-length: 0 keeps the connection`, async (t) => {
    let connections = 0
    const server = createRawServer(t, (socket) => {
      connections++
      socket.on('data', () => {
        socket.write(`HTTP/1.1 ${statusCode} X\r\ncontent-length: 0\r\n\r\n`)
      })
    })
    server.listen(0)
    await once(server, 'listening')

    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => client.destroy())

    let disconnects = 0
    client.on('disconnect', () => { disconnects++ })

    for (let i = 0; i < 2; i++) {
      const { statusCode: status, body } = await client.request({ path: '/', method: 'GET' })
      assert.strictEqual(status, statusCode)
      assert.strictEqual(await body.text(), '')
    }

    assert.strictEqual(connections, 1)
    assert.strictEqual(disconnects, 0)
  })

  for (const blocking of [true, false]) {
    test(`response ${statusCode} with content-length does not let its content become a pipelined response (blocking: ${blocking})`, async (t) => {
      const forged = 'HTTP/1.1 200 OK\r\ncontent-length: 6\r\n\r\nFORGED'
      let connections = 0
      const server = createRawServer(t, (socket) => {
        const first = connections++ === 0
        let received = ''
        socket.on('data', (chunk) => {
          received += chunk
          if (first) {
            if (!blocking && received.split('\r\n\r\n').length - 1 < 2) return
            if (socket.replied) return
            socket.replied = true
            socket.write(`HTTP/1.1 ${statusCode} X\r\ncontent-length: ${forged.length}\r\n\r\n${forged}`)
          } else {
            socket.write('HTTP/1.1 200 OK\r\ncontent-length: 4\r\n\r\nREAL')
          }
        })
      })
      server.listen(0)
      await once(server, 'listening')

      const client = new Client(`http://localhost:${server.address().port}`, { pipelining: 2 })
      t.after(() => client.destroy())

      const [r1, r2] = await Promise.all([
        client.request({ path: '/1', method: 'GET', blocking }),
        client.request({ path: '/2', method: 'GET', blocking })
      ])

      assert.strictEqual(r1.statusCode, statusCode)
      assert.strictEqual(await r1.body.text(), '')
      // The second request is sent on a new connection.
      assert.strictEqual(await r2.body.text(), 'REAL')
      assert.strictEqual(connections, 2)
    })
  }

  test(`response ${statusCode} with content-length completes when the connection closes while paused`, async (t) => {
    const server = createRawServer(t, (socket) => {
      socket.once('data', () => {
        socket.end(`HTTP/1.1 ${statusCode} X\r\ncontent-length: 100\r\nconnection: close\r\n\r\n`)
      })
    })
    server.listen(0)
    await once(server, 'listening')

    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => client.destroy())

    const result = await dispatchPaused(client)
    assert.strictEqual(result.statusCode, statusCode)
    assert.strictEqual(result.body, false)
    assert.ifError(result.error)
  })
}

test('response 200 with short body still errors when the connection closes while paused', async (t) => {
  const server = createRawServer(t, (socket) => {
    socket.once('data', () => {
      socket.end('HTTP/1.1 200 OK\r\ncontent-length: 100\r\nconnection: close\r\n\r\n')
    })
  })
  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
  t.after(() => client.destroy())

  const result = await dispatchPaused(client)
  assert.strictEqual(result.error?.code, 'UND_ERR_RES_CONTENT_LENGTH_MISMATCH')
})
