'use strict'

const tap = require('tap')
const { Client } = require('..')
const { createServer } = require('node:http')
const { Readable } = require('node:stream')
const sinon = require('sinon')
const { wrapWithAsyncIterable } = require('./utils/async-iterators')

tap.test('strictContentLength: false', (t) => {
  t.plan(7)

  const emitWarningStub = sinon.stub(process, 'emitWarning')

  function assertEmitWarningCalledAndReset () {
    sinon.assert.called(emitWarningStub)
    emitWarningStub.resetHistory()
  }

  t.teardown(() => {
    emitWarningStub.restore()
  })

  t.test('request invalid content-length', (t) => {
    t.plan(8)

    const server = createServer((req, res) => {
      res.end()
    })
    t.teardown(server.close.bind(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        strictContentLength: false
      })
      t.teardown(client.close.bind(client))

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 10
        },
        body: 'asd'
      }, (err, data) => {
        assertEmitWarningCalledAndReset()
        t.error(err)
      })

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 10
        },
        body: 'asdasdasdasdasdasda'
      }, (err, data) => {
        assertEmitWarningCalledAndReset()
        t.error(err)
      })

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 10
        },
        body: Buffer.alloc(9)
      }, (err, data) => {
        assertEmitWarningCalledAndReset()
        t.error(err)
      })

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 10
        },
        body: Buffer.alloc(11)
      }, (err, data) => {
        assertEmitWarningCalledAndReset()
        t.error(err)
      })

      client.request({
        path: '/',
        method: 'HEAD',
        headers: {
          'content-length': 10
        }
      }, (err, data) => {
        t.error(err)
      })

      client.request({
        path: '/',
        method: 'GET',
        headers: {
          'content-length': 0
        }
      }, (err, data) => {
        t.error(err)
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
        t.error(err)
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
        t.error(err)
      })
    })
  })

  t.test('request streaming content-length less than body size', (t) => {
    t.plan(1)

    const server = createServer((req, res) => {
      res.end()
    })
    t.teardown(server.close.bind(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        strictContentLength: false
      })
      t.teardown(client.close.bind(client))

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 2
        },
        body: new Readable({
          read () {
            setImmediate(() => {
              this.push('abcd')
              this.push(null)
            })
          }
        })
      }, (err) => {
        assertEmitWarningCalledAndReset()
        t.error(err)
      })
    })
  })

  t.test('request streaming content-length greater than body size', (t) => {
    t.plan(1)

    const server = createServer((req, res) => {
      res.end()
    })
    t.teardown(server.close.bind(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        strictContentLength: false
      })
      t.teardown(client.close.bind(client))

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 10
        },
        body: new Readable({
          read () {
            setImmediate(() => {
              this.push('abcd')
              this.push(null)
            })
          }
        })
      }, (err) => {
        assertEmitWarningCalledAndReset()
        t.error(err)
      })
    })
  })

  t.test('request streaming data when content-length=0', (t) => {
    t.plan(1)

    const server = createServer((req, res) => {
      res.end()
    })
    t.teardown(server.close.bind(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        strictContentLength: false
      })
      t.teardown(client.close.bind(client))

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 0
        },
        body: new Readable({
          read () {
            setImmediate(() => {
              this.push('asdasdasdkajsdnasdkjasnd')
              this.push(null)
            })
          }
        })
      }, (err) => {
        assertEmitWarningCalledAndReset()
        t.error(err)
      })
    })
  })

  t.test('request async iterating content-length less than body size', (t) => {
    t.plan(1)

    const server = createServer((req, res) => {
      res.end()
    })
    t.teardown(server.close.bind(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        strictContentLength: false
      })
      t.teardown(client.close.bind(client))

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 2
        },
        body: wrapWithAsyncIterable(new Readable({
          read () {
            setImmediate(() => {
              this.push('abcd')
              this.push(null)
            })
          }
        }))
      }, (err) => {
        assertEmitWarningCalledAndReset()
        t.error(err)
      })
    })
  })

  t.test('request async iterator content-length greater than body size', (t) => {
    t.plan(1)

    const server = createServer((req, res) => {
      res.end()
    })
    t.teardown(server.close.bind(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        strictContentLength: false
      })
      t.teardown(client.close.bind(client))

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 10
        },
        body: wrapWithAsyncIterable(new Readable({
          read () {
            setImmediate(() => {
              this.push('abcd')
              this.push(null)
            })
          }
        }))
      }, (err) => {
        assertEmitWarningCalledAndReset()
        t.error(err)
      })
    })
  })

  t.test('request async iterator data when content-length=0', (t) => {
    t.plan(1)

    const server = createServer((req, res) => {
      res.end()
    })
    t.teardown(server.close.bind(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        strictContentLength: false
      })
      t.teardown(client.close.bind(client))

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 0
        },
        body: wrapWithAsyncIterable(new Readable({
          read () {
            setImmediate(() => {
              this.push('asdasdasdkajsdnasdkjasnd')
              this.push(null)
            })
          }
        }))
      }, (err) => {
        assertEmitWarningCalledAndReset()
        t.error(err)
      })
    })
  })
})
