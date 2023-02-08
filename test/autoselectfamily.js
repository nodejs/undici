'use strict'

const { test } = require('tap')
const dgram = require('dgram')
const { Resolver } = require('dns')
const dnsPacket = require('dns-packet')
const { createServer } = require('http')
const { Client, Agent, request } = require('..')
const { nodeHasAutoSelectFamily } = require('../lib/core/util')

function _lookup (resolver, hostname, options, cb) {
  resolver.resolve(hostname, 'ANY', (err, replies) => {
    if (err) {
      return cb(err)
    }

    const hosts = replies
      .map((r) => ({ address: r.address, family: r.type === 'AAAA' ? 6 : 4 }))
      .sort((a, b) => b.family - a.family)

    if (options.all === true) {
      return cb(null, hosts)
    }

    return cb(null, hosts[0].address, hosts[0].family)
  })
}

function createDnsServer (ipv6Addr, ipv4Addr, cb) {
  // Create a DNS server which replies with a AAAA and a A record for the same host
  const socket = dgram.createSocket('udp4')

  socket.on('message', (msg, { address, port }) => {
    const parsed = dnsPacket.decode(msg)

    const response = dnsPacket.encode({
      type: 'answer',
      id: parsed.id,
      questions: parsed.questions,
      answers: [
        { type: 'AAAA', class: 'IN', name: 'example.org', data: '::1', ttl: 123 },
        { type: 'A', class: 'IN', name: 'example.org', data: '127.0.0.1', ttl: 123 }
      ]
    })

    socket.send(response, port, address)
  })

  socket.bind(0, () => {
    const resolver = new Resolver()
    resolver.setServers([`127.0.0.1:${socket.address().port}`])

    cb(null, { dnsServer: socket, lookup: _lookup.bind(null, resolver) })
  })
}

if (nodeHasAutoSelectFamily) {
  test('with autoSelectFamily enable the request succeeds when using request', (t) => {
    t.plan(3)

    createDnsServer('::1', '127.0.0.1', function (_, { dnsServer, lookup }) {
      const server = createServer((req, res) => {
        res.end('hello')
      })

      t.teardown(() => {
        server.close()
        dnsServer.close()
      })

      server.listen(0, '127.0.0.1', () => {
        const agent = new Agent({ connect: { lookup }, autoSelectFamily: true })

        request(
          `http://example.org:${server.address().port}/`, {
            method: 'GET',
            dispatcher: agent
          }, (err, { statusCode, body }) => {
            t.error(err)

            let response = Buffer.alloc(0)

            body.on('data', chunk => {
              response = Buffer.concat([response, chunk])
            })

            body.on('end', () => {
              t.strictSame(statusCode, 200)
              t.strictSame(response.toString('utf-8'), 'hello')
            })
          })
      })
    })
  })

  test('with autoSelectFamily enable the request succeeds when using a client', (t) => {
    t.plan(3)

    createDnsServer('::1', '127.0.0.1', function (_, { dnsServer, lookup }) {
      const server = createServer((req, res) => {
        res.end('hello')
      })

      t.teardown(() => {
        server.close()
        dnsServer.close()
      })

      server.listen(0, '127.0.0.1', () => {
        const client = new Client(`http://example.org:${server.address().port}`, { connect: { lookup }, autoSelectFamily: true })

        t.teardown(client.destroy.bind(client))

        client.request({
          path: '/',
          method: 'GET'
        }, (err, { statusCode, body }) => {
          t.error(err)

          let response = Buffer.alloc(0)

          body.on('data', chunk => {
            response = Buffer.concat([response, chunk])
          })

          body.on('end', () => {
            t.strictSame(statusCode, 200)
            t.strictSame(response.toString('utf-8'), 'hello')
          })
        })
      })
    })
  })
}

test('with autoSelectFamily disabled the request fails when using request', (t) => {
  t.plan(1)

  createDnsServer('::1', '127.0.0.1', function (_, { dnsServer, lookup }) {
    const server = createServer((req, res) => {
      res.end('hello')
    })

    t.teardown(() => {
      server.close()
      dnsServer.close()
    })

    server.listen(0, '127.0.0.1', () => {
      const agent = new Agent({ connect: { lookup } })

      request(`http://example.org:${server.address().port}`, {
        method: 'GET',
        dispatcher: agent
      }, (err, { statusCode, body }) => {
        t.strictSame(err.code, 'ECONNREFUSED')
      })
    })
  })
})

test('with autoSelectFamily disabled the request fails when using a client', (t) => {
  t.plan(1)

  createDnsServer('::1', '127.0.0.1', function (_, { dnsServer, lookup }) {
    const server = createServer((req, res) => {
      res.end('hello')
    })

    t.teardown(() => {
      server.close()
      dnsServer.close()
    })

    server.listen(0, '127.0.0.1', () => {
      const client = new Client(`http://example.org:${server.address().port}`, { connect: { lookup } })
      t.teardown(client.destroy.bind(client))

      client.request({
        path: '/',
        method: 'GET'
      }, (err, { statusCode, body }) => {
        t.strictSame(err.code, 'ECONNREFUSED')
      })
    })
  })
})
