'use strict'

const { Client } = require('../..')
const { createServer } = require('http')
/* global test, expect */

test('should work in jest', async () => {
  const server = createServer((req, res) => {
    expect(req.url).toBe('/')
    expect(req.method).toBe('POST')
    expect(req.headers.host).toBe('localhost')
    res.setHeader('Content-Type', 'text/plain')
    res.end('hello')
  })
  await new Promise((resolve, reject) => {
    server.listen(0, async () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      client.request({
        path: '/',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: '{}'
      }, async (err, result) => {
        server.close()
        client.close()
        if (err) {
          reject(err)
        } else {
          resolve(result)
        }
      })
    })
  })
})
