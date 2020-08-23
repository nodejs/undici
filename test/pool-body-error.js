'use strict'

const { test } = require('tap')
const { Pool } = require('..')
const http = require('http')
const { Readable } = require('stream')

test('request error body', (t) => {
  t.plan(3)

  let count = 0
  const server = http.createServer((req, res) => {
    if (count++ === 0) {
      res.end()
    } else {
      t.fail()
    }
  })

  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1
    })
    t.teardown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, response) => {
      t.error(err)
      response.body.resume().on('end', () => {
        t.pass()
      })
    })

    const _err = new Error()
    const body = new Readable()
    client.request({
      path: '/',
      method: 'GET',
      body
    }, (err, response) => {
      t.strictEqual(err, _err)
    })
    body.destroy(_err)
  })
})

test('stream error body', (t) => {
  t.plan(3)

  let count = 0
  const server = http.createServer((req, res) => {
    if (count++ === 0) {
      res.end()
    } else {
      t.fail()
    }
  })

  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1
    })
    t.teardown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, response) => {
      t.error(err)
      response.body.resume().on('end', () => {
        t.pass()
      })
    })

    const _err = new Error()
    const body = new Readable()
    client.stream({
      path: '/',
      method: 'GET',
      body
    }, () => {
      t.fail()
    }, (err, response) => {
      t.strictEqual(err, _err)
    })
    body.destroy(_err)
  })
})
