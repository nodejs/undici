'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { setImmediate } = require('node:timers/promises')
const { AsyncLocalStorage } = require('node:async_hooks')
const { tspl } = require('@matteo.collina/tspl')
const {
  Response,
  FormData
} = require('../../')

test('arg validation', async () => {
  // constructor
  assert.throws(() => {
    // eslint-disable-next-line
    new Response(null, 0)
  }, TypeError)
  assert.throws(() => {
    // eslint-disable-next-line
    new Response(null, {
      status: 99
    })
  }, RangeError)
  assert.throws(() => {
    // eslint-disable-next-line
    new Response(null, {
      status: 600
    })
  }, RangeError)
  assert.throws(() => {
    // eslint-disable-next-line
    new Response(null, {
      status: '600'
    })
  }, RangeError)
  assert.throws(() => {
    // eslint-disable-next-line
    new Response(null, {
      statusText: '\u0000'
    })
  }, TypeError)

  for (const nullStatus of [204, 205, 304]) {
    assert.throws(() => {
      // eslint-disable-next-line
      new Response(new ArrayBuffer(16), {
        status: nullStatus
      })
    }, TypeError)
  }

  assert.doesNotThrow(() => {
    Response.prototype[Symbol.toStringTag].charAt(0)
  }, TypeError)

  assert.throws(() => {
    Response.prototype.type.toString()
  }, TypeError)

  assert.throws(() => {
    Response.prototype.url.toString()
  }, TypeError)

  assert.throws(() => {
    Response.prototype.redirected.toString()
  }, TypeError)

  assert.throws(() => {
    Response.prototype.status.toString()
  }, TypeError)

  assert.throws(() => {
    Response.prototype.ok.toString()
  }, TypeError)

  assert.throws(() => {
    Response.prototype.statusText.toString()
  }, TypeError)

  assert.throws(() => {
    Response.prototype.headers.toString()
  }, TypeError)

  assert.throws(() => {
    // eslint-disable-next-line no-unused-expressions
    Response.prototype.body
  }, TypeError)

  assert.throws(() => {
    // eslint-disable-next-line no-unused-expressions
    Response.prototype.bodyUsed
  }, TypeError)

  assert.throws(() => {
    Response.prototype.clone.call(null)
  }, TypeError)

  await assert.rejects(
    new Response('http://localhost').text.call({
      blob () {
        return {
          text () {
            return Promise.resolve('emulating response.blob()')
          }
        }
      }
    }), TypeError)
})

test('response clone', () => {
  // https://github.com/nodejs/undici/issues/1122
  const response1 = new Response(null, { status: 201 })
  const response2 = new Response(undefined, { status: 201 })

  assert.deepStrictEqual(response1.body, response1.clone().body)
  assert.deepStrictEqual(response2.body, response2.clone().body)
  assert.strictEqual(response2.body, null)
})

test('Symbol.toStringTag', () => {
  const resp = new Response()

  assert.strictEqual(resp[Symbol.toStringTag], 'Response')
  assert.strictEqual(Response.prototype[Symbol.toStringTag], 'Response')
})

test('async iterable body', async () => {
  const asyncIterable = {
    async * [Symbol.asyncIterator] () {
      yield 'a'
      yield 'b'
      yield 'c'
    }
  }

  const response = new Response(asyncIterable)
  assert.strictEqual(await response.text(), 'abc')
})

// https://github.com/nodejs/node/pull/43752#issuecomment-1179678544
test('Modifying headers using Headers.prototype.set', () => {
  const response = new Response('body', {
    headers: {
      'content-type': 'test/test',
      'Content-Encoding': 'hello/world'
    }
  })

  const response2 = response.clone()

  response.headers.set('content-type', 'application/wasm')
  response.headers.set('Content-Encoding', 'world/hello')

  assert.strictEqual(response.headers.get('content-type'), 'application/wasm')
  assert.strictEqual(response.headers.get('Content-Encoding'), 'world/hello')

  response2.headers.delete('content-type')
  response2.headers.delete('Content-Encoding')

  assert.strictEqual(response2.headers.get('content-type'), null)
  assert.strictEqual(response2.headers.get('Content-Encoding'), null)
})

// https://github.com/nodejs/node/issues/43838
test('constructing a Response with a ReadableStream body', async (t) => {
  const text = '{"foo":"bar"}'
  const uint8 = new TextEncoder().encode(text)

  await t.test('Readable stream with Uint8Array chunks', async () => {
    const readable = new ReadableStream({
      start (controller) {
        controller.enqueue(uint8)
        controller.close()
      }
    })

    const response1 = new Response(readable)
    const response2 = response1.clone()
    const response3 = response1.clone()

    assert.strictEqual(await response1.text(), text)
    assert.deepStrictEqual(await response2.arrayBuffer(), uint8.buffer)
    assert.deepStrictEqual(await response3.json(), JSON.parse(text))
  })

  await t.test('.arrayBuffer() correctly clones multiple buffers', async () => {
    const buffer = Buffer.allocUnsafeSlow(2 * 1024 - 2)
    const readable = new ReadableStream({
      start (controller) {
        for (let i = 0; i < buffer.length; i += 128) {
          controller.enqueue(buffer.slice(i, i + 128))
        }
        controller.close()
      }
    })

    const response = new Response(readable)
    assert.deepStrictEqual(await response.arrayBuffer(), buffer.buffer)
  })

  await t.test('Readable stream with non-Uint8Array chunks', async () => {
    const readable = new ReadableStream({
      start (controller) {
        controller.enqueue(text) // string
        controller.close()
      }
    })

    const response = new Response(readable)

    await assert.rejects(response.text(), TypeError)
  })

  await t.test('Readable with ArrayBuffer chunk still throws', async () => {
    const readable = new ReadableStream({
      start (controller) {
        controller.enqueue(uint8.buffer)
        controller.close()
      }
    })

    const response1 = new Response(readable)
    const response2 = response1.clone()
    const response3 = response1.clone()
    const response4 = response1.clone()

    await assert.rejects(response1.arrayBuffer(), TypeError)
    await assert.rejects(response2.text(), TypeError)
    await assert.rejects(response3.json(), TypeError)
    await assert.rejects(response4.blob(), TypeError)
  })
})

// https://github.com/nodejs/undici/issues/2465
test('Issue#2465', async (t) => {
  const { strictEqual } = tspl(t, { plan: 1 })
  const response = new Response(new SharedArrayBuffer(0))
  strictEqual(await response.text(), '[object SharedArrayBuffer]')
})

test('Check the Content-Type of invalid formData', async (t) => {
  await t.test('_application/x-www-form-urlencoded', async (t) => {
    const { rejects } = tspl(t, { plan: 1 })
    const response = new Response('x=y', { headers: { 'content-type': '_application/x-www-form-urlencoded' } })
    await rejects(response.formData(), TypeError)
  })

  await t.test('_multipart/form-data', async (t) => {
    const { rejects } = tspl(t, { plan: 1 })
    const formData = new FormData()
    formData.append('x', 'y')
    const response = new Response(formData, { headers: { 'content-type': '_multipart/form-data' } })
    await rejects(response.formData(), TypeError)
  })

  await t.test('application/x-www-form-urlencoded_', async (t) => {
    const { rejects } = tspl(t, { plan: 1 })
    const response = new Response('x=y', { headers: { 'content-type': 'application/x-www-form-urlencoded_' } })
    await rejects(response.formData(), TypeError)
  })

  await t.test('multipart/form-data_', async (t) => {
    const { rejects } = tspl(t, { plan: 1 })
    const formData = new FormData()
    formData.append('x', 'y')
    const response = new Response(formData, { headers: { 'content-type': 'multipart/form-data_' } })
    await rejects(response.formData(), TypeError)
  })
})

test('clone body garbage collection', async () => {
  if (typeof global.gc === 'undefined') {
    throw new Error('gc is not available. Run with \'--expose-gc\'.')
  }
  const asyncLocalStorage = new AsyncLocalStorage()
  let ref

  await new Promise(resolve => {
    asyncLocalStorage.run(new Map(), async () => {
      const res = new Response('hello world')
      const clone = res.clone()

      asyncLocalStorage.getStore().set('key', clone)
      ref = new WeakRef(clone.body)

      await res.text()
      await clone.text() // consume body

      resolve()
    })
  })

  await setImmediate()
  global.gc()

  const cloneBody = ref.deref()
  assert.equal(cloneBody, undefined, 'clone body was not garbage collected')
})
