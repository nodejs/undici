'use strict'

// We include a version number for the Dispatcher API. In case of breaking changes,
// this version number must be increased to avoid conflicts.
const globalDispatcher = Symbol.for('undici.globalDispatcher.1')
const { InvalidArgumentError } = require('./core/errors')
const Agent = require('./dispatcher/agent')

// Fallback storage for when globalThis is not extensible (e.g. frozen)
let fallbackDispatcher

if (getGlobalDispatcher() === undefined) {
  setGlobalDispatcher(new Agent())
}

function setGlobalDispatcher (agent) {
  if (!agent || typeof agent.dispatch !== 'function') {
    throw new InvalidArgumentError('Argument agent must implement Agent')
  }

  try {
    Object.defineProperty(globalThis, globalDispatcher, {
      value: agent,
      writable: true,
      enumerable: false,
      configurable: false
    })
  } catch (err) {
    // globalThis is not extensible (e.g. Object.freeze(globalThis))
    // Use fallback storage instead
    if (err instanceof TypeError) {
      fallbackDispatcher = agent
      return
    }
    throw err
  }
}

function getGlobalDispatcher () {
  return globalThis[globalDispatcher] ?? fallbackDispatcher
}

module.exports = {
  setGlobalDispatcher,
  getGlobalDispatcher
}
