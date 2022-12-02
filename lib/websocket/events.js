'use strict'

const { webidl } = require('../fetch/webidl')
const { MessagePort } = require('worker_threads')

/**
 * @see https://html.spec.whatwg.org/multipage/comms.html#messageevent
 */
class MessageEvent extends Event {
  #eventInit

  constructor (type, eventInitDict = {}) {
    type = webidl.converters.DOMString(type)
    eventInitDict = webidl.converters.MessageEventInit(eventInitDict)

    super(type, eventInitDict)

    this.#eventInit = eventInitDict
  }

  get data () {
    webidl.brandCheck(this, MessageEvent)

    return this.#eventInit.data
  }

  get origin () {
    webidl.brandCheck(this, MessageEvent)

    return this.#eventInit.origin
  }

  get lastEventId () {
    webidl.brandCheck(this, MessageEvent)

    return this.#eventInit.lastEventId
  }

  get source () {
    webidl.brandCheck(this, MessageEvent)

    return this.#eventInit.source
  }

  get ports () {
    webidl.brandCheck(this, MessageEvent)

    if (!Object.isFrozen(this.#eventInit.ports)) {
      Object.freeze(this.#eventInit.ports)
    }

    return this.#eventInit.ports
  }

  initMessageEvent (
    type,
    bubbles = false,
    cancelable = false,
    data = null,
    origin = '',
    lastEventId = '',
    source = null,
    ports = []
  ) {
    webidl.brandCheck(this, MessageEvent)

    webidl.argumentLengthCheck(arguments, 1, { header: 'MessageEvent.initMessageEvent' })

    return new MessageEvent(type, {
      bubbles, cancelable, data, origin, lastEventId, source, ports
    })
  }
}

/**
 * @see https://websockets.spec.whatwg.org/#the-closeevent-interface
 */
class CloseEvent extends Event {
  #eventInit

  constructor (type, eventInitDict = {}) {
    type = webidl.converters.DOMString(type)
    eventInitDict = webidl.converters.MessageEventInit(eventInitDict)

    super(type, eventInitDict)

    this.#eventInit = eventInitDict
  }

  get wasClean () {
    webidl.brandCheck(this, CloseEvent)

    return this.#eventInit.wasClean
  }

  get code () {
    webidl.brandCheck(this, CloseEvent)

    return this.#eventInit.code
  }

  get reason () {
    webidl.brandCheck(this, CloseEvent)

    return this.#eventInit.reason
  }
}

webidl.converters.MessagePort = webidl.interfaceConverter(MessagePort)

webidl.converters['sequence<MessagePort>'] = webidl.sequenceConverter(
  webidl.converters.MessagePort
)

webidl.converters.MessageEventInit = webidl.dictionaryConverter([
  {
    key: 'bubbles',
    converter: webidl.converters.boolean,
    defaultValue: false
  },
  {
    key: 'cancelable',
    converter: webidl.converters.boolean,
    defaultValue: false
  },
  {
    key: 'composed',
    converter: webidl.converters.boolean,
    defaultValue: false
  },
  {
    key: 'data',
    converter: webidl.converters.any,
    defaultValue: null
  },
  {
    key: 'origin',
    converter: webidl.converters.USVString,
    defaultValue: ''
  },
  {
    key: 'lastEventId',
    converter: webidl.converters.DOMString,
    defaultValue: ''
  },
  {
    key: 'source',
    // Node doesn't implement WindowProxy or ServiceWorker, so the only
    // valid value for source is a MessagePort.
    converter: webidl.nullableConverter(webidl.converters.MessagePort),
    defaultValue: null
  },
  {
    key: 'ports',
    converter: webidl.converters['sequence<MessagePort>'],
    get defaultValue () {
      return []
    }
  }
])

webidl.converters.CloseEventInit = webidl.dictionaryConverter([
  {
    key: 'bubbles',
    converter: webidl.converters.boolean,
    defaultValue: false
  },
  {
    key: 'cancelable',
    converter: webidl.converters.boolean,
    defaultValue: false
  },
  {
    key: 'composed',
    converter: webidl.converters.boolean,
    defaultValue: false
  },
  {
    key: 'wasClean',
    converter: webidl.converters.boolean,
    defaultValue: false
  },
  {
    key: 'code',
    converter: webidl.converters['unsigned short'],
    defaultValue: 0
  },
  {
    key: 'reason',
    converter: webidl.converters.USVString,
    defaultValue: ''
  }
])

module.exports = {
  MessageEvent,
  CloseEvent
}
