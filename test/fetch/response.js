'use strict'

const { test } = require('tap')
const {
  Response
} = require('../../')
const {
  Blob: ThirdPartyBlob,
  FormData: ThirdPartyFormData
} = require('formdata-node')

test('arg validation', async (t) => {
  // constructor
  t.throws(() => {
    // eslint-disable-next-line
    new Response(null, 0)
  }, TypeError)
  t.throws(() => {
    // eslint-disable-next-line
    new Response(null, {
      status: 99
    })
  }, RangeError)
  t.throws(() => {
    // eslint-disable-next-line
    new Response(null, {
      status: 600
    })
  }, RangeError)
  t.throws(() => {
    // eslint-disable-next-line
    new Response(null, {
      status: '600'
    })
  }, RangeError)
  t.throws(() => {
    // eslint-disable-next-line
    new Response(null, {
      statusText: '\u0000'
    })
  }, TypeError)

  for (const nullStatus of [204, 205, 304]) {
    t.throws(() => {
      // eslint-disable-next-line
      new Response(new ArrayBuffer(16), {
        status: nullStatus
      })
    }, TypeError)
  }

  t.doesNotThrow(() => {
    Response.prototype[Symbol.toStringTag].charAt(0)
  }, TypeError)

  t.throws(() => {
    Response.prototype.type.toString()
  }, TypeError)

  t.throws(() => {
    Response.prototype.url.toString()
  }, TypeError)

  t.throws(() => {
    Response.prototype.redirected.toString()
  }, TypeError)

  t.throws(() => {
    Response.prototype.status.toString()
  }, TypeError)

  t.throws(() => {
    Response.prototype.ok.toString()
  }, TypeError)

  t.throws(() => {
    Response.prototype.statusText.toString()
  }, TypeError)

  t.throws(() => {
    Response.prototype.headers.toString()
  }, TypeError)

  t.throws(() => {
    // eslint-disable-next-line no-unused-expressions
    Response.prototype.body
  }, TypeError)

  t.throws(() => {
    // eslint-disable-next-line no-unused-expressions
    Response.prototype.bodyUsed
  }, TypeError)

  t.throws(() => {
    Response.prototype.clone.call(null)
  }, TypeError)

  await t.rejects(async () => {
    await new Response('http://localhost').text.call({
      blob () {
        return {
          text () {
            return Promise.resolve('emulating response.blob()')
          }
        }
      }
    })
  }, TypeError)

  t.end()
})

test('response clone', (t) => {
  // https://github.com/nodejs/undici/issues/1122
  const response1 = new Response(null, { status: 201 })
  const response2 = new Response(undefined, { status: 201 })

  t.equal(response1.body, response1.clone().body)
  t.equal(response2.body, response2.clone().body)
  t.equal(response2.body, null)
  t.end()
})

test('Symbol.toStringTag', (t) => {
  const resp = new Response()

  t.equal(resp[Symbol.toStringTag], 'Response')
  t.equal(Response.prototype[Symbol.toStringTag], 'Response')
  t.end()
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
  t.equal(await response.text(), 'abc')
  t.end()
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

  t.equal(response.headers.get('content-type'), 'application/wasm')
  t.equal(response.headers.get('Content-Encoding'), 'world/hello')

  response2.headers.delete('content-type')
  response2.headers.delete('Content-Encoding')

  t.equal(response2.headers.get('content-type'), null)
  t.equal(response2.headers.get('Content-Encoding'), null)

  t.end()
})

// https://github.com/nodejs/node/issues/43838
test('constructing a Response with a ReadableStream body', { skip: process.version.startsWith('v16.') }, async (t) => {
  const text = '{"foo":"bar"}'
  const uint8 = new TextEncoder().encode(text)

  t.test('Readable stream with Uint8Array chunks', async (t) => {
    const readable = new ReadableStream({
      start (controller) {
        controller.enqueue(uint8)
        controller.close()
      }
    })

    const response1 = new Response(readable)
    const response2 = response1.clone()
    const response3 = response1.clone()

    t.equal(await response1.text(), text)
    t.same(await response2.arrayBuffer(), uint8.buffer)
    t.same(await response3.json(), JSON.parse(text))

    t.end()
  })

  t.test('Readable stream with non-Uint8Array chunks', async (t) => {
    const readable = new ReadableStream({
      start (controller) {
        controller.enqueue(text) // string
        controller.close()
      }
    })

    const response = new Response(readable)

    await t.rejects(response.text(), TypeError)

    t.end()
  })

  t.test('Readable with ArrayBuffer chunk still throws', { skip: process.version.startsWith('v16.') }, async (t) => {
    const readable = new ReadableStream({
      start (controller) {
        controller.enqueue(uint8.buffer)
        controller.close()
      }
    })

    const response1 = new Response(readable)
    const response2 = response1.clone()
    const response3 = response1.clone()
    // const response4 = response1.clone()

    await t.rejects(response1.arrayBuffer(), TypeError)
    await t.rejects(response2.text(), TypeError)
    await t.rejects(response3.json(), TypeError)
    // TODO: on Node v16.8.0, this throws a TypeError
    // because the body is detected as disturbed.
    // await t.rejects(response4.blob(), TypeError)

    t.end()
  })

  t.end()
})

test('constructing Response with third party Blob body', async (t) => {
  const blob = new ThirdPartyBlob(['text'])
  const res = new Response(blob)
  t.equal(await res.text(), 'text')
})
test('constructing Response with third party FormData body', async (t) => {
  const form = new ThirdPartyFormData()
  form.set('key', 'value')
  const res = new Response(form)
  const contentType = res.headers.get('content-type').split('=')
  t.equal(contentType[0], 'multipart/form-data; boundary')
  t.ok((await res.text()).startsWith(`--${contentType[1]}`))
})

// https://github.com/nodejs/undici/issues/2465
test('Issue#2465', async (t) => {
  t.plan(1)
  const response = new Response(new SharedArrayBuffer(0))
  t.equal(await response.text(), '[object SharedArrayBuffer]')
})
