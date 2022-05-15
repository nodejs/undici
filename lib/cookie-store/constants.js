'use strict'

// https://wicg.github.io/cookie-store/#cookie-maximum-attribute-value-size
const maxAttributeValueSize = 1024

// https://wicg.github.io/cookie-store/#cookie-maximum-name-value-pair-size
const maxNameValuePairSize = 4096

// https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-4.1.2.1
const maxExpiresMs = 34_560_000 * 1000

module.exports = {
  maxAttributeValueSize,
  maxNameValuePairSize,
  maxExpiresMs
}
