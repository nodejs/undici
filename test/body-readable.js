'use strict'
const Readable = require('../lib/node/readable')
const { test } = require('tap')

test('body readable', t => {
  // Ported from https://github.com/nodejs/node/pull/39520.

  let counter = 0
  const assert = Object.assign(t.ok.bind(t), {
    strictEqual: t.equal,
    deepStrictEqual: t.strictSame
  })
  const common = {
    mustCall (fn, count = 1) {
      if (Number.isFinite(fn)) {
        count = fn
        fn = null
      }
      counter++
      return (...args) => {
        count -= 1
        if (count < 0) {
          t.fail()
        } else if (count === 0) {
          counter -= 1
          queueMicrotask(() => {
            if (counter === 0) {
              t.end()
              counter = null
            }
          })
        }
        return fn && fn(...args)
      }
    },
    mustNotCall () {
      return () => (
        t.fail()
      )
    },
    mustCallAtLeast (...args) {
      return common.mustCall(...args)
    }
  }

  {
    const r = new Readable({
      read () {
        this.push('asd')
        this.push(null)
      }
    })
    assert.strictEqual(r.bodyUsed, false)
    r.on('end', common.mustCall())
    // r.on('close', common.mustCall()) Node < 14
    r.text().then(common.mustCall((val) => {
      assert.strictEqual(r.bodyUsed, true)
      assert.strictEqual(val, 'asd')
    }))
    process.nextTick(() => {
      assert.strictEqual(r.isPaused(), false)
    })
  }

  {
    const n = ['a', 's', 'd', null]
    const r = new Readable({
      read () {
        this.push(n.shift())
      }
    })
    assert.strictEqual(r.bodyUsed, false)
    r.on('end', common.mustCall())
    // r.on('close', common.mustCall()) Node < 14
    r.text().then(common.mustCall((val) => {
      assert.strictEqual(r.bodyUsed, true)
      assert.strictEqual(val, 'asd')
    }))
    process.nextTick(() => {
      assert.strictEqual(r.isPaused(), false)
    })
  }

  {
    const r = new Readable({
      read () {
        this.push('asd')
        this.push(null)
      }
    })
    assert.strictEqual(r.bodyUsed, false)
    r.on('error', common.mustCall(() => {
      assert.strictEqual(r.bodyUsed, true)
    }))
    // r.on('close', common.mustCall()) Node < 14
    const _err = new Error()
    r.text().catch(common.mustCall((err) => assert.strictEqual(err, _err)))
    r.destroy(_err)
    process.nextTick(() => {
      assert.strictEqual(r.isPaused(), false)
    })
  }

  {
    const obj = { asd: '123' }
    const r = new Readable({
      read () {
        this.push(JSON.stringify(obj))
        this.push(null)
      }
    })
    assert.strictEqual(r.bodyUsed, false)
    r.on('end', common.mustCall())
    // r.on('close', common.mustCall()) Node < 14
    r.json().then(common.mustCall((val) => {
      assert.strictEqual(r.bodyUsed, true)
      assert.deepStrictEqual(val, obj)
    }))
    process.nextTick(() => {
      assert.strictEqual(r.isPaused(), false)
    })
  }

  {
    const r = new Readable({
      read () {
        this.push('asd')
        this.push(null)
      }
    })
    assert.strictEqual(r.bodyUsed, false)
    r.on('error', common.mustCall(() => {
      assert.strictEqual(r.bodyUsed, true)
    }))
    // r.on('close', common.mustCall()) Node < 14
    r.json()
      .catch(common.mustCall((err) => {
        assert.strictEqual(err.message, 'Unexpected token a in JSON at position 0')
        assert.strictEqual(r.bodyUsed, true)
      }))
    process.nextTick(() => {
      assert.strictEqual(r.isPaused(), false)
    })
  }

  {
    const r = new Readable({
      read () {
        this.push('asd')
        this.push(null)
      }
    })
    assert.strictEqual(r.bodyUsed, false)
    r.on('error', common.mustCall(() => {
      assert.strictEqual(r.bodyUsed, true)
    }))
    // r.on('close', common.mustCall()) Node < 14
    r.json().catch(common.mustCall((err) => {
      assert.strictEqual(r.bodyUsed, true)
      assert(err)
    }))
    process.nextTick(() => {
      assert.strictEqual(r.isPaused(), false)
    })
  }

  {
    const buf = Uint8Array.from('asd')
    const r = new Readable({
      read () {
        this.push(buf)
        this.push(null)
      }
    })
    assert.strictEqual(r.bodyUsed, false)
    r.on('end', common.mustCall())
    // r.on('close', common.mustCall()) Node < 14
    r.arrayBuffer()
      .then(common.mustCall((val) => assert.deepStrictEqual(val, buf)))
    process.nextTick(() => {
      assert.strictEqual(r.isPaused(), false)
    })
  }

  {
    const r = new Readable({
      read () {
        this.push('asd')
        this.push(null)
      }
    })
    assert.strictEqual(r.bodyUsed, false)
    r.pause()
    assert.strictEqual(r.bodyUsed, false)
    r.on('data', common.mustCall(() => {
      assert.strictEqual(r.bodyUsed, true)
    }))
    r.on('end', common.mustCall())
    // r.on('close', common.mustCall()) Node < 14
    r.text().then(common.mustCall((val) => assert.strictEqual(val, 'asd')))
    process.nextTick(() => {
      assert.strictEqual(r.bodyUsed, true)
      assert.strictEqual(r.isPaused(), false)
    })
  }

  {
    const n = ['a', 's', 'd', null]
    const r = new Readable({
      read () {
        this.push(n.shift())
      }
    })
    assert.strictEqual(r.bodyUsed, false)
    r.pause()
    assert.strictEqual(r.bodyUsed, false)
    r.on('data', common.mustCallAtLeast(3))
    r.on('end', common.mustCall())
    // r.on('close', common.mustCall()) Node < 14
    r.text().then(common.mustCall((val) => assert.strictEqual(val, 'asd')))
    process.nextTick(() => {
      assert.strictEqual(r.bodyUsed, true)
      assert.strictEqual(r.isPaused(), false)
    })
  }

  {
    const r = new Readable({
      read () {
        this.push('asd')
        this.push(null)
      }
    })
    assert.strictEqual(r.bodyUsed, false)
    r.pause()
    assert.strictEqual(r.bodyUsed, false)
    r.on('data', common.mustNotCall())
    r.on('error', common.mustCall())
    // r.on('close', common.mustCall()) Node < 14
    const _err = new Error()
    r.text().catch(common.mustCall((err) => assert.strictEqual(err, _err)))
    r.destroy(_err)
    process.nextTick(() => {
      assert.strictEqual(r.bodyUsed, true)
      assert.strictEqual(r.isPaused(), false)
    })
  }

  {
    const obj = { asd: '123' }
    const r = new Readable({
      read () {
        this.push(JSON.stringify(obj))
        this.push(null)
      }
    })
    assert.strictEqual(r.bodyUsed, false)
    r.pause()
    assert.strictEqual(r.bodyUsed, false)
    r.on('data', common.mustCall(() => {
      assert.strictEqual(r.bodyUsed, true)
    }))
    r.on('end', common.mustCall())
    // r.on('close', common.mustCall()) Node < 14
    r.json().then(common.mustCall((val) => assert.deepStrictEqual(val, obj)))
    process.nextTick(() => {
      assert.strictEqual(r.bodyUsed, true)
      assert.strictEqual(r.isPaused(), false)
    })
  }

  {
    const r = new Readable({
      read () {
        this.push('asd')
        this.push(null)
      }
    })
    assert.strictEqual(r.bodyUsed, false)
    r.pause()
    assert.strictEqual(r.bodyUsed, false)
    r.on('data', common.mustCall(() => {
      assert.strictEqual(r.bodyUsed, true)
    }))
    r.on('error', common.mustCall(() => {
      assert.strictEqual(r.bodyUsed, true)
    }))
    // r.on('close', common.mustCall()) Node < 14
    r.json()
      .catch(common.mustCall((err) => assert.strictEqual(
        err.message, 'Unexpected token a in JSON at position 0')))
    process.nextTick(() => {
      assert.strictEqual(r.bodyUsed, true)
      assert.strictEqual(r.isPaused(), false)
    })
  }

  {
    const buf = Uint8Array.from('asd')
    const r = new Readable({
      read () {
        this.push(buf)
        this.push(null)
      }
    })
    assert.strictEqual(r.bodyUsed, false)
    r.pause()
    assert.strictEqual(r.bodyUsed, false)
    r.on('data', common.mustCall())
    r.on('end', common.mustCall())
    // r.on('close', common.mustCall()) Node < 14
    r.arrayBuffer()
      .then(common.mustCall((val) => assert.deepStrictEqual(val, buf)))
    process.nextTick(() => {
      assert.strictEqual(r.bodyUsed, true)
      assert.strictEqual(r.isPaused(), false)
    })
  }

  {
    const buf = Uint8Array.from('asd')
    const r = new Readable({
      read () {
        this.push(buf)
        this.push(null)
      }
    })
    assert.strictEqual(r.bodyUsed, false)
    assert.strictEqual(r.bodyUsed, false)
    r.on('data', common.mustCall(() => {
      assert.strictEqual(r.bodyUsed, true)
      r.json()
        .catch(common.mustCall((err) => assert(
          err instanceof TypeError)))
      r.arrayBuffer()
        .catch(common.mustCall((err) => assert(
          err instanceof TypeError)))
      r.blob()
        .catch(common.mustCall((err) => assert(
          err instanceof TypeError)))
      r.text()
        .catch(common.mustCall((err) => assert(
          err instanceof TypeError)))
    }))
    r.on('error', common.mustNotCall())
    r.on('end', common.mustCall())
    // r.on('close', common.mustCall()) Node < 14
  }

  {
    const r = new Readable({
      read () {
        this.push(null)
      }
    })
    assert.strictEqual(r.bodyUsed, false)
    assert.strictEqual(r.bodyUsed, false)
    r.on('end', common.mustCall(() => {
      assert.strictEqual(r.bodyUsed, true)
      r.json()
        .catch(common.mustCall((err) => assert(
          err instanceof TypeError)))
      r.arrayBuffer()
        .catch(common.mustCall((err) => assert(
          err instanceof TypeError)))
      r.blob()
        .catch(common.mustCall((err) => assert(
          err instanceof TypeError)))
      r.text()
        .catch(common.mustCall((err) => assert(
          err instanceof TypeError)))
    }))
    r.on('error', common.mustNotCall())
    r.on('data', common.mustNotCall())
    // r.on('close', common.mustCall()) Node < 14
  }

  for (const key of ['text', 'json', 'arrayBuffer', 'blob']) {
    const r = new Readable({
      read () {
      }
    })
    assert.strictEqual(r.bodyUsed, false)
    assert.strictEqual(r.bodyUsed, false)
    r[key]()
      .catch(common.mustCall((err) => assert.strictEqual(
        err.name, 'RequestAbortedError')))
    r.destroy()
    r.on('error', common.mustNotCall())
    r.on('end', common.mustNotCall())
    r.on('data', common.mustNotCall())
    // r.on('close', common.mustCall()) Node < 14
  }
})
