'use strict'

// Regression test for https://github.com/nodejs/undici/issues/5835
// A FormData body containing a Blob whose stream() errors (e.g. a
// file-backed Blob from fs.openAsBlob() whose file has since changed)
// must reject the body read instead of crashing the process with an
// unhandled rejection.

const { test } = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { FormData, Response } = require('../..')

test('FormData body with an errored Blob part rejects instead of crashing (issue #5835)', { timeout: 3000 }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'undici-issue-5835-'))
  const file = path.join(dir, 'a')
  fs.writeFileSync(file, 'hello')
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))

  const form = new FormData()
  form.append('file', await fs.openAsBlob(file), 'a')
  // Invalidate the file-backed Blob so that reading its stream() later
  // throws a NotReadableError.
  fs.appendFileSync(file, ' more')

  const onUnhandledRejection = (err) => {
    t.assert.fail(`unexpected unhandled rejection: ${err?.stack || err}`)
  }
  process.once('unhandledRejection', onUnhandledRejection)
  t.after(() => process.removeListener('unhandledRejection', onUnhandledRejection))

  await t.assert.rejects(
    new Response(form).text(),
    (err) => err.name === 'NotReadableError'
  )
})
