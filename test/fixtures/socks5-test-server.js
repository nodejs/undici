'use strict'

const net = require('node:net')
const { AUTH_METHODS, REPLY_CODES } = require('../../lib/core/socks5-client')

/**
 * Test SOCKS5 server for unit tests
 * Implements SOCKS5 protocol with optional authentication
 */
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
      // Handle socket errors silently
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

          // Simulate connection failure if requested
          if (this.options.simulateFailure) {
            const response = Buffer.concat([
              Buffer.from([0x05, REPLY_CODES.CONNECTION_REFUSED, 0x00, 0x01]),
              Buffer.from([0, 0, 0, 0]),
              Buffer.from([0, 0])
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
              Buffer.from([0, 0, 0, 0]),
              Buffer.from([0, 0])
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

module.exports = { TestSocks5Server }
