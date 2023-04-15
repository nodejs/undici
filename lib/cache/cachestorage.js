'use strict'

const { kConstruct } = require('./symbols')
const { webidl } = require('../fetch/webidl')
require('./cache')

class CacheStorage {
  constructor () {
    if (arguments[0] !== kConstruct) {
      webidl.illegalConstructor()
    }
  }

  async match (request, options = {}) {
    webidl.brandCheck(this, CacheStorage)
    webidl.argumentLengthCheck(arguments, 1, { header: 'CacheStorage.match' })

    request = webidl.converters.RequestInfo(request)
    options = webidl.converters.CacheQueryOptions(options)
  }

  async has (cacheName) {
    webidl.brandCheck(this, CacheStorage)
    webidl.argumentLengthCheck(arguments, 1, { header: 'CacheStorage.has' })

    cacheName = webidl.converters.DOMString(cacheName)
  }

  async open (cacheName) {
    webidl.brandCheck(this, CacheStorage)
    webidl.argumentLengthCheck(arguments, 1, { header: 'CacheStorage.open' })

    cacheName = webidl.converters.DOMString(cacheName)
  }

  async delete (cacheName) {
    webidl.brandCheck(this, CacheStorage)
    webidl.argumentLengthCheck(arguments, 1, { header: 'CacheStorage.delete' })

    cacheName = webidl.converters.DOMString(cacheName)
  }

  async keys () {
    webidl.brandCheck(this, CacheStorage)
  }
}

module.exports = {
  CacheStorage
}
