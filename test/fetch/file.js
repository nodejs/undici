'use strict'

const { Blob } = require('node:buffer')
const { test } = require('node:test')
const assert = require('node:assert')
const { tspl } = require('@matteo.collina/tspl')
const { File } = require('../../lib/web/fetch/file')

test('args validation', (t) => {
  const { throws, doesNotThrow, strictEqual } = tspl(t, { plan: 4 })

  throws(() => {
    File.prototype.name.toString()
  }, TypeError)
  throws(() => {
    File.prototype.lastModified.toString()
  }, TypeError)
  doesNotThrow(() => {
    File.prototype[Symbol.toStringTag].charAt(0)
  }, TypeError)

  strictEqual(File.prototype[Symbol.toStringTag], 'File')
})

test('return value of File.lastModified', (t) => {
  const { ok } = tspl(t, { plan: 2 })

  const f = new File(['asd1'], 'filename123')
  const lastModified = f.lastModified
  ok(typeof lastModified === typeof Date.now())
  ok(lastModified >= 0 && lastModified <= Date.now())
})

test('Symbol.toStringTag', (t) => {
  const { strictEqual } = tspl(t, { plan: 1 })
  strictEqual(new File([], '')[Symbol.toStringTag], 'File')
})

test('arguments', () => {
  assert.throws(() => {
    new File() // eslint-disable-line no-new
  }, TypeError)

  assert.throws(() => {
    new File([]) // eslint-disable-line no-new
  }, TypeError)
})

test('lastModified', () => {
  const file = new File([], '')
  const lastModified = Date.now() - 69_000

  assert.ok(file !== 0)

  const file1 = new File([], '', { lastModified })
  assert.strictEqual(file1.lastModified, lastModified)

  assert.strictEqual(new File([], '', { lastModified: 0 }).lastModified, 0)

  assert.strictEqual(
    new File([], '', {
      lastModified: true
    }).lastModified,
    1
  )
})

test('File.prototype.text', async (t) => {
  await t.test('With Blob', async () => {
    const blob1 = new Blob(['hello'])
    const blob2 = new Blob([' '])
    const blob3 = new Blob(['world'])

    const file = new File([blob1, blob2, blob3], 'hello_world.txt')

    assert.strictEqual(await file.text(), 'hello world')
  })

  /* eslint-disable camelcase */
  await t.test('With TypedArray', async () => {
    const uint8_1 = new Uint8Array(Buffer.from('hello'))
    const uint8_2 = new Uint8Array(Buffer.from(' '))
    const uint8_3 = new Uint8Array(Buffer.from('world'))

    const file = new File([uint8_1, uint8_2, uint8_3], 'hello_world.txt')

    assert.strictEqual(await file.text(), 'hello world')
  })

  await t.test('With TypedArray range', async () => {
    const uint8_1 = new Uint8Array(Buffer.from('hello world'))
    const uint8_2 = new Uint8Array(uint8_1.buffer, 1, 4)

    const file = new File([uint8_2], 'hello_world.txt')

    assert.strictEqual(await file.text(), 'ello')
  })
  /* eslint-enable camelcase */

  await t.test('With ArrayBuffer', async () => {
    const uint8 = new Uint8Array([65, 66, 67])
    const ab = uint8.buffer

    const file = new File([ab], 'file.txt')

    assert.strictEqual(await file.text(), 'ABC')
  })

  await t.test('With string', async () => {
    const string = 'hello world'
    const file = new File([string], 'hello_world.txt')

    assert.strictEqual(await file.text(), 'hello world')
  })

  await t.test('With Buffer', async () => {
    const buffer = Buffer.from('hello world')

    const file = new File([buffer], 'hello_world.txt')

    assert.strictEqual(await file.text(), 'hello world')
  })

  await t.test('Mixed', async () => {
    const blob = new Blob(['Hello, '])
    const uint8 = new Uint8Array(Buffer.from('world! This'))
    const string = ' is a test! Hope it passes!'

    const file = new File([blob, uint8, string], 'mixed-messages.txt')

    assert.strictEqual(
      await file.text(),
      'Hello, world! This is a test! Hope it passes!'
    )
  })
})

test('endings=native', async () => {
  const file = new File(['Hello\nWorld'], 'text.txt', { endings: 'native' })
  const text = await file.text()

  if (process.platform === 'win32') {
    assert.strictEqual(text, 'Hello\r\nWorld', 'on windows, LF is replace with CRLF')
  } else {
    assert.strictEqual(text, 'Hello\nWorld', `on ${process.platform} LF stays LF`)
  }
})

test('not allow SharedArrayBuffer', () => {
  const buffer = new SharedArrayBuffer(0)
  assert.throws(() => {
    // eslint-disable-next-line no-new
    new File([buffer], 'text.txt')
  }, TypeError)

  assert.throws(() => {
    // eslint-disable-next-line no-new
    new File([new Uint8Array(buffer)], 'text.txt')
  }, TypeError)
})
