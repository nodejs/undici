'use strict'

const { test } = require('tap')
const { File, FileLike } = require('../../lib/fetch/file')

test('Symbol.toStringTag', (t) => {
  t.plan(2)
  t.equal(new File()[Symbol.toStringTag], 'File')
  t.equal(new FileLike()[Symbol.toStringTag], 'File')
})
