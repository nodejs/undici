'use strict'

const assert = require('node:assert')
const { test } = require('node:test')
const { createServer } = require('node:http')
const { fetch } = require('../..')
const { closeServerAsPromise } = require('../utils/node-http')
const { promisify } = require('node:util')

test('after redirecting the url of the response is set to the target url', async (t) => {
  // redirect-1 -> redirect-2 -> target
  const server = createServer((req, res) => {
    switch (res.req.url) {
      case '/redirect-1':
        res.writeHead(302, undefined, { Location: '/redirect-2' })
        res.end()
        break
      case '/redirect-2':
        res.writeHead(302, undefined, { Location: '/redirect-3' })
        res.end()
        break
      case '/redirect-3':
        res.writeHead(302, undefined, { Location: '/target' })
        res.end()
        break
      case '/target':
        res.writeHead(200, 'dummy', { 'Content-Type': 'text/plain' })
        res.end()
        break
    }
  })
  t.after(closeServerAsPromise(server))

  const listenAsync = promisify(server.listen.bind(server))
  await listenAsync(0)
  const { port } = server.address()
  const response = await fetch(`http://127.0.0.1:${port}/redirect-1`)

  assert.strictEqual(response.url, `http://127.0.0.1:${port}/target`)
})

test('location header with non-ASCII character redirects to a properly encoded url', async (t) => {
  // redirect -> %EC%95%88%EB%85%95 (안녕), not %C3%AC%C2%95%C2%88%C3%AB%C2%85%C2%95
  const server = createServer((req, res) => {
    if (res.req.url.endsWith('/redirect')) {
      res.writeHead(302, undefined, { Location: `/${Buffer.from('안녕').toString('binary')}` })
      res.end()
    } else {
      res.writeHead(200, 'dummy', { 'Content-Type': 'text/plain' })
      res.end()
    }
  })
  t.after(closeServerAsPromise(server))

  const listenAsync = promisify(server.listen.bind(server))
  await listenAsync(0)
  const { port } = server.address()
  const response = await fetch(`http://127.0.0.1:${port}/redirect`)

  assert.strictEqual(response.url, `http://127.0.0.1:${port}/${encodeURIComponent('안녕')}`)
})
