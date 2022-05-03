'use strict'

const globalDispatcher = Symbol.for('undici.globalDispatcher')
const { InvalidArgumentError } = require('./core/errors')
const Agent = require('./agent')

if (getGlobalDispatcher() === undefined) {
  setGlobalDispatcher(new Agent())
}

function setGlobalDispatcher (agent) {
  if (!agent || typeof agent.dispatch !== 'function') {
    throw new InvalidArgumentError('Argument agent must implement Agent')
  }
  Object.defineProperty(globalThis, globalDispatcher, {
    value: agent,
    writable: true,
    enumerable: false,
    configurable: false
  })
}

function getGlobalDispatcher () {
  return globalThis[globalDispatcher]
}

module.exports = {
  setGlobalDispatcher,
  getGlobalDispatcher
}
