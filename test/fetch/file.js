'use strict'

const { test } = require('tap')
const { File, FileLike } = require('../../lib/fetch/file')

test('Symbol.toStringTag', (t) => {
  t.plan(2)
  t.equal(File.prototype[Symbol.toStringTag], 'File')
  t.equal(FileLike.prototype[Symbol.toStringTag], 'File')
})
