// @ts-check

'use strict'

/** @typedef {`node:${string}`} NodeModuleName */

/**
 * @param {NodeModuleName} moduleName
 * @returns {boolean}
 */
function detectRuntimeFeatureByNodeModule (moduleName) {
  try {
    require(moduleName)
    return true
  } catch (err) {
    if (err.code !== 'ERR_UNKNOWN_BUILTIN_MODULE') {
      throw err
    }
    return false
  }
}

const runtimeFeaturesAsNodeModule = /** @type {const} */ (['crypto', 'sqlite'])
/** @typedef {typeof runtimeFeaturesAsNodeModule[number]} RuntimeFeatureByNodeModule */

const features = /** @type {const} */ ([...runtimeFeaturesAsNodeModule])
/** @typedef {typeof features[number]} Feature */

/**
 * @class
 * @name RuntimeFeatures
 */
class RuntimeFeatures {
  /** @type {Map<Feature, boolean>} */
  #map = new Map()

  /**
   * Clears all cached feature detections.
   */
  clear () {
    this.#map.clear()
  }

  /**
   * @param {Feature} feature
   * @returns {boolean}
   */
  has (feature) {
    return (
      this.#map.get(feature) ?? this.#detectRuntimeFeature(feature)
    )
  }

  /**
   * @param {Feature} feature
   * @param {boolean} value
   */
  set (feature, value) {
    if (features.includes(feature) === false) {
      throw new TypeError(`unknown feature: ${feature}`)
    }
    this.#map.set(feature, value)
  }

  /**
   * @param {Feature} feature
   * @returns {boolean}
   */
  #detectRuntimeFeature (feature) {
    const result = detectRuntimeFeatureByNodeModule(`node:${feature}`)
    this.set(feature, result)
    return result
  }
}

const instance = new RuntimeFeatures()

module.exports.runtimeFeatures = instance
module.exports.default = instance
