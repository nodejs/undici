'use strict'

const { test } = require('tap')
const { fetch } = require('..')
const { createServer } = require('http')
const nodeMajor = Number(process.versions.node.split('.')[0])

test('fetch', {
  skip: nodeMajor < 16
}, t => {
  t.test('request json', (t) => {
    t.plan(1)

    const obj = { asd: true }
    const server = createServer((req, res) => {
      res.end(JSON.stringify(obj))
    })
    t.teardown(server.close.bind(server))

    server.listen(0, async () => {
      const body = await fetch(`http://localhost:${server.address().port}`)
      t.strictSame(obj, await body.json())
    })
  })

  t.test('request text', (t) => {
    t.plan(1)

    const obj = { asd: true }
    const server = createServer((req, res) => {
      res.end(JSON.stringify(obj))
    })
    t.teardown(server.close.bind(server))

    server.listen(0, async () => {
      const body = await fetch(`http://localhost:${server.address().port}`)
      t.strictSame(JSON.stringify(obj), await body.text())
    })
  })

  t.test('request arrayBuffer', (t) => {
    t.plan(1)

    const obj = { asd: true }
    const server = createServer((req, res) => {
      res.end(JSON.stringify(obj))
    })
    t.teardown(server.close.bind(server))

    server.listen(0, async () => {
      const body = await fetch(`http://localhost:${server.address().port}`)
      t.strictSame(Buffer.from(JSON.stringify(obj)), Buffer.from(await body.arrayBuffer()))
    })
  })

  t.test('should set type of blob object to the value of the `Content-Type` header from response', (t) => {
    t.plan(1)

    const obj = { asd: true }
    const server = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(obj))
    })
    t.teardown(server.close.bind(server))

    server.listen(0, async () => {
      const response = await fetch(`http://localhost:${server.address().port}`)
      t.equal('application/json', (await response.blob()).type)
    })
  })

  t.end()
})
