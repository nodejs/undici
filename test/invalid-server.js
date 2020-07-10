'use strict'

const { test } = require('tap')
const { Client } = require('..')

test('invalid server response - double response', (t) => {
  t.plan(1)

  // TODO: Remove external dependency.
  const client = new Client('http://feeds.bbci.co.uk')
  t.tearDown(client.close.bind(client))

  client
    .pipeline({
      method: 'GET',
      path: '/news/rss.xml'
    }, ({ body }) => body)
    .end('asd')
    .resume()

  client.on('disconnect', (err) => {
    t.strictEqual(err.message, 'Invalid server response')
  })
})
