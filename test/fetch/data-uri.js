'use strict'

const { test } = require('tap')
const {
  URLSerializer,
  collectASequenceOfCodePoints,
  stringPercentDecode,
  parseMIMEType,
  collectAnHTTPQuotedString
} = require('../../lib/fetch/dataURL')
const { fetch } = require('../..')

test('https://url.spec.whatwg.org/#concept-url-serializer', (t) => {
  t.test('url scheme gets appended', (t) => {
    const url = new URL('https://www.google.com/')
    const serialized = URLSerializer(url)

    t.ok(serialized.startsWith(url.protocol))
    t.end()
  })

  t.test('non-null url host with authentication', (t) => {
    const url = new URL('https://username:password@google.com')
    const serialized = URLSerializer(url)

    t.ok(serialized.includes(`//${url.username}:${url.password}`))
    t.ok(serialized.endsWith('@google.com/'))
    t.end()
  })

  t.test('null url host', (t) => {
    for (const url of ['web+demo:/.//not-a-host/', 'web+demo:/path/..//not-a-host/']) {
      t.equal(
        URLSerializer(new URL(url)),
        'web+demo:/.//not-a-host/'
      )
    }

    t.end()
  })

  t.test('url with query works', (t) => {
    t.equal(
      URLSerializer(new URL('https://www.google.com/?fetch=undici')),
      'https://www.google.com/?fetch=undici'
    )

    t.end()
  })

  t.test('exclude fragment', (t) => {
    t.equal(
      URLSerializer(new URL('https://www.google.com/#frag')),
      'https://www.google.com/#frag'
    )

    t.equal(
      URLSerializer(new URL('https://www.google.com/#frag'), true),
      'https://www.google.com/'
    )

    t.end()
  })

  t.end()
})

test('https://infra.spec.whatwg.org/#collect-a-sequence-of-code-points', (t) => {
  const input = 'text/plain;base64,'
  const position = { position: 0 }
  const result = collectASequenceOfCodePoints(
    (char) => char !== ';',
    input,
    position
  )

  t.strictSame(result, 'text/plain')
  t.strictSame(position.position, input.indexOf(';'))
  t.end()
})

test('https://url.spec.whatwg.org/#string-percent-decode', (t) => {
  t.test('encodes %{2} in range properly', (t) => {
    const input = '%FF'
    const percentDecoded = stringPercentDecode(input)

    t.same(percentDecoded, new Uint8Array([255]))
    t.end()
  })

  t.test('encodes %{2} not in range properly', (t) => {
    const input = 'Hello %XD World'
    const percentDecoded = stringPercentDecode(input)
    const expected = [...input].map(c => c.charCodeAt(0))

    t.same(percentDecoded, expected)
    t.end()
  })

  t.test('normal string works', (t) => {
    const input = 'Hello world'
    const percentDecoded = stringPercentDecode(input)
    const expected = [...input].map(c => c.charCodeAt(0))

    t.same(percentDecoded, Uint8Array.from(expected))
    t.end()
  })

  t.end()
})

test('https://mimesniff.spec.whatwg.org/#parse-a-mime-type', (t) => {
  t.same(parseMIMEType('text/plain'), {
    type: 'text',
    subtype: 'plain',
    parameters: new Map(),
    essence: 'text/plain'
  })

  t.same(parseMIMEType('text/html;charset="shift_jis"iso-2022-jp'), {
    type: 'text',
    subtype: 'html',
    parameters: new Map([['charset', 'shift_jis']]),
    essence: 'text/html'
  })

  t.same(parseMIMEType('application/javascript'), {
    type: 'application',
    subtype: 'javascript',
    parameters: new Map(),
    essence: 'application/javascript'
  })

  t.end()
})

test('https://fetch.spec.whatwg.org/#collect-an-http-quoted-string', (t) => {
  // https://fetch.spec.whatwg.org/#example-http-quoted-string
  t.test('first', (t) => {
    const position = { position: 0 }

    t.strictSame(collectAnHTTPQuotedString('"\\', {
      position: 0
    }), '"\\')
    t.strictSame(collectAnHTTPQuotedString('"\\', position, true), '\\')
    t.strictSame(position.position, 2)
    t.end()
  })

  t.test('second', (t) => {
    const position = { position: 0 }
    const input = '"Hello" World'

    t.strictSame(collectAnHTTPQuotedString(input, {
      position: 0
    }), '"Hello"')
    t.strictSame(collectAnHTTPQuotedString(input, position, true), 'Hello')
    t.strictSame(position.position, 7)
    t.end()
  })

  t.end()
})

// https://github.com/nodejs/undici/issues/1574
test('too long base64 url', async (t) => {
  const inputStr = 'a'.repeat(1 << 20)
  const base64 = Buffer.from(inputStr).toString('base64')
  const dataURIPrefix = 'data:application/octet-stream;base64,'
  const dataURL = dataURIPrefix + base64
  try {
    const res = await fetch(dataURL)
    const buf = await res.arrayBuffer()
    const outputStr = Buffer.from(buf).toString('ascii')
    t.same(outputStr, inputStr)
  } catch (e) {
    t.fail(`failed to fetch ${dataURL}`)
  }
})

test('https://domain.com/#', (t) => {
  t.plan(1)
  const domain = 'https://domain.com/#'
  const serialized = URLSerializer(new URL(domain))
  t.equal(serialized, domain)
})

test('https://domain.com/?', (t) => {
  t.plan(1)
  const domain = 'https://domain.com/?'
  const serialized = URLSerializer(new URL(domain))
  t.equal(serialized, domain)
})
