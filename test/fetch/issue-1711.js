'use strict'

const { once } = require('node:events')
const { createServer } = require('node:http')
const { test } = require('node:test')
const { fetch } = require('../..')

test('Redirecting a bunch does not cause a MaxListenersExceededWarning', async (t) => {
  let redirects = 0

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    if (redirects === 15) {
      res.end('Okay goodbye')
      return
    }

    res.writeHead(302, {
      Location: `/${redirects++}`
    })
    res.end()
  }).listen(0)

  t.after(server.close.bind(server))
  await once(server, 'listening')

  process.emitWarning = t.assert.fail.bind(t)

  const url = `http://localhost:${server.address().port}`
  const response = await fetch(url, { redirect: 'follow' })

  t.assert.deepStrictEqual(response.url, `${url}/${redirects - 1}`)
})

test(
  'aborting a Stream throws',
  () => {
    return new Promise((resolve, reject) => {
      const httpServer = createServer({ joinDuplicateHeaders: true }, (request, response) => {
        response.end(new Uint8Array(20000))
      }).listen(async () => {
        const serverAddress = httpServer.address()

        if (typeof serverAddress === 'object') {
          const abortController = new AbortController()
          const readStream = (await fetch(`http://localhost:${serverAddress?.port}`, { signal: abortController.signal })).arrayBuffer()
          abortController.abort()
          setTimeout(reject)

          try {
            await readStream
          } catch {
            httpServer.close()
            resolve()
          }
        }
      })
    })
  }
)
