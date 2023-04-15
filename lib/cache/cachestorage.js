'use strict'

const { kConstruct } = require('./symbols')
const { webidl } = require('../fetch/webidl')

class CacheStorage {
  constructor () {
    if (arguments[0] !== kConstruct) {
      webidl.illegalConstructor()
    }
  }

  async match (request, options = {}) {
    webidl.brandCheck(this, CacheStorage)
    webidl.argumentLengthCheck(arguments, 1, { header: 'CacheStorage.match' })
  }

  async has (cacheName) {
    webidl.brandCheck(this, CacheStorage)
    webidl.argumentLengthCheck(arguments, 1, { header: 'CacheStorage.has' })
  }

  async open (cacheName) {
    webidl.brandCheck(this, CacheStorage)
    webidl.argumentLengthCheck(arguments, 1, { header: 'CacheStorage.open' })
  }

  async delete (cacheName) {
    webidl.brandCheck(this, CacheStorage)
    webidl.argumentLengthCheck(arguments, 1, { header: 'CacheStorage.delete' })
  }

  async keys () {
    webidl.brandCheck(this, CacheStorage)
  }
}

module.exports = {
  CacheStorage
}
