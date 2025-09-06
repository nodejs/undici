'use strict'

const { test } = require('node:test')
const assert = require('node:assert')

const { collectASequenceOfCodePoints } = require('../../lib/web/infra')

test('https://infra.spec.whatwg.org/#collect-a-sequence-of-code-points', () => {
  const input = 'text/plain;base64,'
  const position = { position: 0 }
  const result = collectASequenceOfCodePoints(
    (char) => char !== ';',
    input,
    position
  )

  assert.strictEqual(result, 'text/plain')
  assert.strictEqual(position.position, input.indexOf(';'))
})
