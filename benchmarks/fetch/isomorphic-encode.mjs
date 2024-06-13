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
  for (let i = 0; i < input.length; i++) {
    if (input.charCodeAt(i) > 0xff) {
      throw new TypeError('Unreachable')
    }
  }
  return input
}

function isomorphicEncode2 (input) {
  if (invalidIsomorphicEncodeValueRegex.test(input)) {
    throw new TypeError('Unreachable')
  }
  return input
}

const settings = {
  small: 10,
  middle: 30,
  long: 70
}

for (const [runName, length] of Object.entries(settings)) {
  const value = generateAsciiString(length);

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
