'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')

const { interceptors, Agent } = require('../..')
const { dns } = interceptors

test('Should automatically resolve IPs', async t => {
  t = tspl(t, { plan: 2 })

  const server = createServer()
  const requestOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }

  server.on('request', (req, res) => {
    // t.equa(req.headers.host, )
    console.log(req.headers.host)
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello world!')
  })

  server.listen(0)

  await once(server, 'listening')
  console.log(server.address())

  const client = new Agent().compose(dns())

  after(async () => {
    await client.close()
    server.close()

    await once(server, 'close')
  })

  const response = await client.request({
    ...requestOptions,
    origin: `http://localhost:${server.address().port}`
  })

  t.equal(response.statusCode, 200)
  t.equal(await response.body.text(), 'hello world!')
})
