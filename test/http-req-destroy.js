'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const undici = require('..')
const { createServer } = require('node:http')
const { Readable } = require('node:stream')
const { maybeWrapStream, consts } = require('./utils/async-iterators')

function doNotKillReqSocket (bodyType) {
  test(`do not kill req socket ${bodyType}`, async (t) => {
    t = tspl(t, { plan: 3 })

    const server1 = createServer((req, res) => {
      const client = new undici.Client(`http://localhost:${server2.address().port}`)
      after(() => client.close())
      client.request({
        path: '/',
        method: 'POST',
        body: req
      }, (err, response) => {
        t.ifError(err)
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
    after(() => server1.close())

    const server2 = createServer((req, res) => {
      setTimeout(() => {
        req.pipe(res)
      }, 100)
    })
    after(() => server2.close())

    server1.listen(0, () => {
      const client = new undici.Client(`http://localhost:${server1.address().port}`)
      after(() => client.close())

      const r = new Readable({ read () {} })
      r.push('hello')
      client.request({
        path: '/',
        method: 'POST',
        body: maybeWrapStream(r, bodyType)
      }, (err, response) => {
        t.ifError(err)
        const bufs = []
        response.body.on('data', (buf) => {
          bufs.push(buf)
          r.push(null)
        })
        response.body.on('end', () => {
          t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
        })
      })
    })

    server2.listen(0)

    await t.completed
  })
}

doNotKillReqSocket(consts.STREAM)
doNotKillReqSocket(consts.ASYNC_ITERATOR)
