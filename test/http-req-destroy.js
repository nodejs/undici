'use strict'

const { test } = require('tap')
const undici = require('..')
const { createServer } = require('node:http')
const { Readable } = require('node:stream')
const { maybeWrapStream, consts } = require('./utils/async-iterators')

function doNotKillReqSocket (bodyType) {
  test(`do not kill req socket ${bodyType}`, (t) => {
    t.plan(3)

    const server1 = createServer((req, res) => {
      const client = new undici.Client(`http://localhost:${server2.address().port}`)
      t.teardown(client.close.bind(client))
      client.request({
        path: '/',
        method: 'POST',
        body: req
      }, (err, response) => {
        t.error(err)
        setTimeout(() => {
          response.body.on('data', buf => {
            res.write(buf)
            setTimeout(() => {
              res.end()
            }, 100)
          })
        }, 100)
      })
    })
    t.teardown(server1.close.bind(server1))

    const server2 = createServer((req, res) => {
      setTimeout(() => {
        req.pipe(res)
      }, 100)
    })
    t.teardown(server2.close.bind(server2))

    server1.listen(0, () => {
      const client = new undici.Client(`http://localhost:${server1.address().port}`)
      t.teardown(client.close.bind(client))

      const r = new Readable({ read () {} })
      r.push('hello')
      client.request({
        path: '/',
        method: 'POST',
        body: maybeWrapStream(r, bodyType)
      }, (err, response) => {
        t.error(err)
        const bufs = []
        response.body.on('data', (buf) => {
          bufs.push(buf)
          r.push(null)
        })
        response.body.on('end', () => {
          t.equal('hello', Buffer.concat(bufs).toString('utf8'))
        })
      })
    })

    server2.listen(0)
  })
}

doNotKillReqSocket(consts.STREAM)
doNotKillReqSocket(consts.ASYNC_ITERATOR)
