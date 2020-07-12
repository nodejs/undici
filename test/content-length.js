'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('http')
const { Readable } = require('stream')

test('invalid content-length', (t) => {
  t.plan(8)

  const server = createServer((req, res) => {
    res.end()
  })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.on('disconnect', () => {
      t.fail()
    })

    client.request({
      path: '/',
      method: 'PUT',
      headers: {
        'content-length': 10
      },
      body: 'asd'
    }, (err, data) => {
      t.ok(err instanceof errors.ContentLengthMismatch)
    })

    client.request({
      path: '/',
      method: 'PUT',
      headers: {
        'content-length': 10
      },
      body: 'asdasdasdasdasdasda'
    }, (err, data) => {
      t.ok(err instanceof errors.ContentLengthMismatch)
    })

    client.request({
      path: '/',
      method: 'PUT',
      headers: {
        'content-length': 10
      },
      body: Buffer.alloc(9)
    }, (err, data) => {
      t.ok(err instanceof errors.ContentLengthMismatch)
    })

    client.request({
      path: '/',
      method: 'PUT',
      headers: {
        'content-length': 10
      },
      body: Buffer.alloc(11)
    }, (err, data) => {
      t.ok(err instanceof errors.ContentLengthMismatch)
    })

    client.request({
      path: '/',
      method: 'HEAD',
      headers: {
        'content-length': 10
      }
    }, (err, data) => {
      t.ok(err instanceof errors.ContentLengthMismatch)
    })

    client.request({
      path: '/',
      method: 'GET',
      headers: {
        'content-length': 0
      }
    }, (err, data) => {
      t.ok(err instanceof errors.ContentLengthMismatch)
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
      t.ok(err instanceof errors.ContentLengthMismatch)
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
      t.ok(err instanceof errors.ContentLengthMismatch)
    })
  })
})

test('streaming invalid content-length', (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    res.end()
  })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.on('disconnect', () => {
      t.pass()
    })

    client.request({
      path: '/',
      method: 'PUT',
      headers: {
        'content-length': 10
      },
      body: new Readable({
        read () {
          setImmediate(() => {
            this.push('asdasdasdkajsdnasdkjasnd')
            this.push(null)
          })
        }
      })
    }, (err, data) => {
      t.ok(err instanceof errors.ContentLengthMismatch)
    })

    client.request({
      path: '/',
      method: 'PUT',
      headers: {
        'content-length': 10
      },
      body: new Readable({
        read () {
          setImmediate(() => {
            this.push('asd')
            this.push(null)
          })
        }
      })
    }, (err, data) => {
      t.ok(err instanceof errors.ContentLengthMismatch)
    })
  })
})
