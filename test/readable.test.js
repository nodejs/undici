'use strict'

const { test } = require('tap')
const Readable = require('../lib/api/readable')

test('avoid body reordering', async function (t) {
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

  t.equal(text, 'helloworld')
})

test('destroy timing text', async function (t) {
  t.plan(1)

  function resume () {
  }
  function abort () {
  }
  const _err = new Error('kaboom')
  const r = new Readable({ resume, abort })
  r.destroy(_err)
  try {
    await r.text()
  } catch (err) {
    t.same(err, _err)
  }
})

test('destroy timing promise', async function (t) {
  t.plan(1)

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
