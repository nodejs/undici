'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { Readable } = require('../lib/api/readable')

test('avoid body reordering', async function (t) {
  t = tspl(t, { plan: 1 })

  function resume () {
  }
  function abort () {
  }
  const r = new Readable({ resume, abort })

  r.push(Buffer.from('hello'))

  process.nextTick(() => {
    r.push(Buffer.from('world'))
    r.push(null)
  })

  const text = await r.text()

  t.strictEqual(text, 'helloworld')
})

test('destroy timing text', async function (t) {
  t = tspl(t, { plan: 1 })

  function resume () {
  }
  function abort () {
  }

  const r = new Readable({ resume, abort })
  r.destroy(new Error('kaboom'))

  await t.rejects(r.text(), new Error('kaboom'))
})

test('destroy timing promise', async function (t) {
  t = tspl(t, { plan: 1 })

  function resume () {
  }
  function abort () {
  }
  const r = await new Promise(resolve => {
    const r = new Readable({ resume, abort })
    r.destroy(new Error('kaboom'))
    resolve(r)
  })
  await new Promise(resolve => {
    r.on('error', err => {
      t.ok(err)
      resolve(null)
    })
  })
})
