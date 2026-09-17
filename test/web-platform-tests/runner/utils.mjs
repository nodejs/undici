// https://github.com/web-platform-tests/wpt/blob/b24eedd/resources/testharness.js#L3705
export function sanitizeUnpairedSurrogates (str) {
  return str.replace(
    /([\ud800-\udbff]+)(?![\udc00-\udfff])|(^|[^\ud800-\udbff])([\udc00-\udfff]+)/g,
    function (_, low, prefix, high) {
      let output = prefix || '' // Prefix may be undefined
      const string = low || high // Only one of these alternates can match
      for (let i = 0; i < string.length; i++) {
        output += codeUnitStr(string[i])
      }
      return output
    })
}

function codeUnitStr (char) {
  return 'U+' + char.charCodeAt(0).toString(16)
}

const CONTROL_CHARACTERS = /[\x00-\x1F\x7F-\x9F]/g // eslint-disable-line no-control-regex

// Test names and failure messages can contain raw control characters, e.g. the
// mimesniff fixtures cover every byte from 0x00 to 0xFF. Terminals interpret C0
// and C1 controls such as ESC, OSC (U+009D) and APC (U+009F) as escape
// sequences, and a string-introducing one hides all later output, including the
// summary and the shell prompt, until a terminator that never arrives.
export function escapeControlCharacters (str) {
  return str.replace(CONTROL_CHARACTERS, (char) => `\\u${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
}
