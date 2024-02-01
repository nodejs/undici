'use strict'

module.exports = {
  kWebSocketURL: Symbol('url'),
  kReadyState: Symbol('ready state'),
  kController: Symbol('controller'),
  kResponse: Symbol('response'),
  kBinaryType: Symbol('binary type'),
  kSentClose: Symbol('sent close'),
  kReceivedClose: Symbol('received close'),
  kByteParser: Symbol('byte parser'),

  kType: require('../core/symbols').kType,
  kMessageEvent: Symbol('messageevent'),
  kCloseEvent: Symbol('closeevent'),
  kWebSocket: Symbol('websocket')
}
