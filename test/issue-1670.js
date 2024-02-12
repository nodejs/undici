'use strict'

const { test } = require('node:test')
const { request } = require('..')

test('https://github.com/mcollina/undici/issues/810', async () => {
  const { body } = await request('https://api.github.com/user/emails')

  await body.text()
})
