'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const net = require('net')

test('basic upgrade', (t) => {
  t.plan(3)

  const server = net.createServer((c) => {
    c.on('data', (d) => {
      c.write('HTTP/1.1 101\r\n')
      c.write('hello: world\r\n')
      c.write('connection: upgrade\r\n')
      c.write('upgrade: websocket\r\n')
      c.write('\r\n')
      c.write('Body')
    })

    c.on('end', () => {
      c.end()
    })
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.upgrade({
      path: '/',
      method: 'GET',
      protocol: 'Websocket'
    }, (err, data) => {
      t.error(err)

      const { headers, socket } = data

      let recvData = ''
      data.socket.on('data', (d) => {
        recvData += d
      })

      socket.on('close', () => {
        t.strictEqual(recvData.toString(), 'Body')
      })

      t.deepEqual(headers, {
        hello: 'world',
        connection: 'upgrade',
        upgrade: 'websocket'
      })
      socket.end()
    })
  })
})

test('basic upgrade promise', (t) => {
  t.plan(2)

  const server = net.createServer((c) => {
    c.on('data', (d) => {
      c.write('HTTP/1.1 101\r\n')
      c.write('hello: world\r\n')
      c.write('connection: upgrade\r\n')
      c.write('upgrade: websocket\r\n')
      c.write('\r\n')
      c.write('Body')
    })

    c.on('end', () => {
      c.end()
    })
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    const { headers, socket } = await client.upgrade({
      path: '/',
      method: 'GET',
      protocol: 'Websocket'
    })

    let recvData = ''
    socket.on('data', (d) => {
      recvData += d
    })

    socket.on('close', () => {
      t.strictEqual(recvData.toString(), 'Body')
    })

    t.deepEqual(headers, {
      hello: 'world',
      connection: 'upgrade',
      upgrade: 'websocket'
    })
    socket.end()
  })
})

test('upgrade error', (t) => {
  t.plan(1)

  const server = net.createServer((c) => {
    c.on('data', (d) => {
      c.write('HTTP/1.1 101\r\n')
      c.write('hello: world\r\n')
      c.write('connection: upgrade\r\n')
      c.write('\r\n')
      c.write('Body')
    })

    c.on('end', () => {
      c.end()
    })
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    try {
      await client.upgrade({
        path: '/',
        method: 'GET',
        protocol: 'Websocket'
      })
    } catch (err) {
      t.ok(err)
    }
  })
})

test('upgrade invalid opts', (t) => {
  t.plan(2)

  const client = new Client('http://localhost:5432')

  client.upgrade(null, err => {
    t.ok(err instanceof errors.InvalidArgumentError)
  })

  try {
    client.upgrade(null, null)
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
  }
})
