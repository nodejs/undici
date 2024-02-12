'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { once } = require('node:events')
const { Client } = require('..')
const { createServer } = require('node:http')
const { Readable } = require('node:stream')

test('socket close listener does not leak', async (t) => {
  t = tspl(t, { plan: 32 })

  const server = createServer()

  server.on('request', (req, res) => {
    res.end('hello')
  })
  after(() => server.close())

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
    t.ifError(err)
    data.body.on('end', () => t.ok(true, 'pass')).resume()
  }

  function onWarning (warning) {
    if (!/ExperimentalWarning/.test(warning)) {
      t.fail()
    }
  }
  process.on('warning', onWarning)
  after(() => {
    process.removeListener('warning', onWarning)
  })

  server.listen(0)

  await once(server, 'listening')
  const client = new Client(`http://localhost:${server.address().port}`)
  after(() => client.destroy())

  for (let n = 0; n < 16; ++n) {
    client.request({ path: '/', method: 'GET', body: makeBody() }, onRequest)
  }

  await t.completed
})
