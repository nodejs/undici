'use strict'

const { test } = require('tap')
const { createServer } = require('https')
const nodeMajor = Number(process.versions.node.split('.')[0])
const pem = require('https-pem')

test('fetch', {
  skip: nodeMajor < 16
}, t => {
  const { fetch, setGlobalDispatcher, Agent } = require('..')

  setGlobalDispatcher(new Agent({
    connect: {
      rejectUnauthorized: false
    }
  }))

  t.test('request json', (t) => {
    t.plan(1)

    const obj = { asd: true }
    const server = createServer(pem, (req, res) => {
      res.end(JSON.stringify(obj))
    })
    t.teardown(server.close.bind(server))

    server.listen(0, async () => {
      const body = await fetch(`https://localhost:${server.address().port}`)
      t.strictSame(obj, await body.json())
    })
  })

  t.test('request text', (t) => {
    t.plan(1)

    const obj = { asd: true }
    const server = createServer(pem, (req, res) => {
      res.end(JSON.stringify(obj))
    })
    t.teardown(server.close.bind(server))

    server.listen(0, async () => {
      const body = await fetch(`https://localhost:${server.address().port}`)
      t.strictSame(JSON.stringify(obj), await body.text())
    })
  })

  t.test('request arrayBuffer', (t) => {
    t.plan(1)

    const obj = { asd: true }
    const server = createServer(pem, (req, res) => {
      res.end(JSON.stringify(obj))
    })
    t.teardown(server.close.bind(server))

    server.listen(0, async () => {
      const body = await fetch(`https://localhost:${server.address().port}`)
      t.strictSame(Buffer.from(JSON.stringify(obj)), Buffer.from(await body.arrayBuffer()))
    })
  })

  t.test('should set type of blob object to the value of the `Content-Type` header from response', (t) => {
    t.plan(1)

    const obj = { asd: true }
    const server = createServer(pem, (req, res) => {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(obj))
    })
    t.teardown(server.close.bind(server))

    server.listen(0, async () => {
      const response = await fetch(`https://localhost:${server.address().port}`)
      t.equal('application/json', (await response.blob()).type)
    })
  })

  t.end()
})
