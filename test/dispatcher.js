'use strict'

const { test } = require('node:test')

const Dispatcher = require('../lib/dispatcher/dispatcher')

class PoorImplementation extends Dispatcher {}

test('dispatcher implementation', (t) => {
  t.plan(6)

  const dispatcher = new Dispatcher()
  t.assert.throws(() => dispatcher.dispatch(), Error, 'throws on unimplemented dispatch')
  t.assert.throws(() => dispatcher.close(), Error, 'throws on unimplemented close')
  t.assert.throws(() => dispatcher.destroy(), Error, 'throws on unimplemented destroy')

  const poorImplementation = new PoorImplementation()
  t.assert.throws(() => poorImplementation.dispatch(), Error, 'throws on unimplemented dispatch')
  t.assert.throws(() => poorImplementation.close(), Error, 'throws on unimplemented close')
  t.assert.throws(() => poorImplementation.destroy(), Error, 'throws on unimplemented destroy')
})

test('dispatcher.compose', (t) => {
  t.plan(7)

  const dispatcher = new Dispatcher()
  const interceptor = () => (opts, handler) => {}
  // Should return a new dispatcher
  t.assert.ok(dispatcher.compose(interceptor) !== dispatcher)
  t.assert.throws(() => dispatcher.dispatch({}), Error, 'invalid interceptor')
  t.assert.throws(() => dispatcher.dispatch(() => null), Error, 'invalid interceptor')
  t.assert.throws(() => dispatcher.dispatch(dispatch => dispatch, () => () => {}, Error, 'invalid interceptor'))

  const composed = dispatcher.compose(interceptor)
  t.assert.strictEqual(typeof composed.dispatch, 'function', 'returns an object with a dispatch method')
  t.assert.strictEqual(typeof composed.close, 'function', 'returns an object with a close method')
  t.assert.strictEqual(typeof composed.destroy, 'function', 'returns an object with a destroy method')
})
