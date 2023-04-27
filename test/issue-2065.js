'use strict'

const { test, skip } = require('tap')
const { nodeMajor, nodeMinor } = require('../lib/core/util')
const { createServer } = require('http')
const { once } = require('events')
const { createReadStream } = require('fs')
const { File, FormData, request } = require('..')

if (nodeMajor < 16 || (nodeMajor === 16 && nodeMinor < 8)) {
  skip('FormData is not available in node < v16.8.0')
  process.exit()
}

test('undici.request with a FormData body should set content-length header', async (t) => {
  const server = createServer((req, res) => {
    t.ok(req.headers['content-length'])
    res.end()
  }).listen(0)

  t.teardown(server.close.bind(server))
  await once(server, 'listening')

  const body = new FormData()
  body.set('file', new File(['abc'], 'abc.txt'))

  await request(`http://localhost:${server.address().port}`, {
    method: 'POST',
    body
  })
})

test('undici.request with a FormData stream value should set transfer-encoding header', async (t) => {
  const server = createServer((req, res) => {
    t.equal(req.headers['transfer-encoding'], 'chunked')
    res.end()
  }).listen(0)

  t.teardown(server.close.bind(server))
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
