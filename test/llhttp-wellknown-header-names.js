'use strict'

const { describe, test } = require('node:test')
const assert = require('node:assert')
const { readFileSync } = require('node:fs')
const { TYPE, ERROR } = require('../lib/llhttp/constants')
const { wellknownHeaderNames } = require('../lib/core/constants')
const { OUT, generate } = require('../build/wellknown-headers.js')

// The glue reports a name's 1-based index in wellknownHeaderNames, or 0.
const WELLKNOWN = new Map(wellknownHeaderNames.map((name, i) => [name.toLowerCase(), i + 1]))

// Framing headers cannot take an arbitrary value; one of them ends every
// response, so both are still checked.
const FRAMING = {
  'Content-Length': { value: '0', body: [] },
  'Transfer-Encoding': { value: 'chunked', body: ['0', ''] }
}

function instantiate (bytes) {
  const fields = []
  const ids = []
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
      wasm_on_header_value: () => 0,
      wasm_on_headers_complete: () => 0,
      wasm_on_body: () => 0,
      wasm_on_message_complete: () => 0
    }
  })

  // Parses a response with the given field names, cut once at every offset so
  // each name is also split at each of its positions.
  return function parse (names, framing = 'Content-Length') {
    const lines = ['HTTP/1.1 200 OK', ...names.map((name) => `${name}: value`)]
    lines.push(`${framing}: ${FRAMING[framing].value}`, '', ...FRAMING[framing].body, '')
    const response = Buffer.from(lines.join('\r\n'), 'latin1')
    const data = parser.malloc(response.length)

    for (let split = 0; split <= response.length; split++) {
      const ptr = parser.llhttp_alloc(TYPE.RESPONSE)
      fields.length = 0
      ids.length = 0

      for (const [start, end] of [[0, split], [split, response.length]]) {
        const chunk = response.subarray(start, end)
        new Uint8Array(parser.memory.buffer, data, chunk.length).set(chunk)
        assert.strictEqual(parser.llhttp_execute(ptr, data, chunk.length), ERROR.OK)
        // The name is only looked up; the bytes handed on keep their case.
        assert.deepStrictEqual(Buffer.from(new Uint8Array(parser.memory.buffer, data, chunk.length)), chunk)
      }

      // Each piece reports the index of exactly the well-known name it spells,
      // ignoring case, including a shorter one left by a split.
      for (let i = 0; i < fields.length; i++) {
        const piece = fields[i].toString('latin1')
        assert.strictEqual(ids[i], WELLKNOWN.get(piece.toLowerCase()) ?? 0, `${piece} at split ${split}`)
      }
      assert.strictEqual(Buffer.concat(fields).toString('latin1'), [...names, framing].join(''))

      parser.llhttp_free(ptr)
    }

    parser.free(data)
  }
}

;[
  ['generic', require('../lib/llhttp/llhttp-wasm.js')],
  ['simd', require('../lib/llhttp/llhttp_simd-wasm.js')]
].forEach(([name, bytes]) => {
  describe(name, () => {
    const parse = instantiate(bytes)

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
          `${field.slice(0, -1)}^`,
          `${field.slice(0, -1)}~`,
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
