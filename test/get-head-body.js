'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('node:http')
const { Readable } = require('node:stream')
const { kConnect } = require('../lib/core/symbols')
const { kBusy } = require('../lib/core/symbols')
const { wrapWithAsyncIterable } = require('./utils/async-iterators')

test('GET and HEAD with body should reset connection', (t) => {
  t.plan(8 + 2)

  const server = createServer((req, res) => {
    res.end('asd')
  })

  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.on('disconnect', () => {
      t.ok(true, 'pass')
    })

    client.request({
      path: '/',
      body: 'asd',
      method: 'GET'
    }, (err, data) => {
      t.error(err)
      data.body.resume()
    })

    const emptyBody = new Readable({
      read () {}
    })
    emptyBody.push(null)
    client.request({
      path: '/',
      body: emptyBody,
      method: 'GET'
    }, (err, data) => {
      t.error(err)
      data.body.resume()
    })

    client.request({
      path: '/',
      body: new Readable({
        read () {
          this.push(null)
        }
      }),
      method: 'GET'
    }, (err, data) => {
      t.error(err)
      data.body.resume()
    })

    client.request({
      path: '/',
      body: new Readable({
        read () {
          this.push('asd')
          this.push(null)
        }
      }),
      method: 'GET'
    }, (err, data) => {
      t.error(err)
      data.body.resume()
    })

    client.request({
      path: '/',
      body: [],
      method: 'GET'
    }, (err, data) => {
      t.error(err)
      data.body.resume()
    })

    client.request({
      path: '/',
      body: wrapWithAsyncIterable(new Readable({
        read () {
          this.push(null)
        }
      })),
      method: 'GET'
    }, (err, data) => {
      t.error(err)
      data.body.resume()
    })

    client.request({
      path: '/',
      body: wrapWithAsyncIterable(new Readable({
        read () {
          this.push('asd')
          this.push(null)
        }
      })),
      method: 'GET'
    }, (err, data) => {
      t.error(err)
      data.body.resume()
    })
  })
})

// TODO: Avoid external dependency.
// test('GET with body should work when target parses body as request', (t) => {
//   t.plan(4)

//   // This URL will send double responses when receiving a
//   // GET request with body.
//   const client = new Client('http://feeds.bbci.co.uk')
//   t.teardown(client.close.bind(client))

//   client.request({ method: 'GET', path: '/news/rss.xml', body: 'asd' }, (err, data) => {
//     t.error(err)
//     t.equal(data.statusCode, 200)
//     data.body.resume()
//   })
//   client.request({ method: 'GET', path: '/news/rss.xml', body: 'asd' }, (err, data) => {
//     t.error(err)
//     t.equal(data.statusCode, 200)
//     data.body.resume()
//   })
// })

test('HEAD should reset connection', (t) => {
  t.plan(8)

  const server = createServer((req, res) => {
    res.end('asd')
  })

  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.once('disconnect', () => {
      t.ok(true, 'pass')
    })

    client.request({
      path: '/',
      method: 'HEAD'
    }, (err, data) => {
      t.error(err)
      data.body.resume()
    })
    t.equal(client[kBusy], true)

    client.request({
      path: '/',
      method: 'HEAD'
    }, (err, data) => {
      t.error(err)
      data.body.resume()
      client.once('disconnect', () => {
        client[kConnect](() => {
          client.request({
            path: '/',
            method: 'HEAD'
          }, (err, data) => {
            t.error(err)
            data.body.resume()
            data.body.on('end', () => {
              t.ok(true, 'pass')
            })
          })
          t.equal(client[kBusy], true)
        })
      })
    })
    t.equal(client[kBusy], true)
  })
})
