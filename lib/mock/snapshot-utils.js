'use strict'

const { InvalidArgumentError } = require('../core/errors')

const validSnapshotModes = /** @type {const} */ (['record', 'playback', 'update'])

/** @typedef {typeof validSnapshotModes[number]} SnapshotMode */

/**
 * @param {*} mode - The snapshot mode to validate
 * @returns {asserts mode is SnapshotMode}
 */
function validateSnapshotMode (mode) {
  if (!validSnapshotModes.includes(mode)) {
    throw new InvalidArgumentError(`Invalid snapshot mode: ${mode}. Must be one of: ${validSnapshotModes.join(', ')}`)
  }
}

module.exports = {
  validateSnapshotMode
}
