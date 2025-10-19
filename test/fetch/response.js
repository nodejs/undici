'use strict'

const { describe, test } = require('node:test')
const { setImmediate } = require('node:timers/promises')
const { AsyncLocalStorage } = require('node:async_hooks')
const {
  Response,
  FormData
} = require('../../')

test('arg validation', async (t) => {
  // constructor
  t.assert.throws(() => {
    // eslint-disable-next-line
    new Response(null, 0)
  }, TypeError)
  t.assert.throws(() => {
    // eslint-disable-next-line
    new Response(null, {
      status: 99
    })
  }, RangeError)
  t.assert.throws(() => {
    // eslint-disable-next-line
    new Response(null, {
      status: 600
    })
  }, RangeError)
  t.assert.throws(() => {
    // eslint-disable-next-line
    new Response(null, {
      status: '600'
    })
  }, RangeError)
  t.assert.throws(() => {
    // eslint-disable-next-line
    new Response(null, {
      statusText: '\u0000'
    })
  }, TypeError)

  for (const nullStatus of [204, 205, 304]) {
    t.assert.throws(() => {
      // eslint-disable-next-line
      new Response(new ArrayBuffer(16), {
        status: nullStatus
      })
    }, TypeError)
  }

  t.assert.doesNotThrow(() => {
    Response.prototype[Symbol.toStringTag].charAt(0)
  }, TypeError)

  t.assert.throws(() => {
    Response.prototype.type.toString()
  }, TypeError)

  t.assert.throws(() => {
    Response.prototype.url.toString()
  }, TypeError)

  t.assert.throws(() => {
    Response.prototype.redirected.toString()
  }, TypeError)

  t.assert.throws(() => {
    Response.prototype.status.toString()
  }, TypeError)

  t.assert.throws(() => {
    Response.prototype.ok.toString()
  }, TypeError)

  t.assert.throws(() => {
    Response.prototype.statusText.toString()
  }, TypeError)

  t.assert.throws(() => {
    Response.prototype.headers.toString()
  }, TypeError)

  t.assert.throws(() => {
    // eslint-disable-next-line no-unused-expressions
    Response.prototype.body
  }, TypeError)

  t.assert.throws(() => {
    // eslint-disable-next-line no-unused-expressions
    Response.prototype.bodyUsed
  }, TypeError)

  t.assert.throws(() => {
    Response.prototype.clone.call(null)
  }, TypeError)

  await t.assert.rejects(
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

test('response clone', (t) => {
  // https://github.com/nodejs/undici/issues/1122
  const response1 = new Response(null, { status: 201 })
  const response2 = new Response(undefined, { status: 201 })

  t.assert.deepStrictEqual(response1.body, response1.clone().body)
  t.assert.deepStrictEqual(response2.body, response2.clone().body)
  t.assert.strictEqual(response2.body, null)
})

test('Symbol.toStringTag', (t) => {
  const resp = new Response()

  t.assert.strictEqual(resp[Symbol.toStringTag], 'Response')
  t.assert.strictEqual(Response.prototype[Symbol.toStringTag], 'Response')
})

test('async iterable body', async (t) => {
  const asyncIterable = {
    async * [Symbol.asyncIterator] () {
      yield 'a'
      yield 'b'
      yield 'c'
    }
  }

  const response = new Response(asyncIterable)
  t.assert.strictEqual(await response.text(), 'abc')
})

// https://github.com/nodejs/node/pull/43752#issuecomment-1179678544
test('Modifying headers using Headers.prototype.set', (t) => {
  const response = new Response('body', {
    headers: {
      'content-type': 'test/test',
      'Content-Encoding': 'hello/world'
    }
  })

  const response2 = response.clone()

  response.headers.set('content-type', 'application/wasm')
  response.headers.set('Content-Encoding', 'world/hello')

  t.assert.strictEqual(response.headers.get('content-type'), 'application/wasm')
  t.assert.strictEqual(response.headers.get('Content-Encoding'), 'world/hello')

  response2.headers.delete('content-type')
  response2.headers.delete('Content-Encoding')

  t.assert.strictEqual(response2.headers.get('content-type'), null)
  t.assert.strictEqual(response2.headers.get('Content-Encoding'), null)
})

// https://github.com/nodejs/node/issues/43838
describe('constructing a Response with a ReadableStream body', () => {
  const text = '{"foo":"bar"}'
  const uint8 = new TextEncoder().encode(text)

  test('Readable stream with Uint8Array chunks', async (t) => {
    const readable = new ReadableStream({
      start (controller) {
        controller.enqueue(uint8)
        controller.close()
      }
    })

    const response1 = new Response(readable)
    const response2 = response1.clone()
    const response3 = response1.clone()

    t.assert.strictEqual(await response1.text(), text)
    t.assert.deepStrictEqual(await response2.arrayBuffer(), uint8.buffer)
    t.assert.deepStrictEqual(await response3.json(), JSON.parse(text))
  })

  test('.arrayBuffer() correctly clones multiple buffers', async (t) => {
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
    t.assert.deepStrictEqual(await response.arrayBuffer(), buffer.buffer)
  })

  test('Readable stream with non-Uint8Array chunks', async (t) => {
    const readable = new ReadableStream({
      start (controller) {
        controller.enqueue(text) // string
        controller.close()
      }
    })

    const response = new Response(readable)

    await t.assert.rejects(response.text(), TypeError)
  })

  test('Readable with ArrayBuffer chunk still throws', async (t) => {
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

    await t.assert.rejects(response1.arrayBuffer(), TypeError)
    await t.assert.rejects(response2.text(), TypeError)
    await t.assert.rejects(response3.json(), TypeError)
    await t.assert.rejects(response4.blob(), TypeError)
  })
})

// https://github.com/nodejs/undici/issues/2465
test('Issue#2465', async (t) => {
  t.plan(1)
  const response = new Response(new SharedArrayBuffer(0))
  t.assert.strictEqual(await response.text(), '[object SharedArrayBuffer]')
})

describe('Check the Content-Type of invalid formData', () => {
  test('_application/x-www-form-urlencoded', async (t) => {
    t.plan(1)
    const response = new Response('x=y', { headers: { 'content-type': '_application/x-www-form-urlencoded' } })
    await t.assert.rejects(response.formData(), TypeError)
  })

  test('_multipart/form-data', async (t) => {
    t.plan(1)
    const formData = new FormData()
    formData.append('x', 'y')
    const response = new Response(formData, { headers: { 'content-type': '_multipart/form-data' } })
    await t.assert.rejects(response.formData(), TypeError)
  })

  test('application/x-www-form-urlencoded_', async (t) => {
    t.plan(1)
    const response = new Response('x=y', { headers: { 'content-type': 'application/x-www-form-urlencoded_' } })
    await t.assert.rejects(response.formData(), TypeError)
  })

  test('multipart/form-data_', async (t) => {
    t.plan(1)
    const formData = new FormData()
    formData.append('x', 'y')
    const response = new Response(formData, { headers: { 'content-type': 'multipart/form-data_' } })
    await t.assert.rejects(response.formData(), TypeError)
  })
})

test('clone body garbage collection', async (t) => {
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
  t.assert.strictEqual(cloneBody, undefined, 'clone body was not garbage collected')
})
