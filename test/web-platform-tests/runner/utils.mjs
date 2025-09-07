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

/**
 * @type {import('../../../lib/util/promise')['createDeferredPromise']}
 */
export const createDeferredPromise =
  Promise.withResolvers?.bind(Promise) ?? (await import('../../../lib/util/promise.js')).createDeferredPromise
