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

/**
 * @param {NodeModuleName} moduleName
 * @param {string} property
 * @returns {boolean}
 */
function detectRuntimeFeatureByExportedProperty (moduleName, property) {
  const module = require(moduleName)
  return typeof module[property] !== 'undefined'
}

const runtimeFeaturesByExportedProperty = /** @type {const} */ (['markAsUncloneable', 'zstd'])

/** @type {Record<RuntimeFeatureByExportedProperty, [NodeModuleName, string]>} */
const exportedPropertyLookup = {
  markAsUncloneable: ['node:worker_threads', 'markAsUncloneable'],
  zstd: ['node:zlib', 'createZstdDecompress']
}

/** @typedef {typeof runtimeFeaturesByExportedProperty[number]} RuntimeFeatureByExportedProperty */

const runtimeFeaturesAsNodeModule = /** @type {const} */ (['crypto', 'sqlite'])
/** @typedef {typeof runtimeFeaturesAsNodeModule[number]} RuntimeFeatureByNodeModule */

const features = /** @type {const} */ ([
  ...runtimeFeaturesAsNodeModule,
  ...runtimeFeaturesByExportedProperty
])
/** @typedef {typeof features[number]} Feature */

function detectRuntimeFeature (feature) {
  if (runtimeFeaturesAsNodeModule.includes(feature)) {
    return detectRuntimeFeatureByNodeModule(`node:${feature}`)
  } else if (runtimeFeaturesByExportedProperty.includes(feature)) {
    const [moduleName, property] = exportedPropertyLookup[feature]
    return detectRuntimeFeatureByExportedProperty(moduleName, property)
  }
  throw new TypeError(`unknown feature: ${feature}`)
}

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
    const result = detectRuntimeFeature(feature)
    this.#map.set(feature, result)
    return result
  }
}

const instance = new RuntimeFeatures()

module.exports.runtimeFeatures = instance
module.exports.default = instance
