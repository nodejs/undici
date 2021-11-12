'use strict'

const { readFileSync } = require('fs')
const { join } = require('path')
const https = require('https')
const { test } = require('tap')
const { Client } = require('..')
const { kSocket } = require('../lib/core/symbols')
const nodeMajor = Number(process.versions.node.split('.')[0])

const serverOptions = {
  ca: [
    readFileSync(join(__dirname, 'fixtures', 'client-ca-crt.pem'), 'utf8')
  ],
  key: readFileSync(join(__dirname, 'fixtures', 'key.pem'), 'utf8'),
  cert: readFileSync(join(__dirname, 'fixtures', 'cert.pem'), 'utf8'),
  requestCert: true,
  rejectUnauthorized: false
}

test('Client using valid client certificate', { skip: nodeMajor > 16 }, t => {
  t.plan(5)

  const server = https.createServer(serverOptions, (req, res) => {
    const authorized = req.client.authorized
    t.ok(authorized)

    res.setHeader('Content-Type', 'text/plain')
    res.end('hello')
  })

  server.listen(0, function () {
    const tls = {
      ca: [
        readFileSync(join(__dirname, 'fixtures', 'ca.pem'), 'utf8')
      ],
      key: readFileSync(join(__dirname, 'fixtures', 'client-key.pem'), 'utf8'),
      cert: readFileSync(join(__dirname, 'fixtures', 'client-crt.pem'), 'utf8'),
      rejectUnauthorized: false,
      servername: 'agent1'
    }
    const client = new Client(`https://localhost:${server.address().port}`, {
      connect: tls
    })

    t.teardown(() => {
      client.close()
      server.close()
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { statusCode, body }) => {
      t.error(err)
      t.equal(statusCode, 200)

      const authorized = client[kSocket].authorized
      t.ok(authorized)

      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.equal('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})
