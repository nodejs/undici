'use strict'

const { test } = require('tap')
const { FormData, File } = require('../../')
const { Blob } = require('buffer')

test('arg validation', (t) => {
  const form = new FormData()

  // constructor
  t.throws(() => {
    // eslint-disable-next-line
    new FormData('asd')
  }, TypeError)

  // append
  t.throws(() => {
    FormData.prototype.append.call(null)
  }, TypeError)
  t.throws(() => {
    form.append()
  }, TypeError)
  t.throws(() => {
    form.append('k', 'not usv', '')
  }, TypeError)

  // delete
  t.throws(() => {
    FormData.prototype.delete.call(null)
  }, TypeError)
  t.throws(() => {
    form.delete()
  }, TypeError)

  // get
  t.throws(() => {
    FormData.prototype.get.call(null)
  }, TypeError)
  t.throws(() => {
    form.get()
  }, TypeError)

  // getAll
  t.throws(() => {
    FormData.prototype.getAll.call(null)
  }, TypeError)
  t.throws(() => {
    form.getAll()
  }, TypeError)

  // has
  t.throws(() => {
    FormData.prototype.has.call(null)
  }, TypeError)
  t.throws(() => {
    form.has()
  }, TypeError)

  // set
  t.throws(() => {
    FormData.prototype.set.call(null)
  }, TypeError)
  t.throws(() => {
    form.set('k')
  }, TypeError)
  t.throws(() => {
    form.set('k', 'not usv', '')
  }, TypeError)

  // iterator
  t.throws(() => {
    Reflect.apply(FormData.prototype[Symbol.iterator], null)
  }, TypeError)

  t.end()
})

test('append file', (t) => {
  const form = new FormData()
  form.set('asd', new File([], 'asd1'), 'asd2')
  form.append('asd2', new File([], 'asd1'), 'asd2')

  t.equal(form.has('asd'), true)
  t.equal(form.has('asd2'), true)
  t.equal(form.get('asd').name, 'asd2')
  t.equal(form.get('asd2').name, 'asd2')
  form.delete('asd')
  t.equal(form.get('asd'), null)
  t.equal(form.has('asd2'), true)
  t.equal(form.has('asd'), false)

  t.end()
})

test('append blob', async (t) => {
  const form = new FormData()
  form.set('asd', new Blob(['asd1']))

  t.equal(form.has('asd'), true)
  t.equal(await form.get('asd').text(), 'asd1')
  form.delete('asd')
  t.equal(form.get('asd'), null)

  t.end()
})

test('append string', (t) => {
  const form = new FormData()
  form.set('k1', 'v1')
  form.set('k2', 'v2')
  t.same([...form], [['k1', 'v1'], ['k2', 'v2']])
  t.equal(form.has('k1'), true)
  t.equal(form.get('k1'), 'v1')
  form.append('k1', 'v1+')
  t.same(form.getAll('k1'), ['v1', 'v1+'])
  form.set('k2', 'v1++')
  t.equal(form.get('k2'), 'v1++')
  form.delete('asd')
  t.equal(form.get('asd'), null)
  t.end()
})
