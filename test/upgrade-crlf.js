'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Client, errors } = require('..')
const net = require('node:net')

test('CRLF injection in upgrade header via CRLF sequence', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = net.createServer({ joinDuplicateHeaders: true }, (c) => {
    c.on('data', () => {
      c.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
    })
    c.on('error', () => {})
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    try {
      await client.upgrade({
        path: '/',
        method: 'GET',
        protocol: 'websocket\r\n\r\nSET pwned true'
      })
      t.fail('should have thrown')
    } catch (err) {
      t.ok(err instanceof errors.InvalidArgumentError)
      t.strictEqual(err.message, 'invalid upgrade header')
    }
  })

  await t.completed
})

test('CRLF injection in upgrade header via lone CR', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = net.createServer({ joinDuplicateHeaders: true }, (c) => {
    c.on('data', () => {
      c.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
    })
    c.on('error', () => {})
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    try {
      await client.upgrade({
        path: '/',
        method: 'GET',
        protocol: 'websocket\rinjected'
      })
      t.fail('should have thrown')
    } catch (err) {
      t.ok(err instanceof errors.InvalidArgumentError)
      t.strictEqual(err.message, 'invalid upgrade header')
    }
  })

  await t.completed
})

test('CRLF injection in upgrade header via lone LF', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = net.createServer({ joinDuplicateHeaders: true }, (c) => {
    c.on('data', () => {
      c.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
    })
    c.on('error', () => {})
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    try {
      await client.upgrade({
        path: '/',
        method: 'GET',
        protocol: 'websocket\ninjected'
      })
      t.fail('should have thrown')
    } catch (err) {
      t.ok(err instanceof errors.InvalidArgumentError)
      t.strictEqual(err.message, 'invalid upgrade header')
    }
  })

  await t.completed
})

test('CRLF injection in upgrade header via null byte', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = net.createServer({ joinDuplicateHeaders: true }, (c) => {
    c.on('data', () => {
      c.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
    })
    c.on('error', () => {})
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    try {
      await client.upgrade({
        path: '/',
        method: 'GET',
        protocol: 'websocket\0injected'
      })
      t.fail('should have thrown')
    } catch (err) {
      t.ok(err instanceof errors.InvalidArgumentError)
      t.strictEqual(err.message, 'invalid upgrade header')
    }
  })

  await t.completed
})

test('CRLF injection in upgrade option via client.request', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = net.createServer({ joinDuplicateHeaders: true }, (c) => {
    c.on('data', () => {
      c.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
    })
    c.on('error', () => {})
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    try {
      await client.request({
        path: '/',
        method: 'GET',
        upgrade: 'websocket\r\n\r\nGET /smuggled HTTP/1.1'
      })
      t.fail('should have thrown')
    } catch (err) {
      t.ok(err instanceof errors.InvalidArgumentError)
      t.strictEqual(err.message, 'invalid upgrade header')
    }
  })

  await t.completed
})

test('valid upgrade value is accepted', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = net.createServer({ joinDuplicateHeaders: true }, (c) => {
    c.on('data', () => {
      c.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n')
    })
    c.on('error', () => {})
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    const { socket } = await client.upgrade({
      path: '/',
      method: 'GET',
      protocol: 'websocket'
    })
    t.ok(socket)
    socket.destroy()
  })

  await t.completed
})
