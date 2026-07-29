'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, describe } = require('node:test')
const { Readable } = require('../lib/api/readable')

describe('Readable', () => {
  test('consume a body whose end has already been emitted', async function (t) {
    t = tspl(t, { plan: 1 })

    function resume () {
    }
    function abort () {
    }
    const r = new Readable({ resume, abort })

    // An empty body, as a 204 gives, drained before anyone asks for it. No data is
    // emitted, so the body is not disturbed and the consume is allowed to proceed -
    // it just starts after 'end'. What must not happen is a throw out of the
    // microtask consumeStart runs on, which no caller can catch.
    r.push(null)
    r.resume()
    await new Promise(resolve => r.on('end', resolve))

    t.strictEqual(await r.text(), '')
  })

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

  test('.json() ignores late chunks after close', async function (t) {
    t = tspl(t, { plan: 2 })

    function resume () {
    }
    function abort () {
    }
    const r = new Readable({ resume, abort })
    const jsonPromise = r.json()

    await new Promise(resolve => queueMicrotask(resolve))

    r.emit('close')
    t.strictEqual(r.push(Buffer.from('late chunk')), true)

    await t.rejects(jsonPromise, { name: 'AbortError' })
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

  test('setEncoding() then .text() keeps chunks pushed after setEncoding()', async function (t) {
    t = tspl(t, { plan: 2 })

    function resume () {
    }
    function abort () {
    }
    const r = new Readable({ resume, abort })

    // '傳' is 3 bytes in UTF-8, so cutting every 2 bytes splits each of them
    // across a chunk boundary.
    const expected = 'a傳b傳c傳d'
    const buf = Buffer.from(expected)
    const chunks = []
    for (let n = 0; n < buf.length; n += 2) {
      chunks.push(buf.subarray(n, n + 2))
    }

    // Buffered when setEncoding() runs: these are replaced by a single decoded
    // string, with the tail of the split '傳' held inside the decoder.
    r.push(chunks[0])
    r.push(chunks[1])

    r.setEncoding('utf8')

    // Pushed after setEncoding() but before .text() is called: these are
    // buffered as decoded strings, not as bytes.
    r.push(chunks[2])
    r.push(chunks[3])

    const promise = r.text()

    // Pushed after .text() but before the consume actually starts.
    r.push(chunks[4])

    setImmediate(() => {
      // Pushed once the consume is running.
      r.push(chunks[5])
      r.push(chunks[6])
      r.push(null)
    })

    const text = await promise

    t.strictEqual(text, expected)
    t.strictEqual(Buffer.byteLength(text), buf.length)
  })

  test('setEncoding() with only a partial character buffered', async function (t) {
    t = tspl(t, { plan: 1 })

    function resume () {
    }
    function abort () {
    }
    const r = new Readable({ resume, abort })

    const buf = Buffer.from('傳')

    // Decodes to the empty string, so setEncoding() leaves nothing buffered
    // and the byte stays inside the decoder.
    r.push(buf.subarray(0, 1))

    r.setEncoding('utf8')

    r.push(buf.subarray(1))

    process.nextTick(() => {
      r.push(null)
    })

    t.strictEqual(await r.text(), '傳')
  })

  for (const encoding of ['utf8', 'hex', 'base64', 'latin1']) {
    test(`setEncoding('${encoding}') before any chunk arrives`, async function (t) {
      t = tspl(t, { plan: 5 })

      function resume () {
      }
      function abort () {
      }

      const buf = Buffer.from('hello 傳 world')

      // Nothing is buffered when setEncoding() runs, so every chunk reaches
      // state.buffer as a decoded string.
      function body () {
        const r = new Readable({ resume, abort })
        r.setEncoding(encoding)
        r.push(buf.subarray(0, 4))
        r.push(buf.subarray(4, 8))
        process.nextTick(() => {
          r.push(buf.subarray(8))
          r.push(null)
        })
        return r
      }

      t.deepStrictEqual(await body().bytes(), new Uint8Array(buf))
      t.deepStrictEqual(new Uint8Array(await body().arrayBuffer()), new Uint8Array(buf))

      const blob = await body().blob()
      t.strictEqual(blob.size, buf.length)
      t.deepStrictEqual(Buffer.from(await blob.arrayBuffer()), buf)

      t.strictEqual(await body().text(), buf.toString(encoding))
    })
  }

  test('setEncoding() then .json()', async function (t) {
    t = tspl(t, { plan: 1 })

    function resume () {
    }
    function abort () {
    }
    const r = new Readable({ resume, abort })

    const buf = Buffer.from(JSON.stringify({ hello: '傳' }))

    r.setEncoding('utf8')
    r.push(buf.subarray(0, 12))

    process.nextTick(() => {
      r.push(buf.subarray(12))
      r.push(null)
    })

    t.deepStrictEqual(await r.json(), { hello: '傳' })
  })
})
