'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert')
const { ProgressEvent } = require('../../lib/fileapi/progressevent')

describe('ProgressEvent', () => {
  it('should create a ProgressEvent', () => {
    const event = new ProgressEvent('test', { lengthComputable: true, loaded: 1, total: 2 })
    assert.strictEqual(event.type, 'test')
    assert.strictEqual(event.lengthComputable, true)
    assert.strictEqual(event.loaded, 1)
    assert.strictEqual(event.total, 2)
  })
})
