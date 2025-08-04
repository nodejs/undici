'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { request } = require('..')
const { InvalidArgumentError } = require('../lib/core/errors')
const ProxyAgent = require('../lib/dispatcher/proxy-agent')
const { createServer } = require('node:http')
const net = require('node:net')
const { AUTH_METHODS, REPLY_CODES } = require('../lib/core/socks5-client')

// Simple SOCKS5 test server
class TestSocks5Server {
  constructor (options = {}) {
    this.options = options
    this.server = null
    this.connections = new Set()
  }

  async listen (port = 0) {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.connections.add(socket)
        this.handleConnection(socket)

        socket.on('close', () => {
          this.connections.delete(socket)
        })
      })

      this.server.listen(port, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve(this.server.address())
        }
      })
    })
  }

  handleConnection (socket) {
    let state = 'handshake'
    let buffer = Buffer.alloc(0)

    socket.on('data', (data) => {
      buffer = Buffer.concat([buffer, data])

      if (state === 'handshake') {
        if (buffer.length >= 2) {
          const version = buffer[0]
          const nmethods = buffer[1]

          if (version === 0x05 && buffer.length >= 2 + nmethods) {
            // Accept NO_AUTH method
            socket.write(Buffer.from([0x05, AUTH_METHODS.NO_AUTH]))
            buffer = buffer.subarray(2 + nmethods)
            state = 'connect'
          }
        }
      } else if (state === 'connect') {
        if (buffer.length >= 4) {
          const version = buffer[0]
          const cmd = buffer[1]
          const atyp = buffer[3]

          if (version === 0x05 && cmd === 0x01) {
            let addressLength = 0
            if (atyp === 0x01) {
              addressLength = 4 // IPv4
            } else if (atyp === 0x03) {
              if (buffer.length >= 5) {
                addressLength = 1 + buffer[4] // Domain length + domain
              } else {
                return // Not enough data
              }
            } else if (atyp === 0x04) {
              addressLength = 16 // IPv6
            }

            if (buffer.length >= 4 + addressLength + 2) {
              // Extract target address and port
              let targetHost
              let offset = 4

              if (atyp === 0x01) {
                targetHost = Array.from(buffer.subarray(offset, offset + 4)).join('.')
                offset += 4
              } else if (atyp === 0x03) {
                const domainLen = buffer[offset]
                offset += 1
                targetHost = buffer.subarray(offset, offset + domainLen).toString()
                offset += domainLen
              }

              const targetPort = buffer.readUInt16BE(offset)

              // Connect to target
              const targetSocket = net.connect(targetPort, targetHost)

              targetSocket.on('connect', () => {
                // Send success response
                const response = Buffer.concat([
                  Buffer.from([0x05, 0x00, 0x00, 0x01]), // VER, REP, RSV, ATYP
                  Buffer.from([127, 0, 0, 1]), // Bind address (localhost)
                  Buffer.allocUnsafe(2) // Bind port
                ])
                response.writeUInt16BE(targetPort, response.length - 2)
                socket.write(response)

                // Start relaying data
                socket.pipe(targetSocket)
                targetSocket.pipe(socket)

                buffer = buffer.subarray(4 + addressLength + 2)
                state = 'relay'
              })

              targetSocket.on('error', () => {
                // Send connection refused
                const response = Buffer.concat([
                  Buffer.from([0x05, REPLY_CODES.CONNECTION_REFUSED, 0x00, 0x01]),
                  Buffer.from([0, 0, 0, 0]), // Address
                  Buffer.from([0, 0]) // Port
                ])
                socket.write(response)
                socket.end()
              })
            }
          }
        }
      }
    })

    socket.on('error', () => {
      // Handle socket errors
    })
  }

  async close () {
    if (this.server) {
      // Close all connections
      for (const socket of this.connections) {
        socket.destroy()
      }

      return new Promise((resolve) => {
        this.server.close(resolve)
      })
    }
  }
}

test('ProxyAgent - SOCKS5 constructor validation', async (t) => {
  const p = tspl(t, { plan: 2 })

  p.throws(() => {
    // eslint-disable-next-line no-new
    new ProxyAgent()
  }, InvalidArgumentError, 'should throw when proxy uri is not provided')

  p.doesNotThrow(() => {
    // eslint-disable-next-line no-new
    new ProxyAgent('socks5://localhost:1080')
  }, 'should accept socks5:// URLs')

  await p.completed
})

test('ProxyAgent - SOCKS5 basic connection', async (t) => {
  const p = tspl(t, { plan: 2 })

  // Create target HTTP server
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ message: 'Hello from target server' }))
  })

  // Start target server
  await new Promise((resolve) => {
    server.listen(0, resolve)
  })
  const serverPort = server.address().port

  // Create SOCKS5 proxy server
  const socksServer = new TestSocks5Server()
  const socksAddress = await socksServer.listen()

  try {
    // Create ProxyAgent with SOCKS5 proxy
    const proxyAgent = new ProxyAgent(`socks5://localhost:${socksAddress.port}`)

    // Make request through SOCKS5 proxy
    const response = await request(`http://localhost:${serverPort}/test`, {
      dispatcher: proxyAgent
    })

    p.equal(response.statusCode, 200, 'should get 200 status code')

    const body = await response.body.json()
    p.deepEqual(body, { message: 'Hello from target server' }, 'should get correct response body')
  } finally {
    await socksServer.close()
    server.close()
  }

  await p.completed
})

test('ProxyAgent - SOCKS5 with authentication', async (t) => {
  const p = tspl(t, { plan: 1 })

  // Create ProxyAgent with SOCKS5 proxy and auth
  const proxyAgent = new ProxyAgent('socks5://user:pass@localhost:1080')

  // This test just verifies the agent can be created with auth credentials
  p.ok(proxyAgent, 'should create ProxyAgent with SOCKS5 auth')

  await p.completed
})

test('ProxyAgent - SOCKS5 connection failure', async (t) => {
  const p = tspl(t, { plan: 1 })

  // Create ProxyAgent pointing to non-existent SOCKS5 proxy
  const proxyAgent = new ProxyAgent('socks5://localhost:9999')

  try {
    await request('http://localhost:8080/test', {
      dispatcher: proxyAgent
    })
    p.fail('should have thrown an error')
  } catch (err) {
    p.ok(err, 'should throw error when SOCKS5 proxy is not available')
  }

  await p.completed
})
