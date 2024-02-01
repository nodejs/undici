'use strict'

module.exports = {
  kUrl: Symbol('url'),
  kHeaders: Symbol('headers'),
  kSignal: Symbol('signal'),
  kState: Symbol('state'),
  kGuard: Symbol('guard'),
  kRealm: Symbol('realm'),

  kType: require('../core/symbols').kType,
  kFile: Symbol('file'),
  kFileLike: Symbol('filelike'),
  kFetch: Symbol('fetch'),
  kRequest: Symbol('request'),
  kFormData: Symbol('formdata'),
  kResponse: Symbol('response')
}
