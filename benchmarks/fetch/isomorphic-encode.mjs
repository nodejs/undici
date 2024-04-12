import { bench, group, run } from 'mitata'
import { isomorphicEncode } from '../../lib/web/fetch/util.js'

const characters =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const charactersLength = characters.length

function generateAsciiString (length) {
  let result = ''
  for (let i = 0; i < length; ++i) {
    result += characters[Math.floor(Math.random() * charactersLength)]
  }
  return result
}

const invalidIsomorphicEncodeValueRegex = /[^\x00-\xFF]/ // eslint-disable-line

function isomorphicEncode1 (input) {
  // 1. Assert: input contains no code points greater than U+00FF.
  for (let i = 0; i < input.length; i++) {
    if (input.charCodeAt(i) > 0xff) {
      throw new TypeError('Unreachable')
    }
  }
  // 2. Return a byte sequence whose length is equal to input’s code
  //    point length and whose bytes have the same values as the
  //    values of input’s code points, in the same order
  return input
}

/**
 * @see https://infra.spec.whatwg.org/#isomorphic-encode
 * @param {string} input
 */
function isomorphicEncode2 (input) {
  // 1. Assert: input contains no code points greater than U+00FF.
  if (invalidIsomorphicEncodeValueRegex.test(input)) {
    throw new TypeError('Unreachable')
  }
  // 2. Return a byte sequence whose length is equal to input’s code
  //    point length and whose bytes have the same values as the
  //    values of input’s code points, in the same order
  return input
}

const settings = {
  small: `${generateAsciiString(10)}`,
  middle: `${generateAsciiString(30)}`,
  long: `${generateAsciiString(70)}`
}

for (const [runName, value] of Object.entries(settings)) {
  [
    { name: `${runName} (valid)`, value },
    {
      name: `${runName} (invalid)`,
      value: `${value.slice(0, -1)}${String.fromCharCode(0xff + 1)}`
    }
  ].forEach(({ name, value }) => {
    group(name, () => {
      [
        {
          name: 'original',
          fn: isomorphicEncode
        },
        {
          name: 'String#charCodeAt',
          fn: isomorphicEncode1
        },
        {
          name: 'RegExp#test',
          fn: isomorphicEncode2
        }
      ].forEach(({ name, fn }) => {
        bench(name, () => {
          try {
            return fn(value)
          } catch (err) {}
        })
      })
    })
  })
}

await run()
