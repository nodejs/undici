'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('node:http')
const { Readable } = require('node:stream')

test('socket close listener does not leak', (t) => {
  t.plan(32)

  const server = createServer()

  server.on('request', (req, res) => {
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  const makeBody = () => {
    return new Readable({
      read () {
        process.nextTick(() => {
          this.push(null)
        })
      }
    })
  }

  const onRequest = (err, data) => {
    t.error(err)
    data.body.on('end', () => t.ok(true, 'pass')).resume()
  }

  function onWarning (warning) {
    if (!/ExperimentalWarning/.test(warning)) {
      t.fail()
    }
  }
  process.on('warning', onWarning)
  t.teardown(() => {
    process.removeListener('warning', onWarning)
  })

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    for (let n = 0; n < 16; ++n) {
      client.request({ path: '/', method: 'GET', body: makeBody() }, onRequest)
    }
  })
})
