'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { createReadStream } = require('node:fs')
const { File, FormData, request } = require('..')

test('undici.request with a FormData body should set content-length header', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    t.ok(req.headers['content-length'])
    res.end()
  }).listen(0)

  after(() => server.close())
  await once(server, 'listening')

  const body = new FormData()
  body.set('file', new File(['abc'], 'abc.txt'))

  await request(`http://localhost:${server.address().port}`, {
    method: 'POST',
    body
  })
})

test('undici.request with a FormData stream value should set transfer-encoding header', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    t.strictEqual(req.headers['transfer-encoding'], 'chunked')
    res.end()
  }).listen(0)

  after(() => server.close())
  await once(server, 'listening')

  class BlobFromStream {
    #stream
    #type
    constructor (stream, type) {
      this.#stream = stream
      this.#type = type
    }

    stream () {
      return this.#stream
    }

    get type () {
      return this.#type
    }

    get [Symbol.toStringTag] () {
      return 'Blob'
    }
  }

  const body = new FormData()
  const fileReadable = createReadStream(__filename)
  body.set('file', new BlobFromStream(fileReadable, '.js'), 'streamfile')

  await request(`http://localhost:${server.address().port}`, {
    method: 'POST',
    body
  })
})
