'use strict'

const { test, after } = require('node:test')
const { Client } = require('..')
const { createServer } = require('node:http')

test('response trailers missing is OK', (t, done) => {
  t.plan(1)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
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

    t.assert.strictEqual(await body.text(), 'response')
    done()
  })
})

test('response trailers missing w trailers is OK', (t, done) => {
  t.plan(2)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
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

    t.assert.strictEqual(await body.text(), 'response')
    t.assert.deepStrictEqual(trailers, { asd: 'foo' })
    done()
  })
})
