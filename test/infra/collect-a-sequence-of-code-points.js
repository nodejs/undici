'use strict'

const { test } = require('node:test')

const { collectASequenceOfCodePoints } = require('../../lib/web/infra')

test('https://infra.spec.whatwg.org/#collect-a-sequence-of-code-points', (t) => {
  const input = 'text/plain;base64,'
  const position = { position: 0 }
  const result = collectASequenceOfCodePoints(
    (char) => char !== ';',
    input,
    position
  )

  t.assert.strictEqual(result, 'text/plain')
  t.assert.strictEqual(position.position, input.indexOf(';'))
})
