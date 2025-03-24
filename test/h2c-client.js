const { createServer } = require('node:http2')
const { once } = require('node:events')
const { test } = require('node:test')

const { tspl } = require('@matteo.collina/tspl')

const { H2CClient } = require('..')

test('Should support h2c connection', async t => {
  const planner = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.writeHead(200)
    res.end('Hello, world!')
  })

  server.listen()
  await once(server, 'listening')
  const client = new H2CClient(`http://localhost:${server.address().port}/`)

  t.after(() => client.close())
  t.after(() => server.close())

  const response = await client.request({ path: '/', method: 'GET' })
  planner.equal(response.statusCode, 200)
  planner.equal(await response.body.text(), 'Hello, world!')
})
