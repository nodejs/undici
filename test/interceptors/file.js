'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { mkdtemp, writeFile, rm } = require('node:fs/promises')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { pathToFileURL } = require('node:url')

const createFileInterceptor = require('../../lib/interceptor/file')

test('file interceptor serves file content for allowed paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'undici-file-interceptor-'))
  const filePath = join(dir, 'hello.txt')
  await writeFile(filePath, 'hello world')

  try {
    const interceptor = createFileInterceptor({
      allow: ({ path }) => path === filePath,
      contentType: () => 'text/plain'
    })

    const dispatch = interceptor(() => {
      assert.fail('downstream dispatch must not be called for file URLs')
    })

    const result = await new Promise((resolve, reject) => {
      const chunks = []
      let statusCode = 0
      let statusMessage = ''
      let rawHeaders = null

      dispatch({ method: 'GET', path: pathToFileURL(filePath).href }, {
        onHeaders (code, headers, resume, message) {
          statusCode = code
          statusMessage = message
          rawHeaders = headers
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          resolve({ statusCode, statusMessage, rawHeaders, chunks })
        },
        onError: reject
      })
    })

    assert.equal(result.statusCode, 200)
    assert.equal(result.statusMessage, 'OK')
    assert.ok(Array.isArray(result.rawHeaders))
    assert.equal(Buffer.concat(result.chunks).toString(), 'hello world')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('file interceptor blocks disallowed paths', async () => {
  const interceptor = createFileInterceptor({
    allow: () => false
  })

  const dispatch = interceptor(() => {
    assert.fail('downstream dispatch must not be called for blocked file URLs')
  })

  await assert.rejects(new Promise((resolve, reject) => {
    dispatch({ method: 'GET', path: 'file:///tmp/nope.txt' }, {
      onComplete: resolve,
      onError: reject
    })
  }), /not allowed by file interceptor/)
})

test('file interceptor passes through non-file requests', async () => {
  const interceptor = createFileInterceptor({
    allow: () => true
  })

  let called = false
  const dispatch = interceptor((opts, handler) => {
    called = true
    handler.onError(new Error('downstream'))
    return true
  })

  await assert.rejects(new Promise((resolve, reject) => {
    dispatch({ method: 'GET', origin: 'https://example.com', path: '/' }, {
      onComplete: resolve,
      onError: reject
    })
  }), /downstream/)

  assert.equal(called, true)
})
