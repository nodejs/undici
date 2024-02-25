'use strict'

const { beforeEach, describe, it } = require('node:test')
const assert = require('node:assert')
const { fetch } = require('../..')
const nodeFetch = require('../../index-fetch')

describe('Issue #2242', () => {
  ['Already aborted', null, false, true, 123, Symbol('Some reason')].forEach(
    (reason) =>
      describe(`when an already-aborted signal's reason is \`${String(
        reason
      )}\``, () => {
        let signal
        beforeEach(() => {
          signal = AbortSignal.abort(reason)
        })
        it('rejects with that reason ', async () => {
          await assert.rejects(fetch('http://localhost', { signal }), (err) => {
            assert.strictEqual(err, reason)
            return true
          })
        })
        it('rejects with that reason (from index-fetch)', async () => {
          await assert.rejects(
            nodeFetch.fetch('http://localhost', { signal }),
            (err) => {
              assert.strictEqual(err, reason)
              return true
            }
          )
        })
      })
  )

  describe("when an already-aborted signal's reason is `undefined`", () => {
    let signal
    beforeEach(() => {
      signal = AbortSignal.abort(undefined)
    })
    it('rejects with an `AbortError`', async () => {
      await assert.rejects(
        fetch('http://localhost', { signal }),
        new DOMException('This operation was aborted', 'AbortError')
      )
    })
    it('rejects with an `AbortError` (from index-fetch)', async () => {
      await assert.rejects(
        nodeFetch.fetch('http://localhost', { signal }),
        new DOMException('This operation was aborted', 'AbortError')
      )
    })
  })
})
