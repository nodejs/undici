'use strict'

const { test, describe } = require('node:test')

const { bytesMatch } = require('../../lib/web/subresource-integrity/subresource-integrity')
const { runtimeFeatures } = require('../../lib/util/runtime-features')

const skip = runtimeFeatures.has('crypto') === false

describe('bytesMatch', () => {
  test('valid sha256 and base64', { skip }, (t) => {
    const data = Buffer.from('Hello world!')
    const hash256 = 'sha256-wFNeS+K3n/2TKRMFQ2v4iTFOSj+uwF7P/Lt98xrZ5Ro='
    t.assert.ok(bytesMatch(data, hash256))
  })
})
