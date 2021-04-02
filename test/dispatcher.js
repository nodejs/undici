'use strict'

const t = require('tap')
const { test } = t

const Dispatcher = require('../lib/dispatcher')

class PoorImplementation extends Dispatcher {}

test('dispatcher implementation', (t) => {
  t.plan(6)

  const dispatcher = new Dispatcher()
  t.throw(() => dispatcher.dispatch(), Error, 'throws on unimplemented dispatch')
  t.throw(() => dispatcher.close(), Error, 'throws on unimplemented close')
  t.throw(() => dispatcher.destroy(), Error, 'throws on unimplemented destroy')

  const poorImplementation = new PoorImplementation()
  t.throw(() => poorImplementation.dispatch(), Error, 'throws on unimplemented dispatch')
  t.throw(() => poorImplementation.close(), Error, 'throws on unimplemented close')
  t.throw(() => poorImplementation.destroy(), Error, 'throws on unimplemented destroy')
})
