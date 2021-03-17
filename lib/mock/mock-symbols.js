'use strict'

module.exports = {
  kDispatches: Symbol('dispatches'),
  kDispatch: Symbol('dispatch'),
  kDispatchKey: Symbol('dispatch key'),
  kDefaultHeaders: Symbol('default headers'),
  kDefaultTrailers: Symbol('default trailers'),
  kContentLength: Symbol('content length'),
  kMockAgent: Symbol('mock agent'),
  kMockAgentSet: Symbol('mock agent set'),
  kMockAgentGet: Symbol('mock agent get'),
  kBuildMockDispatch: Symbol('build mock dispatch'),
  kMockDispatch: Symbol('mock dispatch'),
  kClose: Symbol('close'),
  kOriginalClientDispatch: Symbol('original client dispatch'),
  kOriginalPoolDispatch: Symbol('original pool dispatch'),
  kOriginalClose: Symbol('original agent close'),
  kIsClient: Symbol('is client'),
  kOrigin: Symbol('origin'),
  kCreatePool: Symbol('mock agent createPool'),
  kIsMockEnabled: Symbol('is mock enabled'),
  kIsMockActive: Symbol('is mock active'),
  kNetConnect: Symbol('net connect'),
  kGetNetConnect: Symbol('get net connect')
}
