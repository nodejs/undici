'use strict'

const assert = require('node:assert')
const buffer = require('node:buffer')
const { once } = require('node:events')
const { test, describe } = require('node:test')
const { EventSourceStream } = require('../../lib/web/eventsource/eventsource-stream')

describe('EventSourceStream', () => {
  test('rejects an oversized unfinished data line before its newline', async (t) => {
    const stream = new EventSourceStream({ maxEventSize: 5 })
    t.after(() => stream.destroy())

    stream.write(Buffer.from('data: hello'))
    assert.strictEqual(stream.lineLength, 11)
    stream.write(Buffer.from('oo'))

    const [error] = await once(stream, 'error')
    assert.strictEqual(error.message, 'EventSource message size exceeded')
    assert.strictEqual(stream.chunks.length, 0)
  })

  test('accepts a data value exactly at the configured limit', async (t) => {
    const stream = new EventSourceStream({ maxEventSize: 5 })
    const messages = []
    stream.on('data', message => messages.push(message))

    stream.end(Buffer.from('data: hello\n\n'))
    await once(stream, 'end')

    assert.strictEqual(messages.length, 1)
    assert.strictEqual(messages[0].options.data, 'hello')
  })

  test('accepts one-byte event and retry fields at a one-byte limit', async (t) => {
    for (const line of ['event: X\n\n', 'retry: 1\n\n']) {
      await t.test(line.trim(), async () => {
        const stream = new EventSourceStream({ maxEventSize: 1 })
        stream.resume()
        stream.end(Buffer.from(line))
        await once(stream, 'end')
      })
    }
  })

  test('bounds unfinished lines of every field type', async (t) => {
    for (const prefix of [':', 'id: ', 'event: ', 'retry: ', 'ignored: ']) {
      await t.test(prefix, async (t) => {
        const stream = new EventSourceStream({ maxEventSize: 5 })
        t.after(() => stream.destroy())
        stream.write(Buffer.from(`${prefix}AAAAAAAAAAAA`))
        const [error] = await once(stream, 'error')
        assert.strictEqual(error.message, 'EventSource message size exceeded')
      })
    }
  })

  test('bounds retained metadata and data across completed lines', async (t) => {
    const stream = new EventSourceStream({ maxEventSize: 5 })
    t.after(() => stream.destroy())

    stream.write(Buffer.from('id: abc\n'))
    stream.write(Buffer.from('data: hey\n'))
    const [error] = await once(stream, 'error')

    assert.strictEqual(error.message, 'EventSource message size exceeded')
    assert.strictEqual(stream.chunks.length, 0)
  })

  test('replaced metadata does not accumulate against the limit', async (t) => {
    const stream = new EventSourceStream({ maxEventSize: 5 })
    const messages = []
    stream.on('data', message => messages.push(message))

    stream.end(Buffer.from('id: abc\nid: x\ndata: hey\n\n'))
    await once(stream, 'end')

    assert.strictEqual(messages.length, 1)
    assert.strictEqual(messages[0].options.lastEventId, 'x')
    assert.strictEqual(messages[0].options.data, 'hey')
  })

  test('bounds a configured-size unfinished line', async (t) => {
    const stream = new EventSourceStream({ maxEventSize: 1024 })
    t.after(() => stream.destroy())
    stream.write(Buffer.alloc(1024 + 8, 0x41))

    const [error] = await once(stream, 'error')
    assert.strictEqual(error.message, 'EventSource message size exceeded')
  })

  test('bounds configured-size event data spread over completed lines', async (t) => {
    const stream = new EventSourceStream({ maxEventSize: 1024 })
    t.after(() => stream.destroy())
    const line = Buffer.from(`data: ${'A'.repeat(256)}\n`)

    for (let i = 0; i < 4; i++) {
      stream.write(line)
    }

    const [error] = await once(stream, 'error')
    assert.strictEqual(error.message, 'EventSource message size exceeded')
  })

  test('bounds string nodes from tiny completed data lines', async (t) => {
    const stream = new EventSourceStream({ maxEventSize: 4096 })
    t.after(() => stream.destroy())
    stream.write(Buffer.from('data:\n'.repeat(1025)))

    const [error] = await once(stream, 'error')
    assert.strictEqual(error.message, 'EventSource message size exceeded')
  })

  test('accepts exactly the allowed number of tiny data lines', async (t) => {
    const stream = new EventSourceStream({ maxEventSize: 4096 })
    const messages = []
    stream.on('data', message => messages.push(message))
    stream.end(Buffer.from(`${'data:\n'.repeat(1024)}\n`))
    await once(stream, 'end')

    assert.strictEqual(messages.length, 1)
    assert.strictEqual(messages[0].options.data.length, 1023)
  })

  test('bounds tiny data lines at the default limit', async (t) => {
    const stream = new EventSourceStream()
    t.after(() => stream.destroy())
    assert.strictEqual(stream.maxEventSize, buffer.kStringMaxLength)
    assert.strictEqual(stream.maxDataLines, 131072)
    assert.strictEqual(stream.maxBufferedChunks, 131072)
    stream.write(Buffer.from('data:\n'.repeat(stream.maxDataLines + 1)))

    const [error] = await once(stream, 'error')
    assert.strictEqual(error.message, 'EventSource message size exceeded')
  })

  test('caps parser item counts for configured sizes above 16 MiB', (t) => {
    const stream = new EventSourceStream({ maxEventSize: 32 * 1024 * 1024 })
    t.after(() => stream.destroy())
    assert.strictEqual(stream.maxDataLines, 131072)
    assert.strictEqual(stream.maxBufferedChunks, 131072)
  })

  test('bounds Buffer wrappers for a line split into tiny chunks', async (t) => {
    const stream = new EventSourceStream({ maxEventSize: 4096 })
    t.after(() => stream.destroy())
    assert.strictEqual(stream.maxBufferedChunks, 1024)

    for (let i = 0; i <= stream.maxBufferedChunks; i++) {
      stream.write(Buffer.from('A'))
    }
    const [error] = await once(stream, 'error')
    assert.strictEqual(error.message, 'EventSource message size exceeded')
    assert.strictEqual(stream.chunks.length, 0)
  })

  test('drops consumed tiny chunks after a completed line', async (t) => {
    const stream = new EventSourceStream({ maxEventSize: 4096 })
    stream.resume()
    for (let i = 0; i < stream.maxBufferedChunks; i++) {
      stream.write(Buffer.from('A'))
    }
    stream.end(Buffer.from('\n'))
    await once(stream, 'end')
    assert.strictEqual(stream.chunks.length, 0)
  })

  test('resets pending line length across a split BOM and CRLF', async (t) => {
    const stream = new EventSourceStream({ maxEventSize: 5 })
    const messages = []
    stream.on('data', message => messages.push(message))

    stream.write(Buffer.from([0xEF]))
    stream.write(Buffer.from([0xBB]))
    stream.write(Buffer.from([0xBF]))
    stream.write(Buffer.from('data: hello\r'))
    stream.write(Buffer.from('\n\r\n'))
    stream.end()
    await once(stream, 'end')

    assert.strictEqual(messages.length, 1)
    assert.strictEqual(messages[0].options.data, 'hello')
  })

  test('limits accumulated event data', (t) => {
    const stream = new EventSourceStream({ maxEventSize: 5 })
    const event = {}

    stream.parseLine(Buffer.from('data: hello', 'utf8'), event)

    assert.throws(() => {
      stream.parseLine(Buffer.from('data: world', 'utf8'), event)
    }, {
      name: 'Error',
      message: 'EventSource message size exceeded'
    })
    assert.strictEqual(event.data, 'hello')
  })

  test('can disable event data limit', (t) => {
    const stream = new EventSourceStream({ maxEventSize: 0 })
    const event = {}

    stream.parseLine(Buffer.from('data: hello', 'utf8'), event)
    stream.parseLine(Buffer.from('data: world', 'utf8'), event)

    assert.strictEqual(event.data, 'hello\nworld')
  })

  test('enforces maxEventSize on an unterminated line', async (t) => {
    const stream = new EventSourceStream({ maxEventSize: 10 })
    stream.processEvent = () => assert.fail()

    // A server can stream a `data:` field that never contains a line terminator.
    // The buffered line must not grow past maxEventSize without being rejected.
    const error = await new Promise((resolve) => {
      stream.on('error', resolve)
      stream.write(Buffer.alloc(100, 0x41))
    })

    assert.strictEqual(error.message, 'EventSource message size exceeded')
  })

  test('accepts a terminated data line with a value equal to maxEventSize', (t) => {
    const stream = new EventSourceStream({ maxEventSize: 10 })

    stream.processEvent = function (event) {
      assert.strictEqual(event.data, '123456789a')
    }

    stream.write(Buffer.from('data: 123456789a\n\n', 'utf8'))
  })

  test('maxEventSize zero also disables the unfinished-line limit', async (t) => {
    const stream = new EventSourceStream({ maxEventSize: 0 })
    const messages = []
    stream.on('data', message => messages.push(message))
    stream.end(Buffer.from(`data: ${'A'.repeat(16 * 1024 * 1024 + 1)}\n\n`))
    await once(stream, 'end')
    assert.strictEqual(messages[0].options.data.length, 16 * 1024 * 1024 + 1)
  })

  test('ignore empty chunks', () => {
    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      assert.fail()
    }
    stream.write(Buffer.alloc(0))
  })

  test('Simple event with data field.', () => {
    const content = Buffer.from('data: Hello\n\n', 'utf8')

    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.event, undefined)
      assert.strictEqual(event.data, 'Hello')
      assert.strictEqual(event.id, undefined)
      assert.strictEqual(event.retry, undefined)
    }

    for (let i = 0; i < content.length; i++) {
      stream.write(Buffer.from([content[i]]))
    }
  })

  test('Should also process CR as EOL.', () => {
    const content = Buffer.from('data: Hello\r\r', 'utf8')

    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.event, undefined)
      assert.strictEqual(event.data, 'Hello')
      assert.strictEqual(event.id, undefined)
      assert.strictEqual(event.retry, undefined)
    }

    for (let i = 0; i < content.length; i++) {
      stream.write(Buffer.from([content[i]]))
    }
  })

  test('Should also process CRLF as EOL.', () => {
    const content = Buffer.from('data: Hello\r\n\r\n', 'utf8')

    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.event, undefined)
      assert.strictEqual(event.data, 'Hello')
      assert.strictEqual(event.id, undefined)
      assert.strictEqual(event.retry, undefined)
    }

    for (let i = 0; i < content.length; i++) {
      stream.write(Buffer.from([content[i]]))
    }
  })

  test('Should also process mixed CR and CRLF as EOL.', () => {
    const content = Buffer.from('data: Hello\r\r\n', 'utf8')

    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.event, undefined)
      assert.strictEqual(event.data, 'Hello')
      assert.strictEqual(event.id, undefined)
      assert.strictEqual(event.retry, undefined)
    }

    for (let i = 0; i < content.length; i++) {
      stream.write(Buffer.from([content[i]]))
    }
  })

  test('Should also process mixed LF and CRLF as EOL.', () => {
    const content = Buffer.from('data: Hello\n\r\n', 'utf8')

    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.event, undefined)
      assert.strictEqual(event.data, 'Hello')
      assert.strictEqual(event.id, undefined)
      assert.strictEqual(event.retry, undefined)
    }

    for (let i = 0; i < content.length; i++) {
      stream.write(Buffer.from([content[i]]))
    }
  })

  test('Should ignore comments', () => {
    const content = Buffer.from(':data: Hello\n\n', 'utf8')

    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.event, undefined)
      assert.strictEqual(event.data, undefined)
      assert.strictEqual(event.id, undefined)
      assert.strictEqual(event.retry, undefined)
    }

    for (let i = 0; i < content.length; i++) {
      stream.write(Buffer.from([content[i]]))
    }
  })

  test('Should fire two events.', () => {
    // @see https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
    const content = Buffer.from('data\n\ndata\ndata\n\ndata:', 'utf8')
    const stream = new EventSourceStream()

    let count = 0
    stream.processEvent = function (event) {
      switch (count) {
        case 0: {
          assert.strictEqual(typeof event, 'object')
          assert.strictEqual(event.event, undefined)
          assert.strictEqual(event.data, '')
          assert.strictEqual(event.id, undefined)
          assert.strictEqual(event.retry, undefined)
          break
        }
        case 1: {
          assert.strictEqual(typeof event, 'object')
          assert.strictEqual(event.event, undefined)
          assert.strictEqual(event.data, '\n')
          assert.strictEqual(event.id, undefined)
          assert.strictEqual(event.retry, undefined)
        }
      }
      count++
    }

    for (let i = 0; i < content.length; i++) {
      stream.write(Buffer.from([content[i]]))
    }
  })

  test('Should fire two identical events.', () => {
    // @see https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
    const content = Buffer.from('data:test\n\ndata: test\n\n', 'utf8')
    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.event, undefined)
      assert.strictEqual(event.data, 'test')
      assert.strictEqual(event.id, undefined)
      assert.strictEqual(event.retry, undefined)
    }

    for (let i = 0; i < content.length; i++) {
      stream.write(Buffer.from([content[i]]))
    }
  })

  test('ignores empty comments', () => {
    const content = Buffer.from('data: Hello\n\n:\n\ndata: World\n\n', 'utf8')
    const stream = new EventSourceStream()

    let count = 0

    stream.processEvent = function (event) {
      switch (count) {
        case 0: {
          assert.strictEqual(typeof event, 'object')
          assert.strictEqual(event.event, undefined)
          assert.strictEqual(event.data, 'Hello')
          assert.strictEqual(event.id, undefined)
          assert.strictEqual(event.retry, undefined)
          break
        }
        case 1: {
          assert.strictEqual(typeof event, 'object')
          assert.strictEqual(event.event, undefined)
          assert.strictEqual(event.data, 'World')
          assert.strictEqual(event.id, undefined)
          assert.strictEqual(event.retry, undefined)
          break
        }
        default: {
          assert.fail()
        }
      }
      count++
    }

    stream.write(content)
  })

  test('comment fest', () => {
    const longstring = new Array(2 * 1024 + 1).join('x')
    const content = Buffer.from(`data:1\r:\0\n:\r\ndata:2\n:${longstring}\rdata:3\n:data:fail\r:${longstring}\ndata:4\n\n`, 'utf8')
    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.event, undefined)
      assert.strictEqual(event.data, '1\n2\n3\n4')
      assert.strictEqual(event.id, undefined)
      assert.strictEqual(event.retry, undefined)
    }

    stream.write(content)
  })

  test('comment fest', () => {
    const content = Buffer.from('data:\n\ndata\ndata\n\ndata:test\n\n', 'utf8')
    const stream = new EventSourceStream()

    let count = 0
    stream.processEvent = function (event) {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.event, undefined)
      assert.strictEqual(event.id, undefined)
      assert.strictEqual(event.retry, undefined)
      switch (count) {
        case 0: {
          assert.strictEqual(event.data, '')
          break
        }
        case 1: {
          assert.strictEqual(event.data, '\n')
          break
        }
        case 2: {
          assert.strictEqual(event.data, 'test')
          break
        }
        default: {
          assert.fail()
        }
      }
      count++
    }
    stream.write(content)
  })

  test('newline test', () => {
    const content = Buffer.from('data:test\r\ndata\ndata:test\r\n\r\n', 'utf8')
    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.event, undefined)
      assert.strictEqual(event.id, undefined)
      assert.strictEqual(event.retry, undefined)
      assert.strictEqual(event.data, 'test\n\ntest')
    }
    stream.write(content)
  })

  test('newline test', () => {
    const content = Buffer.from('data:test\n data\ndata\nfoobar:xxx\njustsometext\n:thisisacommentyay\ndata:test\n\n', 'utf8')
    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.event, undefined)
      assert.strictEqual(event.id, undefined)
      assert.strictEqual(event.retry, undefined)
      assert.strictEqual(event.data, 'test\n\ntest')
    }
    stream.write(content)
  })

  test('newline test', () => {
    const content = Buffer.from('data:test\n data\ndata\nfoobar:xxx\njustsometext\n:thisisacommentyay\ndata:test\n\n', 'utf8')
    const stream = new EventSourceStream()

    stream.processEvent = function (event) {
      assert.strictEqual(typeof event, 'object')
      assert.strictEqual(event.event, undefined)
      assert.strictEqual(event.id, undefined)
      assert.strictEqual(event.retry, undefined)
      assert.strictEqual(event.data, 'test\n\ntest')
    }
    stream.write(content)
  })
})
