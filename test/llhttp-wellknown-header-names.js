'use strict'

const { describe, test } = require('node:test')
const assert = require('node:assert')
const { readFileSync } = require('node:fs')
const { TYPE, ERROR } = require('../lib/llhttp/constants')
const { wellknownHeaderNames } = require('../lib/core/constants')
const { OUT, generate } = require('../build/wellknown-headers.js')

// The glue reports a name's 1-based index in wellknownHeaderNames, or 0.
const WELLKNOWN = new Map(wellknownHeaderNames.map((name, i) => [name.toLowerCase(), i + 1]))

// Uppercase guard bytes around the input: a load or store that strays outside
// a span lowercases them. A span cut at a chunk edge sits right against one.
const GUARD = 32
const GUARD_BYTE = 0x41

// Framing headers cannot take an arbitrary value; one of them ends every
// response, so both are still checked.
const FRAMING = {
  'Content-Length': { value: '0', body: [] },
  'Transfer-Encoding': { value: 'chunked', body: ['0', ''] }
}

// Letters of both cases and the token characters around 'A'-'Z' and 'a'-'z'.
const TCHARS = 'AbCdEfGhIjKlMnOpQrStUvWxYz^_`|~!#$%&\'*+-.0123456789ZzAaMm'

function tokenName (length) {
  let str = ''
  for (let i = 0; i < length; i++) {
    str += TCHARS[(i * 7 + length) % TCHARS.length]
  }
  return str
}

function lower (str) {
  return str.replace(/[A-Z]/g, (c) => c.toLowerCase())
}

function instantiate (bytes) {
  const fields = []
  const ids = []
  const values = []
  const { exports: parser } = new WebAssembly.Instance(new WebAssembly.Module(bytes), {
    env: {
      wasm_on_url: () => 0,
      wasm_on_status: () => 0,
      wasm_on_message_begin: () => 0,
      wasm_on_header_field: (ptr, data, length, wellknown) => {
        fields.push(Buffer.from(new Uint8Array(parser.memory.buffer, data, length)))
        ids.push(wellknown)
        return 0
      },
      wasm_on_header_value: (ptr, data, length) => {
        values.push(Buffer.from(new Uint8Array(parser.memory.buffer, data, length)))
        return 0
      },
      wasm_on_headers_complete: () => 0,
      wasm_on_body: () => 0,
      wasm_on_message_complete: () => 0
    }
  })

  // Parses a response with the given field names, cut once at every offset so
  // each name is also split at each of its positions.
  return function parse (names, framing = 'Content-Length') {
    const lines = ['HTTP/1.1 200 OK', ...names.map((name) => `${name}: Value-${name}`)]
    lines.push(`${framing}: ${FRAMING[framing].value}`, '', ...FRAMING[framing].body, '')
    const response = Buffer.from(lines.join('\r\n'), 'latin1')
    const expected = Buffer.from(lines.map((line, i) => {
      const colon = line.indexOf(':')
      return i === 0 || colon === -1 ? line : lower(line.slice(0, colon)) + line.slice(colon)
    }).join('\r\n'), 'latin1')

    const size = response.length + GUARD * 2
    const base = parser.malloc(size)

    for (let split = 0; split <= response.length; split++) {
      const ptr = parser.llhttp_alloc(TYPE.RESPONSE)
      fields.length = 0
      ids.length = 0
      values.length = 0

      for (const [start, end] of [[0, split], [split, response.length]]) {
        const memory = new Uint8Array(parser.memory.buffer, base, size)
        memory.fill(GUARD_BYTE)
        memory.set(response.subarray(start, end), GUARD)
        assert.strictEqual(parser.llhttp_execute(ptr, base + GUARD, end - start), ERROR.OK)

        // Only the name spans are lowercased, in place.
        const after = Buffer.from(new Uint8Array(parser.memory.buffer, base, size))
        assert.ok(after.subarray(0, GUARD).every((byte) => byte === GUARD_BYTE), `guard before split ${split}`)
        assert.deepStrictEqual(after.subarray(GUARD, GUARD + end - start), expected.subarray(start, end))
        assert.ok(after.subarray(GUARD + end - start).every((byte) => byte === GUARD_BYTE), `guard after split ${split}`)
      }

      // Each piece reports the index of exactly the well-known name it spells,
      // including a shorter one left by a split.
      for (let i = 0; i < fields.length; i++) {
        const piece = fields[i].toString('latin1')
        assert.strictEqual(ids[i], WELLKNOWN.get(piece) ?? 0, `${piece} at split ${split}`)
      }
      assert.strictEqual(Buffer.concat(fields).toString('latin1'), [...names, framing].map(lower).join(''))
      // Values are handed on as received.
      assert.strictEqual(
        Buffer.concat(values).toString('latin1'),
        [...names.map((name) => `Value-${name}`), FRAMING[framing].value].join('')
      )

      parser.llhttp_free(ptr)
    }

    parser.free(base)
  }
}

;[
  ['generic', require('../lib/llhttp/llhttp-wasm.js')],
  ['simd', require('../lib/llhttp/llhttp_simd-wasm.js')]
].forEach(([name, bytes]) => {
  describe(name, () => {
    const parse = instantiate(bytes)

    test('lowercases header names of every length in place', () => {
      // Every length class of the SIMD path (1-3 scalar, 4-7, 8-15, 16,
      // 17-31, 32+) and the scalar loop of the generic build.
      const names = []
      for (let length = 1; length <= 48; length++) {
        names.push(tokenName(length))
      }
      parse(names)
      for (const field of names) {
        parse([field])
      }
    })

    test('reports well-known header names in any case', () => {
      parse([], 'Transfer-Encoding')
      for (const field of wellknownHeaderNames) {
        if (Object.hasOwn(FRAMING, field)) {
          continue
        }
        parse([field])
        parse([field.toLowerCase()])
        parse([field.toUpperCase()], 'Transfer-Encoding')
      }
    })

    test('reports 0 for names that differ from a well-known one', () => {
      for (const field of wellknownHeaderNames) {
        for (const miss of [
          `${field}x`,
          `x${field}`,
          field.slice(0, -1),
          field.slice(1),
          `${field.slice(0, -1)}_`,
          `_${field.slice(1)}`
        ]) {
          if (miss !== '') {
            parse([miss])
          }
        }
      }
    })
  })
})

test('the WASM well-known header lookup matches wellknownHeaderNames', () => {
  // A stale table would hand the client the wrong preallocated name.
  // Regenerate with `node build/wellknown-headers.js` and rebuild the WASM.
  assert.strictEqual(readFileSync(OUT, 'utf8'), generate())
})
