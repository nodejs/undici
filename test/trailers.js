'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Client } = require('..')
const { createServer } = require('node:http')

test('response trailers missing is OK', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.writeHead(200, {
      Trailer: 'content-length'
    })
    res.end('response')
  })
  after(() => server.close())
  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())
    const { body } = await client.request({
      path: '/',
      method: 'GET',
      body: 'asd'
    })

    t.strictEqual(await body.text(), 'response')
  })

  await t.completed
})

test('response trailers missing w trailers is OK', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.writeHead(200, {
      Trailer: 'content-length'
    })
    res.addTrailers({
      asd: 'foo'
    })
    res.end('response')
  })
  after(() => server.close())
  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())
    const { body, trailers } = await client.request({
      path: '/',
      method: 'GET',
      body: 'asd'
    })

    t.strictEqual(await body.text(), 'response')
    t.deepStrictEqual(trailers, { asd: 'foo' })
  })

  await t.completed
})
