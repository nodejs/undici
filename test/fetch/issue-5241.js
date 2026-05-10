'use strict'

const { LOOPBACK_HOST } = require('../utils/node-http')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { test } = require('node:test')
const {
  fetch,
  FormData,
  MockAgent,
  getGlobalDispatcher,
  setGlobalDispatcher
} = require('../..')

// https://github.com/nodejs/undici/issues/5241
test('MockAgent net connect keeps multipart boundaries in sync with fetch headers', async (t) => {
  let requestBody = null
  let contentType = null

  const server = createServer((req, res) => {
    const chunks = []

    req.on('data', chunk => {
      chunks.push(chunk)
    })

    req.on('end', () => {
      requestBody = Buffer.concat(chunks).toString('utf8')
      contentType = req.headers['content-type']

      res.writeHead(200, {
        'content-type': 'application/json'
      })
      res.end('{}')
    })
  })

  t.after(() => {
    server.closeAllConnections?.()
    server.close()
  })

  await once(server.listen(0), 'listening')

  const previousDispatcher = getGlobalDispatcher()
  const mockAgent = new MockAgent()
  const origin = `http://${LOOPBACK_HOST}:${server.address().port}`

  mockAgent.enableNetConnect(`${LOOPBACK_HOST}:${server.address().port}`)
  setGlobalDispatcher(mockAgent)

  t.after(async () => {
    setGlobalDispatcher(previousDispatcher)
    await mockAgent.close()
  })

  const form = new FormData()
  form.append('file', new Blob([Buffer.from('hello world')], { type: 'text/plain' }), 'document.txt')

  const response = await fetch(origin, {
    method: 'POST',
    body: form
  })

  t.assert.strictEqual(response.status, 200)
  t.assert.deepStrictEqual(await response.json(), {})

  t.assert.ok(contentType.startsWith('multipart/form-data; boundary='))

  const boundary = contentType.slice(contentType.indexOf('boundary=') + 'boundary='.length)

  t.assert.strictEqual(requestBody.split('\r\n', 1)[0], `--${boundary}`)
  t.assert.ok(requestBody.includes(`\r\n--${boundary}--\r\n`))
})
