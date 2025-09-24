'use strict'

const { test } = require('node:test')
const { MessageEvent } = require('../..')

test('test/parallel/test-messageevent-brandcheck.js', (t) => {
  [
    'data',
    'origin',
    'lastEventId',
    'source',
    'ports'
  ].forEach((i) => {
    t.assert.throws(() => Reflect.get(MessageEvent.prototype, i, {}), {
      constructor: TypeError,
      message: 'Illegal invocation'
    })
  })
})

test('test/parallel/test-worker-message-port.js', (t) => {
  const dummyPort = new MessageChannel().port1

  for (const [args, expected] of [
    [
      ['message'],
      {
        type: 'message',
        data: null,
        origin: '',
        lastEventId: '',
        source: null,
        ports: []
      }
    ],
    [
      ['message', { data: undefined, origin: 'foo' }],
      {
        type: 'message',
        data: null,
        origin: 'foo',
        lastEventId: '',
        source: null,
        ports: []
      }
    ],
    [
      ['message', { data: 2, origin: 1, lastEventId: 0 }],
      {
        type: 'message',
        data: 2,
        origin: '1',
        lastEventId: '0',
        source: null,
        ports: []
      }
    ],
    [
      ['message', { lastEventId: 'foo' }],
      {
        type: 'message',
        data: null,
        origin: '',
        lastEventId: 'foo',
        source: null,
        ports: []
      }
    ],
    [
      ['messageerror', { lastEventId: 'foo', source: dummyPort }],
      {
        type: 'messageerror',
        data: null,
        origin: '',
        lastEventId: 'foo',
        source: dummyPort,
        ports: []
      }
    ],
    [
      ['message', { ports: [dummyPort], source: null }],
      {
        type: 'message',
        data: null,
        origin: '',
        lastEventId: '',
        source: null,
        ports: [dummyPort]
      }
    ]
  ]) {
    const ev = new MessageEvent(...args)
    const { type, data, origin, lastEventId, source, ports } = ev
    t.assert.deepStrictEqual(expected, {
      type, data, origin, lastEventId, source, ports
    })
  }

  t.assert.throws(() => new MessageEvent('message', { source: 1 }), {
    constructor: TypeError,
    message: 'MessageEvent constructor: Expected eventInitDict.source ("1") to be an instance of MessagePort.'
  })
  t.assert.throws(() => new MessageEvent('message', { source: {} }), {
    constructor: TypeError,
    message: 'MessageEvent constructor: Expected eventInitDict.source ("{}") to be an instance of MessagePort.'
  })
  t.assert.throws(() => new MessageEvent('message', { ports: 0 }), {
    constructor: TypeError,
    message: 'MessageEvent constructor: eventInitDict.ports (0) is not iterable.'
  })
  t.assert.throws(() => new MessageEvent('message', { ports: [null] }), {
    constructor: TypeError,
    message: 'MessageEvent constructor: Expected eventInitDict.ports[0] ("null") to be an instance of MessagePort.'
  })
  t.assert.throws(() =>
    new MessageEvent('message', { ports: [{}] })
  , {
    constructor: TypeError,
    message: 'MessageEvent constructor: Expected eventInitDict.ports[0] ("{}") to be an instance of MessagePort.'
  })

  t.assert.ok(new MessageEvent('message') instanceof Event)

  // https://github.com/nodejs/node/issues/51767
  const event = new MessageEvent('type', { cancelable: true })
  event.preventDefault()

  t.assert.ok(event.cancelable)
  t.assert.ok(event.defaultPrevented)
})

test('bug in node core', (t) => {
  // In node core, this will throw an error.
  new MessageEvent('', null) // eslint-disable-line no-new
})
