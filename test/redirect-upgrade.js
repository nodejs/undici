'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { upgrade } = require('..')
const { startServer } = require('./utils/redirecting-servers')

test('should upgrade the connection when no redirects are present', async t => {
  t = tspl(t, { plan: 2 })

  const server = await startServer((req, res) => {
    if (req.url === '/') {
      res.statusCode = 301
      res.setHeader('Location', `http://${server}/end`)
      res.end('REDIRECT')
      return
    }

    res.statusCode = 101
    res.setHeader('Connection', 'upgrade')
    res.setHeader('Upgrade', req.headers.upgrade)
    res.end('')
  })

  const { headers, socket } = await upgrade(`http://${server}/`, {
    method: 'GET',
    protocol: 'foo/1',
    maxRedirections: 10
  })

  socket.end()

  t.strictEqual(headers.connection, 'upgrade')
  t.strictEqual(headers.upgrade, 'foo/1')

  await t.completed
})
