'use strict'

const neo = require('neostandard')
const { default: sonarjs } = require('eslint-plugin-sonarjs')
const { installedExports } = require('./lib/global')

module.exports = [
  {
    plugins: { sonarjs },
    ignores: [
      'benchmarks/**',
      'build/**',
      'lib/llhttp',
      'test/**/*',
      'test/fixtures/wpt',
      'test/fixtures/cache-tests',
      'undici-fetch.js'
    ],
    rules: {
      ...sonarjs.configs.recommended.rules,
      'sonarjs/todo-tag': 'off',
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/updated-loop-counter': 'off',
      'sonarjs/no-nested-assignment': 'off',
      'sonarjs/use-type-alias': 'off',
      'sonarjs/no-nested-conditional': 'off'
    }
  },
  ...neo({
    ignores: [
      'lib/llhttp',
      'test/fixtures/cache-tests',
      'undici-fetch.js',
      'test/web-platform-tests/wpt'
    ],
    noJsx: true,
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
      '@typescript-eslint/no-redeclare': 'off',
      'no-restricted-globals': ['error',
        ...installedExports.map(name => {
          return {
            name,
            message: `Use undici-own ${name} instead of the global.`
          }
        })
      ]
    }
  }
]
