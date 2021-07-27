'use strict'

const { test } = require('tap')
const { Client, Pool } = require('..')

test('Client: Get current socket via onSocket hook option', (t) => {
  t.plan(4)

  const client = new Client('https://www.github.com', {
    onSocket (socket, cb) {
      t.ok(socket.authorized)
      cb()
    }
  })
  t.teardown(client.close.bind(client))

  client.request({ method: 'GET', path: '/' }, (err, data) => {
    t.error(err)
    t.equal(data.statusCode, 301)

    data.body
      .resume()
      .on('end', () => {
        t.pass()
      })
  })
})

test('Client: Should be called once per session', (t) => {
  t.plan(6)

  const client = new Client('https://www.github.com', {
    onSocket (socket, cb) {
      t.ok(socket.authorized)
      cb()
    }
  })
  t.teardown(client.close.bind(client))

  client.request({ method: 'GET', path: '/' }, (err, data) => {
    t.error(err)
    t.equal(data.statusCode, 301)

    data.body
      .resume()
      .on('end', () => {
        client.request({ method: 'GET', path: '/' }, (err, data) => {
          t.error(err)
          t.equal(data.statusCode, 301)

          data.body
            .resume()
            .on('end', () => {
              t.pass()
            })
        })
      })
  })
})

test('Client: Reject the selected socket', (t) => {
  t.plan(2)

  const client = new Client('https://www.github.com', {
    onSocket (socket, cb) {
      cb(new Error('kaboom'))
    }
  })
  t.teardown(client.close.bind(client))

  client.request({ method: 'GET', path: '/' }, (err, data) => {
    t.equal(err.message, 'kaboom')
    t.equal(data.body, undefined)
  })
})

test('Pool: Get current socket via onSocket hook option', (t) => {
  t.plan(4)

  const pool = new Pool('https://www.github.com', {
    onSocket (socket, cb) {
      t.ok(socket.authorized)
      cb()
    }
  })
  t.teardown(pool.close.bind(pool))

  pool.request({ method: 'GET', path: '/' }, (err, data) => {
    t.error(err)
    t.equal(data.statusCode, 301)

    data.body
      .resume()
      .on('end', () => {
        t.pass()
      })
  })
})

test('Pool: Should be called once per session', (t) => {
  t.plan(6)

  const pool = new Pool('https://www.github.com', {
    onSocket (socket, cb) {
      t.ok(socket.authorized)
      cb()
    }
  })
  t.teardown(pool.close.bind(pool))

  pool.request({ method: 'GET', path: '/' }, (err, data) => {
    t.error(err)
    t.equal(data.statusCode, 301)

    data.body
      .resume()
      .on('end', () => {
        pool.request({ method: 'GET', path: '/' }, (err, data) => {
          t.error(err)
          t.equal(data.statusCode, 301)

          data.body
            .resume()
            .on('end', () => {
              t.pass()
            })
        })
      })
  })
})

test('Pool: Reject the selected socket', (t) => {
  t.plan(2)

  const pool = new Pool('https://www.github.com', {
    onSocket (socket, cb) {
      cb(new Error('kaboom'))
    }
  })
  t.teardown(pool.close.bind(pool))

  pool.request({ method: 'GET', path: '/' }, (err, data) => {
    t.equal(err.message, 'kaboom')
    t.equal(data.body, undefined)
  })
})
