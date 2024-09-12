'use strict'

const singulars = /** @type {const} */ ({
  pronoun: 'it',
  is: 'is',
  was: 'was',
  this: 'this'
})

const plurals = /** @type {const} */ ({
  pronoun: 'they',
  is: 'are',
  was: 'were',
  this: 'these'
})

/**
 * @template S, P
 * @template {number|1} [C=number]
 * @typedef {((count: 1) => Readonly<typeof singulars & { noun: S, count: 1 }>) & ((count: C) => Readonly<typeof plurals & { noun: P, count: C }>)} PluralizerFunction
 */

/**
 * Generates a pluralizer function for the given singular and plural forms.
 *
 * @template {string} S
 * @template {string} P
 * @param {S} singular - The singular form of the word.
 * @param {P} plural - The plural form of the word.
 * @returns {PluralizerFunction<S, P>} - A function that pluralizes the word based on the provided count.
 */
function pluralizer (singular, plural) {
  const singularResult = { ...singulars, noun: singular }
  const pluralResult = { ...plurals, noun: plural }

  return (count) => {
    return count === 1
      ? { ...singularResult, count }
      : { ...pluralResult, count }
  }
}

module.exports = pluralizer
