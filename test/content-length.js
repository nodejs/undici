'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('http')
const { Readable } = require('stream')
const { maybeWrapStream, consts } = require('./utils/async-iterators')

test('request invalid content-length', (t) => {
  t.plan(10)

  const server = createServer((req, res) => {
    res.end()
  })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'PUT',
      headers: {
        'content-length': 10
      },
      body: 'asd'
    }, (err, data) => {
      t.type(err, errors.RequestContentLengthMismatchError)
    })

    client.request({
      path: '/',
      method: 'PUT',
      headers: {
        'content-length': 10
      },
      body: 'asdasdasdasdasdasda'
    }, (err, data) => {
      t.type(err, errors.RequestContentLengthMismatchError)
    })

    client.request({
      path: '/',
      method: 'PUT',
      headers: {
        'content-length': 10
      },
      body: Buffer.alloc(9)
    }, (err, data) => {
      t.type(err, errors.RequestContentLengthMismatchError)
    })

    client.request({
      path: '/',
      method: 'PUT',
      headers: {
        'content-length': 10
      },
      body: Buffer.alloc(11)
    }, (err, data) => {
      t.type(err, errors.RequestContentLengthMismatchError)
    })

    client.request({
      path: '/',
      method: 'HEAD',
      headers: {
        'content-length': 10
      }
    }, (err, data) => {
      t.type(err, errors.RequestContentLengthMismatchError)
    })

    client.request({
      path: '/',
      method: 'GET',
      headers: {
        'content-length': 0
      }
    }, (err, data) => {
      t.type(err, errors.RequestContentLengthMismatchError)
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
    }, (err, data) => {
      t.type(err, errors.RequestContentLengthMismatchError)
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
    }, (err, data) => {
      t.type(err, errors.RequestContentLengthMismatchError)
    })

    client.request({
      path: '/',
      method: 'GET',
      headers: {
        'content-length': 4
      },
      body: ['asd']
    }, (err, data) => {
      t.type(err, errors.RequestContentLengthMismatchError)
    })

    client.request({
      path: '/',
      method: 'GET',
      headers: {
        'content-length': 4
      },
      body: ['asasdasdasdd']
    }, (err, data) => {
      t.type(err, errors.RequestContentLengthMismatchError)
    })
  })
})

function invalidContentLength (bodyType) {
  test(`request streaming ${bodyType} invalid content-length`, (t) => {
    t.plan(4)

    const server = createServer((req, res) => {
      res.end()
    })
    t.teardown(server.close.bind(server))
    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.teardown(client.destroy.bind(client))

      client.once('disconnect', () => {
        t.pass()
        client.once('disconnect', () => {
          t.pass()
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
        t.type(err, errors.RequestContentLengthMismatchError)
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
        t.type(err, errors.RequestContentLengthMismatchError)
      })
    })
  })
}

invalidContentLength(consts.STREAM)
invalidContentLength(consts.ASYNC_ITERATOR)

function zeroContentLength (bodyType) {
  test(`request ${bodyType} streaming data when content-length=0`, (t) => {
    t.plan(1)

    const server = createServer((req, res) => {
      res.end()
    })
    t.teardown(server.close.bind(server))
    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.teardown(client.destroy.bind(client))

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
        t.type(err, errors.RequestContentLengthMismatchError)
      })
    })
  })
}

zeroContentLength(consts.STREAM)
zeroContentLength(consts.ASYNC_ITERATOR)

test('request streaming no body data when content-length=0', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'PUT',
      headers: {
        'content-length': 0
      }
    }, (err, data) => {
      t.error(err)
      data.body
        .on('data', () => {
          t.fail()
        })
        .on('end', () => {
          t.pass()
        })
    })
  })
})

test('response invalid content length with close', (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.writeHead(200, {
      'content-length': 10
    })
    res.end('123')
  })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 0
    })
    t.teardown(client.destroy.bind(client))

    client.on('disconnect', (origin, client, err) => {
      t.equal(err.code, 'UND_ERR_SOCKET')
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.error(err)
      data.body
        .on('end', () => {
          t.fail()
        })
        .on('error', (err) => {
          t.equal(err.code, 'UND_ERR_SOCKET')
        })
        .resume()
    })
  })
})
