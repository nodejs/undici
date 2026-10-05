'use strict'

const assert = require('node:assert/strict')
const { once } = require('node:events')
const { createServer } = require('node:http')

const mode = process.argv[2]
if (mode === 'deleted') {
  delete globalThis.WebAssembly
} else if (mode === 'undefined') {
  globalThis.WebAssembly = undefined
} else if (mode === 'no-simd') {
  process.env.UNDICI_NO_WASM_SIMD = '1'
} else if (mode === 'milo') {
  process.env.UNDICI_USE_MILO = '1'
} else if (mode === 'milo-unavailable') {
  process.env.UNDICI_USE_MILO = '1'
  delete globalThis.WebAssembly
}

let compilations = 0
if (mode === 'fallback') {
  const Module = WebAssembly.Module
  // Reject the SIMD attempt while allowing the generic module to compile.
  WebAssembly.Module = function (bytes) {
    if (++compilations === 1) {
      throw new WebAssembly.CompileError('SIMD unavailable for this test')
    }
    return new Module(bytes)
  }
}

function checkError (error) {
  assert.ok(error instanceof Error)
  assert.ok(!(error instanceof TypeError))
  assert.equal(error.name, 'Error')
  assert.equal(error.code, 'ERR_WEBASSEMBLY_NOT_SUPPORTED')
  assert.equal(error.message, 'WebAssembly is not supported in this environment, but is required for HTTP/1 parsing')
  assert.equal(error.cause, undefined)
  return true
}

async function checkIndependentAPIs (undici) {
  assert.equal(typeof undici.fetch, 'function')
  const headers = new undici.Headers({ 'x-test': 'value' })
  assert.equal(headers.get('x-test'), 'value')
  const form = new undici.FormData()
  form.append('field', 'value')
  assert.equal(form.get('field'), 'value')
  const request = new undici.Request('http://localhost', { method: 'POST', body: form })
  assert.equal((await request.formData()).get('field'), 'value')
  const response = new undici.Response('usable')
  assert.equal(await response.text(), 'usable')
  // A fetch operation without the HTTP/1 parser remains possible.
  assert.equal(await (await undici.fetch('data:text/plain,usable')).text(), 'usable')
}

async function main () {
  if (mode === 'jitless' && typeof WebAssembly !== 'undefined') {
    console.log('WebAssembly available under --jitless')
    return
  }

  // Import after removing WASM to catch accidental eager compilation.
  const undici = require('../..')
  const nodeFetch = require('../../index-fetch')
  await checkIndependentAPIs(undici)
  await checkIndependentAPIs(nodeFetch)

  const server = createServer((req, res) => res.end('ok'))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  const client = new undici.Client(origin)
  const agent = new undici.Agent()

  try {
    if (typeof WebAssembly === 'undefined') {
      // Reusing the client must reject again rather than leave its queue stalled.
      for (let i = 0; i < 2; i++) {
        await assert.rejects(client.request({ path: '/', method: 'GET' }), checkError)
      }
      await assert.rejects(new Promise((resolve, reject) => {
        client.dispatch({ path: '/', method: 'GET' }, {
          onRequestStart () {},
          onResponseStart () { reject(new Error('Unexpected response')) },
          onResponseData () {},
          onResponseEnd () { resolve() },
          onResponseError (controller, error) { reject(error) }
        })
      }), checkError)
      await assert.rejects(undici.request(origin, { dispatcher: agent }), checkError)
      for (const { fetch } of [undici, nodeFetch]) {
        await assert.rejects(fetch(origin, { dispatcher: agent }), error => {
          assert.ok(error instanceof TypeError)
          assert.equal(error.message, 'fetch failed')
          return checkError(error.cause)
        })
      }
      await checkIndependentAPIs(undici)
      // Node's native HTTP parser is independent of Undici's WASM parser.
      const { get } = require('node:http')
      await new Promise((resolve, reject) => {
        get(origin, res => {
          res.resume()
          res.on('end', resolve)
          res.on('error', reject)
        }).on('error', reject)
      })
    } else {
      const response = await client.request({ path: '/', method: 'GET' })
      assert.equal(response.statusCode, 200)
      assert.equal(await response.body.text(), 'ok')
      const fetched = await undici.fetch(origin, { dispatcher: agent })
      assert.equal(fetched.status, 200)
      assert.equal(await fetched.text(), 'ok')
      if (mode === 'fallback') {
        assert.equal(compilations, 2)
      }
    }
  } finally {
    await client.destroy()
    await agent.destroy()
    await new Promise((resolve, reject) => server.close(error => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }))
  }
  console.log('ok')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
