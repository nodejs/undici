'use strict'

const { Blob } = require('buffer')
const { test } = require('tap')
const { File, FileLike } = require('../../lib/fetch/file')

test('args validation', (t) => {
  t.plan(14)

  t.throws(() => {
    File.prototype.name.toString()
  }, TypeError)
  t.throws(() => {
    File.prototype.lastModified.toString()
  }, TypeError)
  t.doesNotThrow(() => {
    File.prototype[Symbol.toStringTag].charAt(0)
  }, TypeError)

  t.throws(() => {
    FileLike.prototype.stream.call(null)
  }, TypeError)
  t.throws(() => {
    FileLike.prototype.arrayBuffer.call(null)
  }, TypeError)
  t.throws(() => {
    FileLike.prototype.slice.call(null)
  }, TypeError)
  t.throws(() => {
    FileLike.prototype.text.call(null)
  }, TypeError)
  t.throws(() => {
    FileLike.prototype.size.toString()
  }, TypeError)
  t.throws(() => {
    FileLike.prototype.type.toString()
  }, TypeError)
  t.throws(() => {
    FileLike.prototype.name.toString()
  }, TypeError)
  t.throws(() => {
    FileLike.prototype.lastModified.toString()
  }, TypeError)
  t.doesNotThrow(() => {
    FileLike.prototype[Symbol.toStringTag].charAt(0)
  }, TypeError)

  t.equal(File.prototype[Symbol.toStringTag], 'File')
  t.equal(FileLike.prototype[Symbol.toStringTag], 'File')
})

test('return value of File.lastModified', (t) => {
  t.plan(2)

  const f = new File(['asd1'], 'filename123')
  const lastModified = f.lastModified
  t.ok(typeof lastModified === typeof Date.now())
  t.ok(lastModified >= 0 && lastModified <= Date.now())
})

test('Symbol.toStringTag', (t) => {
  t.plan(2)
  t.equal(new File([], '')[Symbol.toStringTag], 'File')
  t.equal(new FileLike()[Symbol.toStringTag], 'File')
})

test('arguments', (t) => {
  t.throws(() => {
    new File() // eslint-disable-line no-new
  }, TypeError)

  t.throws(() => {
    new File([]) // eslint-disable-line no-new
  }, TypeError)

  t.end()
})

test('lastModified', (t) => {
  const file = new File([], '')
  const lastModified = Date.now() - 69_000

  t.notOk(file === 0)

  const file1 = new File([], '', { lastModified })
  t.equal(file1.lastModified, lastModified)

  t.equal(new File([], '', { lastModified: 0 }).lastModified, 0)

  t.equal(
    new File([], '', {
      lastModified: true
    }).lastModified,
    1
  )

  t.end()
})

test('File.prototype.text', async (t) => {
  t.test('With Blob', async (t) => {
    const blob1 = new Blob(['hello'])
    const blob2 = new Blob([' '])
    const blob3 = new Blob(['world'])

    const file = new File([blob1, blob2, blob3], 'hello_world.txt')

    t.equal(await file.text(), 'hello world')
    t.end()
  })

  /* eslint-disable camelcase */
  t.test('With TypedArray', async (t) => {
    const uint8_1 = new Uint8Array(Buffer.from('hello'))
    const uint8_2 = new Uint8Array(Buffer.from(' '))
    const uint8_3 = new Uint8Array(Buffer.from('world'))

    const file = new File([uint8_1, uint8_2, uint8_3], 'hello_world.txt')

    t.equal(await file.text(), 'hello world')
    t.end()
  })
  /* eslint-enable camelcase */

  t.test('With ArrayBuffer', async (t) => {
    const uint8 = new Uint8Array([65, 66, 67])
    const ab = uint8.buffer

    const file = new File([ab], 'file.txt')

    t.equal(await file.text(), 'ABC')
    t.end()
  })

  t.test('With string', async (t) => {
    const string = 'hello world'
    const file = new File([string], 'hello_world.txt')

    t.equal(await file.text(), 'hello world')
    t.end()
  })

  t.test('Mixed', async (t) => {
    const blob = new Blob(['Hello, '])
    const uint8 = new Uint8Array(Buffer.from('world! This'))
    const string = ' is a test! Hope it passes!'

    const file = new File([blob, uint8, string], 'mixed-messages.txt')

    t.equal(
      await file.text(),
      'Hello, world! This is a test! Hope it passes!'
    )
    t.end()
  })

  t.end()
})

test('endings=native', async (t) => {
  const file = new File(['Hello\nWorld'], 'text.txt', { endings: 'native' })
  const text = await file.text()

  if (process.platform === 'win32') {
    t.equal(text, 'Hello\r\nWorld', 'on windows, LF is replace with CRLF')
  } else {
    t.equal(text, 'Hello\nWorld', `on ${process.platform} LF stays LF`)
  }

  t.end()
})
