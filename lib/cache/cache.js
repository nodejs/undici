'use strict'

const { kConstruct } = require('./symbols')
const { webidl } = require('../fetch/webidl')
const { Response } = require('../fetch/response')

class Cache {
  #id
  
  constructor () {
    if (arguments[0] !== kConstruct) {
      webidl.illegalConstructor()
    }

    this.#id = arguments[1]
  }

  async match (request, options = {}) {
    webidl.brandCheck(this, Cache)
    webidl.argumentLengthCheck(arguments, 1, { header: 'Cache.match' })

    request = webidl.converters.RequestInfo(request)
    options = webidl.converters.CacheQueryOptions(options)
  }

  async matchAll (request = undefined, options = {}) {
    webidl.brandCheck(this, Cache)

    if (request !== undefined) request = webidl.converters.RequestInfo(request)
    options = webidl.converters.CacheQueryOptions(options)
  }

  async add (request) {
    webidl.brandCheck(this, Cache)
    webidl.argumentLengthCheck(arguments, 1, { header: 'Cache.add' })

    request = webidl.converters.RequestInfo(request)
  }

  async addAll (requests) {
    webidl.brandCheck(this, Cache)
    webidl.argumentLengthCheck(arguments, 1, { header: 'Cache.addAll' })

    requests = webidl.converters['sequence<RequestInfo>'](requests)
  }

  async put (request, response) {
    webidl.brandCheck(this, Cache)
    webidl.argumentLengthCheck(arguments, 2, { header: 'Cache.put' })

    request = webidl.converters.RequestInfo(request)
    response = webidl.converters.Response(response)
  }

  async delete (request, options = {}) {
    webidl.brandCheck(this, Cache)
    webidl.argumentLengthCheck(arguments, 1, { header: 'Cache.delete' })

    request = webidl.converters.RequestInfo(request)
    options = webidl.converters.CacheQueryOptions(options)
  }

  async keys (request = undefined, options = {}) {
    webidl.brandCheck(this, Cache)

    if (request !== undefined) request = webidl.converters.RequestInfo(request)
    options = webidl.converters.CacheQueryOptions(options)
  }
}

webidl.converters.CacheQueryOptions = webidl.dictionaryConverter([
  {
    key: 'ignoreSearch',
    converter: webidl.converters.boolean,
    defaultValue: false
  },
  {
    key: 'ignoreMethod',
    converter: webidl.converters.boolean,
    defaultValue: false
  },
  {
    key: 'ignoreVary',
    converter: webidl.converters.boolean,
    defaultValue: false
  }
])

webidl.converters.Response = webidl.interfaceConverter(Response)

webidl.converters['sequence<RequestInfo>'] = webidl.sequenceConverter(
  webidl.converters.RequestInfo
)

module.exports = {
  Cache
}
