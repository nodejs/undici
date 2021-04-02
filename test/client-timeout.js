'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('http')

test('refresh timeout on pause', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.flushHeaders()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 500
    })
    t.tearDown(client.destroy.bind(client))

    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onConnect () {
      },
      onHeaders (statusCode, headers, resume) {
        setTimeout(() => {
          resume()
        }, 1000)
        return false
      },
      onData () {

      },
      onComplete () {

      },
      onError (err) {
        t.ok(err instanceof errors.BodyTimeoutError)
      }
    })
  })
})
