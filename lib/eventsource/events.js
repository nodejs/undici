'use strict'

const { webidl } = require('../fetch/webidl')
const {
  MessageEvent,
  ErrorEvent,
  eventInit
} = require('../websocket/events')

class OpenEvent extends Event {
  constructor (type, eventInitDict = {}) {
    webidl.argumentLengthCheck(arguments, 1, { header: 'OpenEvent constructor' })

    type = webidl.converters.DOMString(type)
    eventInitDict = webidl.converters.OpenEventInit(eventInitDict)

    super(type, eventInitDict)
  }
}

webidl.converters.OpenEventInit = webidl.dictionaryConverter(eventInit)

module.exports = {
  ErrorEvent,
  MessageEvent,
  OpenEvent
}
