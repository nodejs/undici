'use strict'

module.exports = {
  kState: Symbol('FileReader state'),
  kResult: Symbol('FileReader result'),
  kError: Symbol('FileReader error'),
  kLastProgressEventFired: Symbol('FileReader last progress event fired timestamp'),
  kEvents: Symbol('FileReader events'),
  kAborted: Symbol('FileReader aborted'),

  kType: require('../core/symbols').kType,
  kFileReader: Symbol('FileReader'),
  kProgressEvent: Symbol('ProgressEvent')
}
