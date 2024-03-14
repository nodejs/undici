'use strict'

const { FormData } = require('../../')
const { inspect } = require('node:util')
const { test } = require('node:test')
const assert = require('node:assert')

test('FormData class custom inspection', () => {
  const formData = new FormData()
  formData.append('username', 'john_doe')
  formData.append('email', 'john@example.com')

  const expectedOutput = "FormData {\n  username: 'john_doe',\n  email: 'john@example.com'\n}"

  assert.deepStrictEqual(inspect(formData), expectedOutput)
})
