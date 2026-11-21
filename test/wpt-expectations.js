'use strict'

const assert = require('node:assert/strict')
const { test } = require('node:test')

const comparison = import('./web-platform-tests/runner/compare-expectations.mjs')

function expectation (file) {
  return { fetch: { api: { basic: { 'request-head.any.html': file } } } }
}

test('WPT expectation comparison detects file and case outcome changes', async () => {
  const { diffExpectations } = await comparison
  const original = expectation({
    success: true,
    cases: [
      { name: 'passing case', success: true },
      { name: 'known failure', success: false }
    ]
  })

  const caseFailure = structuredClone(original)
  caseFailure.fetch.api.basic['request-head.any.html'].cases[0].success = false
  assert.ok(diffExpectations(original, caseFailure)?.fetch?.api?.basic?.['request-head.any.html'])
  assert.notEqual(diffExpectations(caseFailure, original), undefined)

  const fileFailure = structuredClone(original)
  fileFailure.fetch.api.basic['request-head.any.html'].success = false
  assert.notEqual(diffExpectations(original, fileFailure), undefined)
  assert.notEqual(diffExpectations(fileFailure, original), undefined)
  assert.equal(diffExpectations(original, structuredClone(original)), undefined)
})

test('WPT expectation comparison keeps case slots, files, and legacy leaves', async () => {
  const { diffExpectations } = await comparison
  const original = expectation({ success: 'flaky', cases: [{ name: 'intermittent', flaky: true }] })
  const renamed = expectation({ success: 'flaky', cases: [{ name: 'renamed', flaky: true }] })

  assert.equal(diffExpectations(original, renamed), undefined)
  assert.notEqual(diffExpectations(original, expectation({ success: true, cases: [{ name: 'intermittent', flaky: true }] })), undefined)
  assert.notEqual(diffExpectations(original, expectation({ success: 'flaky', cases: [] })), undefined)
  assert.notEqual(diffExpectations(original, expectation({ success: 'flaky', cases: [{ name: 'intermittent', flaky: true }, { name: 'new', success: true }] })), undefined)
  assert.notEqual(diffExpectations(original, { fetch: { api: { basic: {} } } }), undefined)
  assert.notEqual(diffExpectations({ fetch: { api: { basic: {} } } }, original), undefined)

  const legacy = { fetch: { api: { basic: { 'request-head.any.html': false } } } }
  const changedLegacy = { fetch: { api: { basic: { 'request-head.any.html': true } } } }
  assert.equal(diffExpectations(legacy, structuredClone(legacy)), undefined)
  assert.notEqual(diffExpectations(legacy, changedLegacy), undefined)
  assert.notEqual(diffExpectations(legacy, original), undefined)
})

test('WPT expectation comparison ignores metadata without dropping path names', async () => {
  const { diffExpectations } = await comparison
  const original = expectation({
    success: true,
    skip: true,
    cases: [{ name: 'old name', success: false, message: 'old details' }]
  })
  const changedMetadata = expectation({
    success: true,
    skip: false,
    cases: [{ name: 'new name', success: false, message: 'new details' }]
  })
  const originalCopy = structuredClone(original)
  const changedCopy = structuredClone(changedMetadata)
  assert.equal(diffExpectations(original, changedMetadata), undefined)
  assert.deepEqual(original, originalCopy)
  assert.deepEqual(changedMetadata, changedCopy)

  const namedDirectory = { name: { message: { 'file.any.js': { success: true, cases: [] } } } }
  const changedDirectory = structuredClone(namedDirectory)
  changedDirectory.name.message['file.any.js'].success = false
  assert.ok(diffExpectations(namedDirectory, changedDirectory)?.name?.message?.['file.any.js'])

  const reordered = expectation({
    success: true,
    cases: [
      { name: 'known failure', success: false },
      { name: 'passing case', success: true }
    ]
  })
  const ordered = expectation({
    success: true,
    cases: [
      { name: 'passing case', success: true },
      { name: 'known failure', success: false }
    ]
  })
  assert.notEqual(diffExpectations(ordered, reordered), undefined)
})
