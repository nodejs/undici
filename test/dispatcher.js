'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')

const Dispatcher = require('../lib/dispatcher/dispatcher')

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

test('dispatcher.compose', (t) => {
  t = tspl(t, { plan: 7 })

  const dispatcher = new Dispatcher()
  const interceptor = () => (opts, handler) => {}
  // Should return a new dispatcher
  t.ok(dispatcher.compose(interceptor) !== dispatcher)
  t.throws(() => dispatcher.dispatch({}), Error, 'invalid interceptor')
  t.throws(() => dispatcher.dispatch(() => null), Error, 'invalid interceptor')
  t.throws(() => dispatcher.dispatch(dispatch => dispatch, () => () => {}, Error, 'invalid interceptor'))

  const composed = dispatcher.compose(interceptor)
  t.equal(typeof composed.dispatch, 'function', 'returns an object with a dispatch method')
  t.equal(typeof composed.close, 'function', 'returns an object with a close method')
  t.equal(typeof composed.destroy, 'function', 'returns an object with a destroy method')
})
