'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')

test('dispatch invalid opts', (t) => {
  t.plan(1)

  const client = new Client('http://localhost:5000')

  try {
    client.dispatch({
      path: '/',
      method: 'GET',
      upgrade: 1
    })
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
  }
})
