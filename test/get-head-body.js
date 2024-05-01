'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Client } = require('..')
const { createServer } = require('node:http')
const { Readable } = require('node:stream')
const { kConnect } = require('../lib/core/symbols')
const { kBusy } = require('../lib/core/symbols')
const { wrapWithAsyncIterable } = require('./utils/async-iterators')

test('GET and HEAD with body should reset connection', async (t) => {
  t = tspl(t, { plan: 8 + 2 })

  const server = createServer((req, res) => {
    res.end('asd')
  })

  after(() => server.close())
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    client.on('disconnect', () => {
      t.ok(true, 'pass')
    })

    client.request({
      path: '/',
      body: 'asd',
      method: 'GET'
    }, (err, data) => {
      t.ifError(err)
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
      t.ifError(err)
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
      t.ifError(err)
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
      t.ifError(err)
      data.body.resume()
    })

    client.request({
      path: '/',
      body: [],
      method: 'GET'
    }, (err, data) => {
      t.ifError(err)
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
      t.ifError(err)
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
      t.ifError(err)
      data.body.resume()
    })
  })

  await t.completed
})

// TODO: Avoid external dependency.
// test('GET with body should work when target parses body as request', async (t) => {
//   t = tspl(t, { plan: 4 })

//   // This URL will send double responses when receiving a
//   // GET request with body.
//   const client = new Client('http://feeds.bbci.co.uk')
//   after(() => client.close())

//   client.request({ method: 'GET', path: '/news/rss.xml', body: 'asd' }, (err, data) => {
//     t.ifError(err)
//     t.strictEqual(data.statusCode, 200)
//     data.body.resume()
//   })
//   client.request({ method: 'GET', path: '/news/rss.xml', body: 'asd' }, (err, data) => {
//     t.ifError(err)
//     t.strictEqual(data.statusCode, 200)
//     data.body.resume()
//   })

// await t.completed
// })

test('HEAD should reset connection', async (t) => {
  t = tspl(t, { plan: 8 })

  const server = createServer((req, res) => {
    res.end('asd')
  })

  after(() => server.close())
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    client.once('disconnect', () => {
      t.ok(true, 'pass')
    })

    client.request({
      path: '/',
      method: 'HEAD'
    }, (err, data) => {
      t.ifError(err)
      data.body.resume()
    })
    t.strictEqual(client[kBusy], true)

    client.request({
      path: '/',
      method: 'HEAD'
    }, (err, data) => {
      t.ifError(err)
      data.body.resume()
      client.once('disconnect', () => {
        client[kConnect](() => {
          client.request({
            path: '/',
            method: 'HEAD'
          }, (err, data) => {
            t.ifError(err)
            data.body.resume()
            data.body.on('end', () => {
              t.ok(true, 'pass')
            })
          })
          t.strictEqual(client[kBusy], true)
        })
      })
    })
    t.strictEqual(client[kBusy], true)
  })

  await t.completed
})
