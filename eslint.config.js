'use strict'

const neo = require('neostandard')

module.exports = [
  ...neo({
    env: ['jest'],
    ignores: [
      'lib/llhttp',
      'test/fixtures/wpt',
      'undici-fetch.js'
    ],
    ts: true
  }),
  {
    rules: {
      '@stylistic/comma-dangle': ['error', {
        arrays: 'never',
        objects: 'never',
        imports: 'never',
        exports: 'never',
        functions: 'never'
      }],
      '@typescript-eslint/no-redeclare': 'off'
    }
  }
]
