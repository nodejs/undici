'use strict'

const { test } = require('tap')
const { File, FileLike } = require('../../lib/fetch/file')

test('args validation', (t) => {
  t.plan(14)

  t.throws(() => {
    File.prototype.name.toString()
  }, TypeError)
  t.throws(() => {
    File.prototype.lastModified.toString()
  }, TypeError)
  t.doesNotThrow(() => {
    File.prototype[Symbol.toStringTag].charAt(0)
  }, TypeError)

  t.throws(() => {
    FileLike.prototype.stream.call(null)
  }, TypeError)
  t.throws(() => {
    FileLike.prototype.arrayBuffer.call(null)
  }, TypeError)
  t.throws(() => {
    FileLike.prototype.slice.call(null)
  }, TypeError)
  t.throws(() => {
    FileLike.prototype.text.call(null)
  }, TypeError)
  t.throws(() => {
    FileLike.prototype.size.toString()
  }, TypeError)
  t.throws(() => {
    FileLike.prototype.type.toString()
  }, TypeError)
  t.throws(() => {
    FileLike.prototype.name.toString()
  }, TypeError)
  t.throws(() => {
    FileLike.prototype.lastModified.toString()
  }, TypeError)
  t.doesNotThrow(() => {
    FileLike.prototype[Symbol.toStringTag].charAt(0)
  }, TypeError)

  t.equal(File.prototype[Symbol.toStringTag], 'File')
  t.equal(FileLike.prototype[Symbol.toStringTag], 'File')
})

test('return value of File.lastModified', (t) => {
  t.plan(2)

  const f = new File(['asd1'], 'filename123')
  const lastModified = f.lastModified
  t.ok(typeof lastModified === typeof Date.now())
  t.ok(lastModified >= 0 && lastModified <= Date.now())
})

test('Symbol.toStringTag', (t) => {
  t.plan(2)
  t.equal(new File([], '')[Symbol.toStringTag], 'File')
  t.equal(new FileLike()[Symbol.toStringTag], 'File')
})

test('arguments', (t) => {
  t.throws(() => {
    new File() // eslint-disable-line no-new
  }, TypeError)

  t.throws(() => {
    new File([]) // eslint-disable-line no-new
  }, TypeError)

  t.end()
})

test('lastModified', (t) => {
  const file = new File([], '')
  const lastModified = Date.now() - 69_000

  t.notOk(file === 0)

  const file1 = new File([], '', { lastModified })
  t.equal(file1.lastModified, lastModified)

  t.equal(new File([], '', { lastModified: 0 }).lastModified, 0)

  t.equal(
    new File([], '', {
      lastModified: true
    }).lastModified,
    1
  )

  t.end()
})
