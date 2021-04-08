'use strict'

const t = require('tap')
const { upgrade } = require('..')
const { startServer } = require('./utils/redirecting-servers')

t.test('should upgrade the connection when no redirects are present', async t => {
  t.plan(2)

  const server = await startServer(t, (req, res) => {
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

  t.equal(headers.connection, 'upgrade')
  t.equal(headers.upgrade, 'foo/1')
})
