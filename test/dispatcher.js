'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')

const Dispatcher = require('../lib/dispatcher')

class PoorImplementation extends Dispatcher {}

test('dispatcher implementation', (t) => {
  t = tspl(t, { plan: 6 })

  const dispatcher = new Dispatcher()
  t.throws(() => dispatcher.dispatch(), Error, 'throws on unimplemented dispatch')
  t.throws(() => dispatcher.close(), Error, 'throws on unimplemented close')
  t.throws(() => dispatcher.destroy(), Error, 'throws on unimplemented destroy')

  const poorImplementation = new PoorImplementation()
  t.throws(() => poorImplementation.dispatch(), Error, 'throws on unimplemented dispatch')
  t.throws(() => poorImplementation.close(), Error, 'throws on unimplemented close')
  t.throws(() => poorImplementation.destroy(), Error, 'throws on unimplemented destroy')
})
