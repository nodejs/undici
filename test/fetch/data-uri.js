'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { tspl } = require('@matteo.collina/tspl')
const {
  URLSerializer,
  collectASequenceOfCodePoints,
  stringPercentDecode,
  parseMIMEType,
  collectAnHTTPQuotedString
} = require('../../lib/web/fetch/data-url')
const { fetch } = require('../..')

test('https://url.spec.whatwg.org/#concept-url-serializer', async (t) => {
  await t.test('url scheme gets appended', () => {
    const url = new URL('https://www.google.com/')
    const serialized = URLSerializer(url)

    assert.ok(serialized.startsWith(url.protocol))
  })

  await t.test('non-null url host with authentication', () => {
    const url = new URL('https://username:password@google.com')
    const serialized = URLSerializer(url)

    assert.ok(serialized.includes(`//${url.username}:${url.password}`))
    assert.ok(serialized.endsWith('@google.com/'))
  })

  await t.test('null url host', () => {
    for (const url of ['web+demo:/.//not-a-host/', 'web+demo:/path/..//not-a-host/']) {
      assert.strictEqual(
        URLSerializer(new URL(url)),
        'web+demo:/.//not-a-host/'
      )
    }
  })

  await t.test('url with query works', () => {
    assert.strictEqual(
      URLSerializer(new URL('https://www.google.com/?fetch=undici')),
      'https://www.google.com/?fetch=undici'
    )
  })

  await t.test('exclude fragment', () => {
    assert.strictEqual(
      URLSerializer(new URL('https://www.google.com/#frag')),
      'https://www.google.com/#frag'
    )

    assert.strictEqual(
      URLSerializer(new URL('https://www.google.com/#frag'), true),
      'https://www.google.com/'
    )
  })
})

test('https://infra.spec.whatwg.org/#collect-a-sequence-of-code-points', () => {
  const input = 'text/plain;base64,'
  const position = { position: 0 }
  const result = collectASequenceOfCodePoints(
    (char) => char !== ';',
    input,
    position
  )

  assert.strictEqual(result, 'text/plain')
  assert.strictEqual(position.position, input.indexOf(';'))
})

test('https://url.spec.whatwg.org/#string-percent-decode', async (t) => {
  await t.test('encodes %{2} in range properly', () => {
    const input = '%FF'
    const percentDecoded = stringPercentDecode(input)

    assert.deepStrictEqual(percentDecoded, new Uint8Array([255]))
  })

  await t.test('encodes %{2} not in range properly', () => {
    const input = 'Hello %XD World'
    const percentDecoded = stringPercentDecode(input)
    const expected = [...input].map(c => c.charCodeAt(0))

    assert.deepStrictEqual(percentDecoded, new Uint8Array(expected))
  })

  await t.test('normal string works', () => {
    const input = 'Hello world'
    const percentDecoded = stringPercentDecode(input)
    const expected = [...input].map(c => c.charCodeAt(0))

    assert.deepStrictEqual(percentDecoded, Uint8Array.from(expected))
  })
})

test('https://mimesniff.spec.whatwg.org/#parse-a-mime-type', () => {
  assert.deepStrictEqual(parseMIMEType('text/plain'), {
    type: 'text',
    subtype: 'plain',
    parameters: new Map(),
    essence: 'text/plain'
  })

  assert.deepStrictEqual(parseMIMEType('text/html;charset="shift_jis"iso-2022-jp'), {
    type: 'text',
    subtype: 'html',
    parameters: new Map([['charset', 'shift_jis']]),
    essence: 'text/html'
  })

  assert.deepStrictEqual(parseMIMEType('application/javascript'), {
    type: 'application',
    subtype: 'javascript',
    parameters: new Map(),
    essence: 'application/javascript'
  })
})

test('https://fetch.spec.whatwg.org/#collect-an-http-quoted-string', async (t) => {
  // https://fetch.spec.whatwg.org/#example-http-quoted-string
  await t.test('first', () => {
    const position = { position: 0 }

    assert.strictEqual(collectAnHTTPQuotedString('"\\', {
      position: 0
    }), '"\\')
    assert.strictEqual(collectAnHTTPQuotedString('"\\', position, true), '\\')
    assert.strictEqual(position.position, 2)
  })

  await t.test('second', () => {
    const position = { position: 0 }
    const input = '"Hello" World'

    assert.strictEqual(collectAnHTTPQuotedString(input, {
      position: 0
    }), '"Hello"')
    assert.strictEqual(collectAnHTTPQuotedString(input, position, true), 'Hello')
    assert.strictEqual(position.position, 7)
  })
})

// https://github.com/nodejs/undici/issues/1574
test('too long base64 url', async () => {
  const inputStr = 'a'.repeat(1 << 20)
  const base64 = Buffer.from(inputStr).toString('base64')
  const dataURIPrefix = 'data:application/octet-stream;base64,'
  const dataURL = dataURIPrefix + base64
  try {
    const res = await fetch(dataURL)
    const buf = await res.arrayBuffer()
    const outputStr = Buffer.from(buf).toString('ascii')
    assert.strictEqual(outputStr, inputStr)
  } catch (e) {
    assert.fail(`failed to fetch ${dataURL}`)
  }
})

test('https://domain.com/#', (t) => {
  const { strictEqual } = tspl(t, { plan: 1 })
  const domain = 'https://domain.com/#a'
  const serialized = URLSerializer(new URL(domain))
  strictEqual(serialized, domain)
})

test('https://domain.com/?', (t) => {
  const { strictEqual } = tspl(t, { plan: 1 })
  const domain = 'https://domain.com/?a=b'
  const serialized = URLSerializer(new URL(domain))
  strictEqual(serialized, domain)
})

// https://github.com/nodejs/undici/issues/2474
test('hash url', (t) => {
  const { strictEqual } = tspl(t, { plan: 1 })
  const domain = 'https://domain.com/#a#b'
  const url = new URL(domain)
  const serialized = URLSerializer(url, true)
  strictEqual(serialized, url.href.substring(0, url.href.length - url.hash.length))
})

// https://github.com/nodejs/undici/issues/2474
test('data url that includes the hash', async (t) => {
  const { strictEqual, fail } = tspl(t, { plan: 1 })
  const dataURL = 'data:,node#js#'
  try {
    const res = await fetch(dataURL)
    strictEqual(await res.text(), 'node')
  } catch (error) {
    fail(`failed to fetch ${dataURL}`)
  }
})
