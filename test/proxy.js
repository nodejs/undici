'use strict'

const { test } = require('tap')
const { Client, Pool, connect } = require('..')
const { createServer } = require('http')
const proxy = require('proxy')
const { readFileSync } = require('fs')
const { join } = require('path')
const https = require('https')
const { Duplex, finished } = require('stream')
const tls = require('tls')

const options = {
  key: readFileSync(join(__dirname, 'fixtures', 'key.pem'), 'utf8'),
  cert: readFileSync(join(__dirname, 'fixtures', 'cert.pem'), 'utf8')
}
const ca = readFileSync(join(__dirname, 'fixtures', 'ca.pem'), 'utf8')

test('connect through proxy', async (t) => {
  t.plan(3)

  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`

  server.on('request', (req, res) => {
    t.equal(req.url, '/hello?foo=bar')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const client = new Client(proxyUrl)

  const response = await client.request({
    method: 'GET',
    path: serverUrl + '/hello?foo=bar'
  })

  response.body.setEncoding('utf8')
  let data = ''
  for await (const chunk of response.body) {
    data += chunk
  }
  t.equal(response.statusCode, 200)
  t.same(JSON.parse(data), { hello: 'world' })

  server.close()
  proxy.close()
  client.close()
})

test('connect through proxy with auth', async (t) => {
  t.plan(3)

  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`

  proxy.authenticate = function (req, fn) {
    fn(
      null,
      req.headers['proxy-authorization'] ===
        `Basic ${Buffer.from('user:pass').toString('base64')}`
    )
  }

  server.on('request', (req, res) => {
    t.equal(req.url, '/hello?foo=bar')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const client = new Client(proxyUrl)

  const response = await client.request({
    method: 'GET',
    path: serverUrl + '/hello?foo=bar',
    headers: {
      'proxy-authorization': `Basic ${Buffer.from('user:pass').toString(
        'base64'
      )}`
    }
  })

  response.body.setEncoding('utf8')
  let data = ''
  for await (const chunk of response.body) {
    data += chunk
  }
  t.equal(response.statusCode, 200)
  t.same(JSON.parse(data), { hello: 'world' })

  server.close()
  proxy.close()
  client.close()
})

test('connect through proxy (with pool)', async (t) => {
  t.plan(3)

  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`

  server.on('request', (req, res) => {
    t.equal(req.url, '/hello?foo=bar')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const pool = new Pool(proxyUrl)

  const response = await pool.request({
    method: 'GET',
    path: serverUrl + '/hello?foo=bar'
  })

  response.body.setEncoding('utf8')
  let data = ''
  for await (const chunk of response.body) {
    data += chunk
  }
  t.equal(response.statusCode, 200)
  t.same(JSON.parse(data), { hello: 'world' })

  server.close()
  proxy.close()
  pool.close()
})

function connectTlsFactory (proxyUrl, auth) {
  return ({ servername }, callback) => {
    return new Duplex({
      construct (callback) {
        connect(
          proxyUrl,
          {
            headers: {
              'proxy-authorization': `Basic ${Buffer.from(auth).toString(
                'base64'
              )}`,
              host: servername
            }
          },
          (err, data) => {
            if (err || this.destroyed) {
              callback(err)
            } else {
              this.socket = tls
                .connect({
                  socket: data.socket,
                  servername
                })
                .on('secureConnect', callback)
                .on('error', callback)
                .on('error', (err) => this.destroy(err))
            }
          }
        )
      },
      write (chunk, encoding, callback) {
        return this.socket.write(chunk, encoding, callback)
      },
      final (callback) {
        return this.socket.end(callback)
      },
      read () {
        const buf = this.socket.read()
        if (buf) {
          this.push(buf)
        } else {
          this.socket.once('readable', () => {
            this._read()
          })
        }
      },
      destroy (err, callback) {
        this.socket.destroy(err)
        finished(this.socket, callback)
      }
    })
  }
}

test('connect through proxy with auth to an https server', async (t) => {
  t.plan(3)

  const server = await buildHttpsServer()
  const proxy = await buildProxy()

  proxy.authenticate = function (req, fn) {
    fn(
      null,
      req.headers['proxy-authorization'] ===
        `Basic ${Buffer.from('user:pass').toString('base64')}`
    )
  }

  const serverUrl = `https://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`

  server.on('request', (req, res) => {
    t.equal(req.url, `${serverUrl}/hello?foo=bar`)
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const client = new Client(serverUrl, {
    connect: connectTlsFactory(proxyUrl),
    tls: {
      ca,
      rejectUnauthorized: false
    }
  })

  const response = await client.request({
    method: 'GET',
    path: serverUrl + '/hello?foo=bar'
  })

  response.body.setEncoding('utf8')
  let data = ''
  for await (const chunk of response.body) {
    data += chunk
  }
  t.equal(response.statusCode, 200)
  t.same(JSON.parse(data), { hello: 'world' })

  server.close()
  proxy.close()
  client.close()
})

function buildServer () {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, () => resolve(server))
  })
}

function buildProxy () {
  return new Promise((resolve, reject) => {
    const server = proxy(createServer())
    server.listen(0, () => resolve(server))
  })
}

function buildHttpsServer () {
  return new Promise((resolve, reject) => {
    const server = https.createServer(options)
    server.listen(0, () => resolve(server))
  })
}
