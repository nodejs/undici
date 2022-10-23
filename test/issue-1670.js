'use strict'

const { test } = require('tap')
const { request } = require('..')

test('https://github.com/mcollina/undici/issues/810', async (t) => {
  const { body } = await request('https://api.github.com/user/emails')

  await body.text()

  t.end()
})
