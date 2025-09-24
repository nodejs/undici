'use strict'

const { beforeEach, describe, it } = require('node:test')
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
        it('rejects with that reason ', async (t) => {
          await t.assert.rejects(fetch('http://localhost', { signal }), (err) => {
            t.assert.strictEqual(err, reason)
            return true
          })
        })
        it('rejects with that reason (from index-fetch)', async (t) => {
          await t.assert.rejects(
            nodeFetch.fetch('http://localhost', { signal }),
            (err) => {
              t.assert.strictEqual(err, reason)
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
    it('rejects with an `AbortError`', async (t) => {
      await t.assert.rejects(
        fetch('http://localhost', { signal }),
        new DOMException('This operation was aborted', 'AbortError')
      )
    })
    it('rejects with an `AbortError` (from index-fetch)', async (t) => {
      await t.assert.rejects(
        nodeFetch.fetch('http://localhost', { signal }),
        new DOMException('This operation was aborted', 'AbortError')
      )
    })
  })
})
