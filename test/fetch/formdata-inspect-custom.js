'use strict'

const { FormData } = require('../../')
const { test } = require('node:test')
const assert = require('node:assert')

test('FormData class custom inspection', () => {
  const formData = new FormData()
  formData.append('username', 'john_doe')
  formData.append('email', 'john@example.com')

  const expectedOutput = 'FormData:\nusername: john_doe\nemail: john@example.com\n'

  assert.strictEqual(formData, expectedOutput)
})
