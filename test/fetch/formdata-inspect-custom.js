'use strict'

const { FormData } = require('../../')
const { inspect } = require('node:util')
const { test } = require('node:test')

test('FormData class custom inspection', (t) => {
  const formData = new FormData()
  formData.append('username', 'john_doe')
  formData.append('email', 'john@example.com')

  const expectedOutput = "FormData {\n  username: 'john_doe',\n  email: 'john@example.com'\n}"

  t.assert.deepStrictEqual(inspect(formData), expectedOutput)
})
