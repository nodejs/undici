'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('node:http')

test('max response size', (t) => {
  t.plan(4)

  t.test('default max default size should allow all responses', (t) => {
    t.plan(3)

    const server = createServer()
    t.teardown(server.close.bind(server))

    server.on('request', (req, res) => {
      res.end('hello')
    })

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, { maxResponseSize: -1 })
      t.teardown(client.close.bind(client))

      client.request({ path: '/', method: 'GET' }, (err, { statusCode, body }) => {
        t.error(err)
        t.equal(statusCode, 200)
        const bufs = []
        body.on('data', (buf) => {
          bufs.push(buf)
        })
        body.on('end', () => {
          t.equal('hello', Buffer.concat(bufs).toString('utf8'))
        })
      })
    })
  })

  t.test('max response size set to zero should allow only empty responses', (t) => {
    t.plan(3)

    const server = createServer()
    t.teardown(server.close.bind(server))

    server.on('request', (req, res) => {
      res.end()
    })

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, { maxResponseSize: 0 })
      t.teardown(client.close.bind(client))

      client.request({ path: '/', method: 'GET' }, (err, { statusCode, body }) => {
        t.error(err)
        t.equal(statusCode, 200)
        const bufs = []
        body.on('data', (buf) => {
          bufs.push(buf)
        })
        body.on('end', () => {
          t.equal('', Buffer.concat(bufs).toString('utf8'))
        })
      })
    })
  })

  t.test('should throw an error if the response is too big', (t) => {
    t.plan(3)

    const server = createServer()
    t.teardown(server.close.bind(server))

    server.on('request', (req, res) => {
      res.end('hello')
    })

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        maxResponseSize: 1
      })

      t.teardown(client.close.bind(client))

      client.request({ path: '/', method: 'GET' }, (err, { body }) => {
        t.error(err)
        body.on('error', (err) => {
          t.ok(err)
          t.type(err, errors.ResponseExceededMaxSizeError)
        })
      })
    })
  })

  t.test('invalid max response size should throw an error', (t) => {
    t.plan(2)

    t.throws(() => {
      // eslint-disable-next-line no-new
      new Client('http://localhost:3000', { maxResponseSize: 'hello' })
    }, 'maxResponseSize must be a number')
    t.throws(() => {
      // eslint-disable-next-line no-new
      new Client('http://localhost:3000', { maxResponseSize: -2 })
    }, 'maxResponseSize must be greater than or equal to -1')
  })
})
