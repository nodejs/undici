'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const net = require('node:net')
const { Socks5Client, STATES, AUTH_METHODS, REPLY_CODES } = require('../lib/core/socks5-client')
const { InvalidArgumentError, Socks5ProxyError } = require('../lib/core/errors')

test('Socks5Client - constructor validation', async (t) => {
  const p = tspl(t, { plan: 1 })

  p.throws(() => {
    // eslint-disable-next-line no-new
    new Socks5Client()
  }, InvalidArgumentError, 'should throw when socket is not provided')

  await p.completed
})

test('Socks5Client - handshake flow', async (t) => {
  const p = tspl(t, { plan: 6 })

  // Create a mock SOCKS5 server
  const server = net.createServer((socket) => {
    socket.on('data', (data) => {
      // First message should be handshake
      if (data[0] === 0x05 && data.length === 3) {
        p.equal(data[0], 0x05, 'should send SOCKS version 5')
        p.equal(data[1], 1, 'should send 1 auth method')
        p.equal(data[2], AUTH_METHODS.NO_AUTH, 'should send NO_AUTH method')

        // Send response accepting NO_AUTH
        socket.write(Buffer.from([0x05, AUTH_METHODS.NO_AUTH]))
      }
    })
  })

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const { port } = server.address()
  const socket = net.connect(port, '127.0.0.1')

  await new Promise((resolve) => {
    socket.on('connect', resolve)
  })

  const client = new Socks5Client(socket)

  p.equal(client.state, STATES.INITIAL, 'should start in INITIAL state')

  client.on('authenticated', () => {
    p.equal(client.state, STATES.HANDSHAKING, 'should be in HANDSHAKING state after auth')
    p.ok(true, 'should emit authenticated event')
  })

  await client.handshake()

  // Wait for the authenticated event
  await new Promise((resolve) => {
    if (client.state !== STATES.HANDSHAKING) {
      resolve()
    } else {
      client.once('authenticated', resolve)
    }
  })

  socket.destroy()
  server.close()

  await p.completed
})

test('Socks5Client - username/password authentication', async (t) => {
  const p = tspl(t, { plan: 7 })

  const testUsername = 'testuser'
  const testPassword = 'testpass'

  // Create a mock SOCKS5 server with auth
  const server = net.createServer((socket) => {
    let stage = 'handshake'

    socket.on('data', (data) => {
      if (stage === 'handshake' && data[0] === 0x05) {
        p.equal(data[0], 0x05, 'should send SOCKS version 5')
        p.equal(data[1], 2, 'should send 2 auth methods')
        p.equal(data[2], AUTH_METHODS.USERNAME_PASSWORD, 'should send USERNAME_PASSWORD first')
        p.equal(data[3], AUTH_METHODS.NO_AUTH, 'should send NO_AUTH second')

        // Send response selecting USERNAME_PASSWORD
        socket.write(Buffer.from([0x05, AUTH_METHODS.USERNAME_PASSWORD]))
        stage = 'auth'
      } else if (stage === 'auth') {
        // Parse username/password auth request
        p.equal(data[0], 0x01, 'should send auth version 1')

        const usernameLen = data[1]
        const username = data.subarray(2, 2 + usernameLen).toString()
        p.equal(username, testUsername, 'should send correct username')

        const passwordLen = data[2 + usernameLen]
        const password = data.subarray(3 + usernameLen, 3 + usernameLen + passwordLen).toString()
        p.equal(password, testPassword, 'should send correct password')

        // Send auth success response
        socket.write(Buffer.from([0x01, 0x00]))
      }
    })
  })

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const { port } = server.address()
  const socket = net.connect(port, '127.0.0.1')

  await new Promise((resolve) => {
    socket.on('connect', resolve)
  })

  const client = new Socks5Client(socket, {
    username: testUsername,
    password: testPassword
  })

  client.on('authenticated', () => {
    // Test passed
  })

  await client.handshake()

  // Wait for the authenticated event
  await new Promise((resolve) => {
    client.once('authenticated', resolve)
  })

  socket.destroy()
  server.close()

  await p.completed
})

test('Socks5Client - connect command', async (t) => {
  const p = tspl(t, { plan: 8 })

  const targetHost = 'example.com'
  const targetPort = 80

  // Create a mock SOCKS5 server
  const server = net.createServer((socket) => {
    let stage = 'handshake'

    socket.on('data', (data) => {
      if (stage === 'handshake' && data[0] === 0x05) {
        // Send NO_AUTH response
        socket.write(Buffer.from([0x05, AUTH_METHODS.NO_AUTH]))
        stage = 'connect'
      } else if (stage === 'connect') {
        // Parse CONNECT request
        p.equal(data[0], 0x05, 'should send SOCKS version 5')
        p.equal(data[1], 0x01, 'should send CONNECT command')
        p.equal(data[2], 0x00, 'should send reserved byte')
        p.equal(data[3], 0x03, 'should send domain address type')

        const domainLen = data[4]
        const domain = data.subarray(5, 5 + domainLen).toString()
        p.equal(domain, targetHost, 'should send correct domain')

        const port = data.readUInt16BE(5 + domainLen)
        p.equal(port, targetPort, 'should send correct port')

        // Send success response with bound address
        const response = Buffer.from([
          0x05, // Version
          REPLY_CODES.SUCCEEDED, // Success
          0x00, // Reserved
          0x01, // IPv4 address type
          127, 0, 0, 1, // Bound address
          0x00, 0x50 // Bound port (80)
        ])
        socket.write(response)
      }
    })
  })

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const { port } = server.address()
  const socket = net.connect(port, '127.0.0.1')

  await new Promise((resolve) => {
    socket.on('connect', resolve)
  })

  const client = new Socks5Client(socket)

  client.on('authenticated', async () => {
    await client.connect(targetHost, targetPort)
  })

  client.on('connected', (info) => {
    p.equal(info.address, '127.0.0.1', 'should return bound address')
    p.equal(info.port, 80, 'should return bound port')
  })

  await client.handshake()

  // Wait for the connected event
  await new Promise((resolve) => {
    client.once('connected', resolve)
  })

  socket.destroy()
  server.close()

  await p.completed
})

test('Socks5Client - authentication failure', async (t) => {
  const p = tspl(t, { plan: 3 })

  // Create a mock SOCKS5 server
  const server = net.createServer((socket) => {
    socket.on('data', (data) => {
      if (data[0] === 0x05) {
        // Send NO_ACCEPTABLE response
        socket.write(Buffer.from([0x05, AUTH_METHODS.NO_ACCEPTABLE]))
      }
    })
  })

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const { port } = server.address()
  const socket = net.connect(port, '127.0.0.1')

  await new Promise((resolve) => {
    socket.on('connect', resolve)
  })

  const client = new Socks5Client(socket)

  client.on('error', (err) => {
    p.ok(err instanceof Socks5ProxyError, 'should emit Socks5ProxyError')
    p.equal(err.code, 'UND_ERR_SOCKS5_AUTH_REJECTED', 'should have correct error code')
    p.equal(err.message, 'No acceptable authentication method', 'should have correct error message')
  })

  await client.handshake()

  // Wait for the error event
  await new Promise((resolve) => {
    client.once('error', resolve)
  })

  socket.destroy()
  server.close()

  await p.completed
})

test('Socks5Client - connection refused', async (t) => {
  const p = tspl(t, { plan: 3 })

  // Create a mock SOCKS5 server
  const server = net.createServer((socket) => {
    let stage = 'handshake'

    socket.on('data', (data) => {
      if (stage === 'handshake' && data[0] === 0x05) {
        // Send NO_AUTH response
        socket.write(Buffer.from([0x05, AUTH_METHODS.NO_AUTH]))
        stage = 'connect'
      } else if (stage === 'connect') {
        // Send connection refused response
        const response = Buffer.from([
          0x05, // Version
          REPLY_CODES.CONNECTION_REFUSED, // Connection refused
          0x00, // Reserved
          0x01, // IPv4 address type
          0, 0, 0, 0, // Bound address
          0x00, 0x00 // Bound port
        ])
        socket.write(response)
      }
    })
  })

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })

  const { port } = server.address()
  const socket = net.connect(port, '127.0.0.1')

  await new Promise((resolve) => {
    socket.on('connect', resolve)
  })

  const client = new Socks5Client(socket)

  client.on('authenticated', () => {
    client.connect('example.com', 80).catch(() => {
      // Error is handled in the error event
    })
  })

  client.on('error', (err) => {
    p.ok(err instanceof Socks5ProxyError, 'should throw Socks5ProxyError')
    p.equal(err.code, 'UND_ERR_SOCKS5_REPLY_5', 'should have correct error code')
    p.match(err.message, /Connection refused/, 'should have correct error message')
  })

  await client.handshake()

  // Wait for the error event
  await new Promise((resolve) => {
    client.once('error', resolve)
  })

  socket.destroy()
  server.close()

  await p.completed
})
