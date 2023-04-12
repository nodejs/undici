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
