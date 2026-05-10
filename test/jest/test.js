'use strict'

const { LOOPBACK_HOST } = require('../utils/node-http')
const { Client } = require('../..')
const { createServer } = require('node:http')
/* global test, expect */

test('should work in jest', async () => {
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    expect(req.url).toBe('/')
    expect(req.method).toBe('POST')
    expect(req.headers.host).toBe(`${LOOPBACK_HOST}:${server.address().port}`)
    res.setHeader('Content-Type', 'text/plain')
    res.end('hello')
  })
  await expect(new Promise((resolve, reject) => {
    server.listen(0, () => {
      const client = new Client(`http://${LOOPBACK_HOST}:${server.address().port}`)
      client.request({
        path: '/',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: '{}'
      }, (err, result) => {
        server.close()
        client.close()
        if (err) {
          reject(err)
        } else {
          resolve(result.body.text())
        }
      })
    })
  })).resolves.toBe('hello')
})
