const UNSAFE_METHODS = [
  'POST', 'PUT', 'PATCH', 'DELETE'
]

/**
 * @see https://www.rfc-editor.org/rfc/rfc9111.html#name-cache-control
 * @see https://www.iana.org/assignments/http-cache-directives/http-cache-directives.xhtml
 *
 * @typedef {{
 *   'max-stale'?: number;
 *   'min-fresh'?: number;
 *   'max-age'?: number;
 *   's-maxage'?: number;
 *   'stale-while-revalidate'?: number;
 *   'stale-if-error'?: number;
 *   public?: true;
 *   private?: true | string[];
 *   'no-store'?: true;
 *   'no-cache'?: true | string[];
 *   'must-revalidate'?: true;
 *   'proxy-revalidate'?: true;
 *   immutable?: true;
 *   'no-transform'?: true;
 *   'must-understand'?: true;
 *   'only-if-cached'?: true;
 * }} CacheControlDirectives
 *
 * @param {string} header
 * @returns {CacheControlDirectives}
 */
function parseCacheControlHeader (header) {
  /**
   * @type {import('../util/cache.js').CacheControlDirectives}
   */
  const output = {}

  const directives = header.toLowerCase().split(',')
  for (let i = 0; i < directives.length; i++) {
    const directive = directives[i]
    const keyValueDelimiter = directive.indexOf('=')

    let key
    let value
    if (keyValueDelimiter !== -1) {
      key = directive.substring(0, keyValueDelimiter).trim()
      value = directive
        .substring(keyValueDelimiter + 1)
        .trim()
    } else {
      key = directive.trim()
    }

    switch (key) {
      case 'min-fresh':
      case 'max-stale':
      case 'max-age':
      case 's-maxage':
      case 'stale-while-revalidate':
      case 'stale-if-error': {
        if (value === undefined) {
          continue
        }

        const parsedValue = parseInt(value, 10)
        // eslint-disable-next-line no-self-compare
        if (parsedValue !== parsedValue) {
          continue
        }

        output[key] = parsedValue

        break
      }
      case 'private':
      case 'no-cache': {
        if (value) {
          // The private and no-cache directives can be unqualified (aka just
          //  `private` or `no-cache`) or qualified (w/ a value). When they're
          //  qualified, it's a list of headers like `no-cache=header1`,
          //  `no-cache="header1"`, or `no-cache="header1, header2"`
          // If we're given multiple headers, the comma messes us up since
          //  we split the full header by commas. So, let's loop through the
          //  remaining parts in front of us until we find one that ends in a
          //  quote. We can then just splice all of the parts in between the
          //  starting quote and the ending quote out of the directives array
          //  and continue parsing like normal.
          // https://www.rfc-editor.org/rfc/rfc9111.html#name-no-cache-2
          if (value[0] === '"') {
            // Something like `no-cache="some-header"` OR `no-cache="some-header, another-header"`.

            // Add the first header on and cut off the leading quote
            const headers = [value.substring(1)]

            let foundEndingQuote = false
            for (let j = i; j < directives.length; j++) {
              const nextPart = directives[j]
              const nextPartLength = nextPart.length
              if (nextPartLength !== 0 && nextPart[nextPartLength] === '"') {
                foundEndingQuote = true
                headers.push(...directives.splice(i + 1, j - 1).map(header => header.trim()))

                // Cut off ending quote
                let lastHeader = header[headers.length - 1]
                lastHeader = lastHeader.substring(0, lastHeader.length - 1)
                headers[headers.length - 1] = lastHeader

                break
              }
            }

            if (foundEndingQuote === false) {
              // Something like `no-cache="some-header` with no end quote,
              //  let's just ignore it
              continue
            }

            output[key] = headers
          } else {
            // Something like `no-cache=some-header`
            output[key] = [value]
          }

          break
        }
      }
      // eslint-disable-next-line no-fallthrough
      case 'public':
      case 'no-store':
      case 'must-revalidate':
      case 'proxy-revalidate':
      case 'immutable':
      case 'no-transform':
      case 'must-understand':
      case 'only-if-cached':
        if (value) {
          continue
        }

        output[key] = true
        break
      default:
        // Ignore unknown directives as per https://www.rfc-editor.org/rfc/rfc9111.html#section-5.2.3-1
        continue
    }
  }

  return output
}

/**
 * @param {string} varyHeader Vary header from the server
 * @param {Record<string, string>} headers Request headers
 * @returns {Record<string, string>}
 */
function parseVaryHeader (varyHeader, headers) {
  const output = /** @type {Record<string, string>} */ ({})

  const varyingHeaders = varyHeader.toLowerCase().split(',')
  for (const header of varyingHeaders) {
    const trimmedHeader = header.trim()

    if (headers[trimmedHeader]) {
      output[trimmedHeader] = headers[trimmedHeader]
    }
  }

  return output
}

module.exports = {
  UNSAFE_METHODS,
  parseCacheControlHeader,
  parseVaryHeader
}
