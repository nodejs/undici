'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, describe } = require('node:test')
const { Readable } = require('../lib/api/readable')

describe('Readable', () => {
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

  test('.arrayBuffer()', async function (t) {
    t = tspl(t, { plan: 1 })

    function resume () {
    }
    function abort () {
    }
    const r = new Readable({ resume, abort })

    r.push(Buffer.from('hello world'))

    process.nextTick(() => {
      r.push(null)
    })

    const arrayBuffer = await r.arrayBuffer()

    const expected = new ArrayBuffer(11)
    const view = new Uint8Array(expected)
    view.set(Buffer.from('hello world'))
    t.deepStrictEqual(arrayBuffer, expected)
  })

  test('.bytes()', async function (t) {
    t = tspl(t, { plan: 1 })

    function resume () {
    }
    function abort () {
    }
    const r = new Readable({ resume, abort })

    r.push(Buffer.from('hello'))
    r.push(Buffer.from(' world'))

    process.nextTick(() => {
      r.push(null)
    })

    const bytes = await r.bytes()

    t.deepStrictEqual(bytes, new TextEncoder().encode('hello world'))
  })

  test('.json()', async function (t) {
    t = tspl(t, { plan: 1 })

    function resume () {
    }
    function abort () {
    }
    const r = new Readable({ resume, abort })

    r.push(Buffer.from('{"hello": "world"}'))

    process.nextTick(() => {
      r.push(null)
    })

    const obj = await r.json()

    t.deepStrictEqual(obj, { hello: 'world' })
  })

  test('.text()', async function (t) {
    t = tspl(t, { plan: 1 })

    function resume () {
    }
    function abort () {
    }
    const r = new Readable({ resume, abort })

    r.push(Buffer.from('hello world'))

    process.nextTick(() => {
      r.push(null)
    })

    const text = await r.text()

    t.strictEqual(text, 'hello world')
  })

  test('ignore BOM', async function (t) {
    t = tspl(t, { plan: 1 })

    function resume () {
    }
    function abort () {
    }
    const r = new Readable({ resume, abort })

    r.push('\uFEFF')
    r.push(Buffer.from('hello world'))

    process.nextTick(() => {
      r.push(null)
    })

    const text = await r.text()

    t.strictEqual(text, 'hello world')
  })

  test('.bodyUsed', async function (t) {
    t = tspl(t, { plan: 3 })

    function resume () {
    }
    function abort () {
    }
    const r = new Readable({ resume, abort })

    r.push(Buffer.from('hello world'))

    process.nextTick(() => {
      r.push(null)
    })

    t.strictEqual(r.bodyUsed, false)

    const text = await r.text()

    t.strictEqual(r.bodyUsed, true)

    t.strictEqual(text, 'hello world')
  })
})
