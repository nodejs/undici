'use strict'

const { test, after } = require('node:test')
const { Client, errors } = require('..')

test('invalid headers', (t) => {
  t.plan(10)

  const client = new Client('http://localhost:3000')
  after(() => client.close())
  client.request({
    path: '/',
    method: 'GET',
    headers: {
      'content-length': 'asd'
    }
  }, (err, data) => {
    t.assert.ok(err instanceof errors.InvalidArgumentError)
  })

  client.request({
    path: '/',
    method: 'GET',
    headers: 1
  }, (err, data) => {
    t.assert.ok(err instanceof errors.InvalidArgumentError)
  })

  client.request({
    path: '/',
    method: 'GET',
    headers: {
      'transfer-encoding': 'chunked'
    }
  }, (err, data) => {
    t.assert.ok(err instanceof errors.InvalidArgumentError)
  })

  client.request({
    path: '/',
    method: 'GET',
    headers: {
      upgrade: 'asd'
    }
  }, (err, data) => {
    t.assert.ok(err instanceof errors.InvalidArgumentError)
  })

  client.request({
    path: '/',
    method: 'GET',
    headers: {
      connection: 'asd'
    }
  }, (err, data) => {
    t.assert.ok(err instanceof errors.InvalidArgumentError)
  })

  client.request({
    path: '/',
    method: 'GET',
    headers: {
      'keep-alive': 'timeout=5'
    }
  }, (err, data) => {
    t.assert.ok(err instanceof errors.InvalidArgumentError)
  })

  client.request({
    path: '/',
    method: 'GET',
    headers: {
      foo: {}
    }
  }, (err, data) => {
    t.assert.ok(err instanceof errors.InvalidArgumentError)
  })

  client.request({
    path: '/',
    method: 'GET',
    headers: {
      expect: '100-continue'
    }
  }, (err, data) => {
    t.assert.ok(err instanceof errors.NotSupportedError)
  })

  client.request({
    path: '/',
    method: 'GET',
    headers: {
      Expect: '100-continue'
    }
  }, (err, data) => {
    t.assert.ok(err instanceof errors.NotSupportedError)
  })

  client.request({
    path: '/',
    method: 'GET',
    headers: {
      expect: 'asd'
    }
  }, (err, data) => {
    t.assert.ok(err instanceof errors.NotSupportedError)
  })
})
