'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { ok } = require('node:assert')
const { test, after, describe } = require('node:test')
const { Client } = require('..')
const { createServer } = require('node:http')
const { Readable } = require('node:stream')
const { wrapWithAsyncIterable } = require('./utils/async-iterators')

describe('strictContentLength: false', () => {
  const emitWarningOriginal = process.emitWarning
  let emitWarningCalled = false

  process.emitWarning = function () {
    emitWarningCalled = true
  }

  function assertEmitWarningCalledAndReset () {
    ok(emitWarningCalled)
    emitWarningCalled = false
  }

  after(() => {
    process.emitWarning = emitWarningOriginal
  })

  test('request invalid content-length', async (t) => {
    t = tspl(t, { plan: 8 })

    const server = createServer((req, res) => {
      res.end()
    })
    after(() => server.close())

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        strictContentLength: false
      })
      after(() => client.close())

      client.request({
        path: '/',
        method: 'PUT',
        headers: {
          'content-length': 10
        },
        body: 'asd'
      }, (err, data) => {
        assertEmitWarningCalledAndReset()
        t.ifError(err)
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
        t.ifError(err)
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
        t.ifError(err)
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
        t.ifError(err)
      })

      client.request({
        path: '/',
        method: 'HEAD',
        headers: {
          'content-length': 10
        }
      }, (err, data) => {
        t.ifError(err)
      })

      client.request({
        path: '/',
        method: 'GET',
        headers: {
          'content-length': 0
        }
      }, (err, data) => {
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
      }, (err, data) => {
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
      }, (err, data) => {
        t.ifError(err)
      })
    })

    await t.completed
  })

  test('request streaming content-length less than body size', async (t) => {
    t = tspl(t, { plan: 1 })

    const server = createServer((req, res) => {
      res.end()
    })
    after(() => server.close())

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        strictContentLength: false
      })
      after(() => client.close())

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
        t.ifError(err)
      })
    })

    await t.completed
  })

  test('request streaming content-length greater than body size', async (t) => {
    t = tspl(t, { plan: 1 })

    const server = createServer((req, res) => {
      res.end()
    })
    after(() => server.close())

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        strictContentLength: false
      })
      after(() => client.close())

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
        t.ifError(err)
      })
    })

    await t.completed
  })

  test('request streaming data when content-length=0', async (t) => {
    t = tspl(t, { plan: 1 })

    const server = createServer((req, res) => {
      res.end()
    })
    after(() => server.close())

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        strictContentLength: false
      })
      after(() => client.close())

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
        t.ifError(err)
      })
    })

    await t.completed
  })

  test('request async iterating content-length less than body size', async (t) => {
    t = tspl(t, { plan: 1 })

    const server = createServer((req, res) => {
      res.end()
    })
    after(() => server.close())

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        strictContentLength: false
      })
      after(() => client.close())

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
        t.ifError(err)
      })
    })

    await t.completed
  })

  test('request async iterator content-length greater than body size', async (t) => {
    t = tspl(t, { plan: 1 })

    const server = createServer((req, res) => {
      res.end()
    })
    after(() => server.close())

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        strictContentLength: false
      })
      after(() => client.close())

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
        t.ifError(err)
      })
    })
    await t.completed
  })

  test('request async iterator data when content-length=0', async (t) => {
    t = tspl(t, { plan: 1 })

    const server = createServer((req, res) => {
      res.end()
    })
    after(() => server.close())

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        strictContentLength: false
      })
      after(() => client.close())

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
        t.ifError(err)
      })
    })
    await t.completed
  })
})
