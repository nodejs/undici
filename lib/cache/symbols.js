'use strict'

module.exports = {
  kConstruct: require('../core/symbols').kConstruct,
  kType: require('../core/symbols').kType,
  kCache: Symbol('cache'),
  kCacheStorage: Symbol('cachestorage')
}
