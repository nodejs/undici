'use strict'

const { AsyncResource } = require('async_hooks')
const {
  InvalidArgumentError
} = require('./errors')

class UpgradeHandler extends AsyncResource {
  constructor (opts, callback) {
    super('UNDICI_UPGRADE')

    if (!opts || typeof opts !== 'object') {
      throw new InvalidArgumentError('invalid opts')
    }

    if (opts.method === 'CONNECT') {
      throw new InvalidArgumentError('invalid method')
    }

    if (opts.body) {
      throw new InvalidArgumentError('invalid body')
    }

    this.callback = callback
  }

  _onUpgrade (statusCode, headers, socket) {
    const { callback, opaque } = this

    this.callback = null
    this.runInAsyncScope(callback, null, null, {
      headers,
      socket,
      opaque
    })
  }

  _onError (err) {
    const { callback } = this

    if (callback) {
      this.callback = null
      // TODO: Async Scope
      process.nextTick(callback, err, null)
    }
  }
}

module.exports = function upgrade (client, opts, callback) {
  if (callback === undefined) {
    return new Promise((resolve, reject) => {
      upgrade(client, opts, (err, data) => {
        return err ? reject(err) : resolve(data)
      })
    })
  }

  if (typeof callback !== 'function') {
    throw new InvalidArgumentError('invalid callback')
  }

  try {
    client.dispatch({
      ...opts,
      upgrade: opts.protocol || 'Websocket',
      method: opts.method || 'GET'
    }, new UpgradeHandler(opts, callback))
  } catch (err) {
    process.nextTick(callback, err, null)
  }
}
