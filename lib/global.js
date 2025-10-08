'use strict'

// We include a version number for the Dispatcher API. In case of breaking changes,
// this version number must be increased to avoid conflicts.
const globalDispatcher = Symbol.for('undici.globalDispatcher.1')
const { InvalidArgumentError } = require('./core/errors')
const Agent = require('./dispatcher/agent')

let currentDispatcher = null

if (Object.hasOwn(globalThis, globalDispatcher)) {
  const existing = Reflect.get(globalThis, globalDispatcher)
  if (existing && typeof existing.dispatch === 'function') {
    currentDispatcher = existing
  }
} else {
  Object.defineProperty(globalThis, globalDispatcher, {
    get () {
      if (currentDispatcher === null) {
        currentDispatcher = new Agent()
      }
      return currentDispatcher
    },
    set (agent) {
      setGlobalDispatcher(agent)
    },
    enumerable: false,
    configurable: false
  })
}

function setGlobalDispatcher (agent) {
  if (!agent || typeof agent.dispatch !== 'function') {
    throw new InvalidArgumentError('Argument agent must implement Agent')
  }
  currentDispatcher = agent
}

function getGlobalDispatcher () {
  return globalThis[globalDispatcher]
}

// These are the globals that can be installed by undici.install().
// Not exported by index.js to avoid use outside of this module.
const installedExports = /** @type {const} */ (
  [
    'fetch',
    'Headers',
    'Response',
    'Request',
    'FormData',
    'WebSocket',
    'CloseEvent',
    'ErrorEvent',
    'MessageEvent',
    'EventSource'
  ]
)

module.exports = {
  setGlobalDispatcher,
  getGlobalDispatcher,
  installedExports
}
