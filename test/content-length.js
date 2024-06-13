'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Client, errors } = require('..')
const { createServer } = require('node:http')
const { Readable } = require('node:stream')
const { maybeWrapStream, consts } = require('./utils/async-iterators')

test('request invalid content-length', async (t) => {
  t = tspl(t, { plan: 7 })

  const server = createServer((req, res) => {
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

    const server = createServer((req, res) => {
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

    const server = createServer((req, res) => {
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

  const server = createServer((req, res) => {
    req.pipe(res)
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

  const server = createServer((req, res) => {
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
  const server = createServer((req, res) => {
    req.pipe(res)
  })
  after(() => server.close())
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

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
  const server = createServer((req, res) => {
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

  const server = createServer((req, res) => {
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
