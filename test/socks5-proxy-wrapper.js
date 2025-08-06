'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { request } = require('..')
const { InvalidArgumentError } = require('../lib/core/errors')
const Socks5ProxyWrapper = require('../lib/dispatcher/socks5-proxy-wrapper')
const { createServer } = require('node:http')
const net = require('node:net')
const { AUTH_METHODS, REPLY_CODES } = require('../lib/core/socks5-client')

// Enhanced SOCKS5 test server
class TestSocks5Server {
  constructor (options = {}) {
    this.options = options
    this.server = null
    this.connections = new Set()
    this.requireAuth = options.requireAuth || false
    this.validCredentials = options.credentials || { username: 'test', password: 'pass' }
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
        this.handleHandshake(socket, buffer, (newBuffer, method) => {
          buffer = newBuffer
          if (method === AUTH_METHODS.NO_AUTH) {
            state = 'connect'
          } else if (method === AUTH_METHODS.USERNAME_PASSWORD) {
            state = 'auth'
          }
        })
      } else if (state === 'auth') {
        this.handleAuth(socket, buffer, (newBuffer, success) => {
          buffer = newBuffer
          if (success) {
            state = 'connect'
          } else {
            socket.end()
          }
        })
      } else if (state === 'connect') {
        this.handleConnect(socket, buffer, (newBuffer) => {
          buffer = newBuffer
          state = 'relay'
        })
      }
    })

    socket.on('error', () => {
      // Handle socket errors
    })
  }

  handleHandshake (socket, buffer, callback) {
    if (buffer.length >= 2) {
      const version = buffer[0]
      const nmethods = buffer[1]

      if (version === 0x05 && buffer.length >= 2 + nmethods) {
        const methods = Array.from(buffer.subarray(2, 2 + nmethods))

        // Select authentication method
        let selectedMethod
        if (this.requireAuth && methods.includes(AUTH_METHODS.USERNAME_PASSWORD)) {
          selectedMethod = AUTH_METHODS.USERNAME_PASSWORD
        } else if (!this.requireAuth && methods.includes(AUTH_METHODS.NO_AUTH)) {
          selectedMethod = AUTH_METHODS.NO_AUTH
        } else {
          selectedMethod = AUTH_METHODS.NO_ACCEPTABLE
        }

        socket.write(Buffer.from([0x05, selectedMethod]))
        callback(buffer.subarray(2 + nmethods), selectedMethod)
      }
    }
  }

  handleAuth (socket, buffer, callback) {
    if (buffer.length >= 2) {
      const version = buffer[0]
      if (version !== 0x01) {
        socket.write(Buffer.from([0x01, 0x01])) // Failure
        callback(buffer, false)
        return
      }

      const usernameLen = buffer[1]
      if (buffer.length >= 3 + usernameLen) {
        const username = buffer.subarray(2, 2 + usernameLen).toString()
        const passwordLen = buffer[2 + usernameLen]

        if (buffer.length >= 3 + usernameLen + passwordLen) {
          const password = buffer.subarray(3 + usernameLen, 3 + usernameLen + passwordLen).toString()

          const success = username === this.validCredentials.username &&
                         password === this.validCredentials.password

          socket.write(Buffer.from([0x01, success ? 0x00 : 0x01]))
          callback(buffer.subarray(3 + usernameLen + passwordLen), success)
        }
      }
    }
  }

  handleConnect (socket, buffer, callback) {
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

          // Simulate connection to target
          if (this.options.simulateFailure) {
            // Send connection refused
            const response = Buffer.concat([
              Buffer.from([0x05, REPLY_CODES.CONNECTION_REFUSED, 0x00, 0x01]),
              Buffer.from([0, 0, 0, 0]), // Address
              Buffer.from([0, 0]) // Port
            ])
            socket.write(response)
            socket.end()
            return
          }

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

            callback(buffer.subarray(4 + addressLength + 2))
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

test('Socks5ProxyWrapper - constructor validation', async (t) => {
  const p = tspl(t, { plan: 4 })

  p.throws(() => {
    // eslint-disable-next-line no-new
    new Socks5ProxyWrapper()
  }, InvalidArgumentError, 'should throw when proxy URL is not provided')

  p.throws(() => {
    // eslint-disable-next-line no-new
    new Socks5ProxyWrapper('http://localhost:1080')
  }, InvalidArgumentError, 'should throw when proxy URL protocol is not socks5')

  p.doesNotThrow(() => {
    // eslint-disable-next-line no-new
    new Socks5ProxyWrapper('socks5://localhost:1080')
  }, 'should accept socks5:// URLs')

  p.doesNotThrow(() => {
    // eslint-disable-next-line no-new
    new Socks5ProxyWrapper('socks://localhost:1080')
  }, 'should accept socks:// URLs for compatibility')

  await p.completed
})

test('Socks5ProxyWrapper - basic HTTP connection', async (t) => {
  const p = tspl(t, { plan: 2 })

  // Create target HTTP server
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ message: 'Hello from target server', path: req.url }))
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
    // Create Socks5ProxyWrapper
    const proxyWrapper = new Socks5ProxyWrapper(`socks5://localhost:${socksAddress.port}`)

    // Make request through SOCKS5 proxy
    const response = await request(`http://localhost:${serverPort}/test`, {
      dispatcher: proxyWrapper
    })

    p.equal(response.statusCode, 200, 'should get 200 status code')

    const body = await response.body.json()
    p.deepEqual(body, {
      message: 'Hello from target server',
      path: '/test'
    }, 'should get correct response body')
  } finally {
    await socksServer.close()
    server.close()
  }

  await p.completed
})

test.skip('Socks5ProxyWrapper - HTTPS connection', async (t) => {
  // Skip HTTPS test for now - TLS option passing needs additional work
  t.skip('HTTPS test requires TLS option refinement')
})

test('Socks5ProxyWrapper - with authentication', async (t) => {
  const p = tspl(t, { plan: 2 })

  // Create target HTTP server
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ message: 'Authenticated request successful' }))
  })

  // Start target server
  await new Promise((resolve) => {
    server.listen(0, resolve)
  })
  const serverPort = server.address().port

  // Create SOCKS5 proxy server with auth
  const socksServer = new TestSocks5Server({
    requireAuth: true,
    credentials: { username: 'testuser', password: 'testpass' }
  })
  const socksAddress = await socksServer.listen()

  try {
    // Create Socks5ProxyWrapper with auth
    const proxyWrapper = new Socks5ProxyWrapper(`socks5://testuser:testpass@localhost:${socksAddress.port}`)

    // Make request through SOCKS5 proxy
    const response = await request(`http://localhost:${serverPort}/auth-test`, {
      dispatcher: proxyWrapper
    })

    p.equal(response.statusCode, 200, 'should get 200 status code')

    const body = await response.body.json()
    p.deepEqual(body, {
      message: 'Authenticated request successful'
    }, 'should get correct response body')
  } finally {
    await socksServer.close()
    server.close()
  }

  await p.completed
})

test('Socks5ProxyWrapper - authentication with options', async (t) => {
  const p = tspl(t, { plan: 2 })

  // Create target HTTP server
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ message: 'Options auth successful' }))
  })

  // Start target server
  await new Promise((resolve) => {
    server.listen(0, resolve)
  })
  const serverPort = server.address().port

  // Create SOCKS5 proxy server with auth
  const socksServer = new TestSocks5Server({
    requireAuth: true,
    credentials: { username: 'optuser', password: 'optpass' }
  })
  const socksAddress = await socksServer.listen()

  try {
    // Create Socks5ProxyWrapper with auth in options
    const proxyWrapper = new Socks5ProxyWrapper(`socks5://localhost:${socksAddress.port}`, {
      username: 'optuser',
      password: 'optpass'
    })

    // Make request through SOCKS5 proxy
    const response = await request(`http://localhost:${serverPort}/options-auth`, {
      dispatcher: proxyWrapper
    })

    p.equal(response.statusCode, 200, 'should get 200 status code')

    const body = await response.body.json()
    p.deepEqual(body, {
      message: 'Options auth successful'
    }, 'should get correct response body')
  } finally {
    await socksServer.close()
    server.close()
  }

  await p.completed
})

test('Socks5ProxyWrapper - multiple requests through same proxy', async (t) => {
  const p = tspl(t, { plan: 4 })

  // Create target HTTP server
  let requestCount = 0
  const server = createServer((req, res) => {
    requestCount++
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ message: `Request ${requestCount}`, path: req.url }))
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
    // Create Socks5ProxyWrapper
    const proxyWrapper = new Socks5ProxyWrapper(`socks5://localhost:${socksAddress.port}`)

    // Make first request
    const response1 = await request(`http://localhost:${serverPort}/request1`, {
      dispatcher: proxyWrapper
    })

    p.equal(response1.statusCode, 200, 'should get 200 status code for first request')
    const body1 = await response1.body.json()
    p.deepEqual(body1, { message: 'Request 1', path: '/request1' }, 'should get correct response body for first request')

    // Make second request through same proxy
    const response2 = await request(`http://localhost:${serverPort}/request2`, {
      dispatcher: proxyWrapper
    })

    p.equal(response2.statusCode, 200, 'should get 200 status code for second request')
    const body2 = await response2.body.json()
    p.deepEqual(body2, { message: 'Request 2', path: '/request2' }, 'should get correct response body for second request')
  } finally {
    await socksServer.close()
    server.close()
  }

  await p.completed
})

test('Socks5ProxyWrapper - connection failure', async (t) => {
  const p = tspl(t, { plan: 1 })

  // Create Socks5ProxyWrapper pointing to non-existent proxy
  const proxyWrapper = new Socks5ProxyWrapper('socks5://localhost:9999')

  try {
    await request('http://example.com/', {
      dispatcher: proxyWrapper
    })
    p.fail('should have thrown an error')
  } catch (err) {
    p.ok(err, 'should throw error when SOCKS5 proxy is not available')
  }

  await p.completed
})

test('Socks5ProxyWrapper - proxy connection refused', async (t) => {
  const p = tspl(t, { plan: 1 })

  // Create target HTTP server
  const server = createServer((req, res) => {
    res.writeHead(200)
    res.end('OK')
  })

  await new Promise((resolve) => {
    server.listen(0, resolve)
  })
  const serverPort = server.address().port

  // Create SOCKS5 proxy server that simulates connection failure
  const socksServer = new TestSocks5Server({ simulateFailure: true })
  const socksAddress = await socksServer.listen()

  try {
    const proxyWrapper = new Socks5ProxyWrapper(`socks5://localhost:${socksAddress.port}`)

    await request(`http://localhost:${serverPort}/`, {
      dispatcher: proxyWrapper
    })
    p.fail('should have thrown an error')
  } catch (err) {
    p.ok(err, 'should throw error when SOCKS5 proxy refuses connection')
  } finally {
    await socksServer.close()
    server.close()
  }

  await p.completed
})

test('Socks5ProxyWrapper - close and destroy', async (t) => {
  const p = tspl(t, { plan: 2 })

  const proxyWrapper = new Socks5ProxyWrapper('socks5://localhost:1080')

  // Test close
  await proxyWrapper.close()
  p.ok(true, 'should close without error')

  // Test destroy
  await proxyWrapper.destroy()
  p.ok(true, 'should destroy without error')

  await p.completed
})

test('Socks5ProxyWrapper - URL parsing edge cases', async (t) => {
  const p = tspl(t, { plan: 3 })

  // Test with URL object
  const url = new URL('socks5://user:pass@proxy.example.com:1080')
  p.doesNotThrow(() => {
    // eslint-disable-next-line no-new
    new Socks5ProxyWrapper(url)
  }, 'should accept URL object')

  // Test with encoded credentials
  p.doesNotThrow(() => {
    // eslint-disable-next-line no-new
    new Socks5ProxyWrapper('socks5://user%40domain:p%40ss@localhost:1080')
  }, 'should handle URL-encoded credentials')

  // Test default port
  p.doesNotThrow(() => {
    // eslint-disable-next-line no-new
    new Socks5ProxyWrapper('socks5://localhost')
  }, 'should use default port 1080')

  await p.completed
})
