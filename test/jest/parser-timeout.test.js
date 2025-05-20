/* eslint-env jest */

// test/jest/parser-timeout.test.js
const EventEmitter = require('events')
const connectH1 = require('../../lib/dispatcher/client-h1')
const { kParser } = require('../../lib/core/symbols')

// DummySocket extends EventEmitter to support .on/.off/.read()
class DummySocket extends EventEmitter {
  constructor () {
    super()
    this.destroyed = false
    this.errored = null
  }

  read () {
    return null
  }
}

const dummyClient = {
  [Symbol.for('kMaxHeadersSize')]: 1024,
  [Symbol.for('kMaxResponseSize')]: 1024,
  [Symbol.for('kQueue')]: [],
  [Symbol.for('kRunningIdx')]: 0,
  headersTimeout: 100,
  bodyTimeout: 100
}

describe('Parser#setTimeout under fake timers', () => {
  beforeEach(() => jest.useFakeTimers('modern'))
  afterEach(() => jest.useRealTimers())

  it('does not throw when calling setTimeout under fake timers', async () => {
    const socket = new DummySocket()
    await connectH1(dummyClient, socket) // connectH1 creates Parser -> socket[kParser]
    const parser = socket[kParser]
    expect(() => parser.setTimeout(200, 0)).not.toThrow()
  })
})
