'use strict'

const { collectASequenceOfCodePoints } = require('../fetch/dataURL')
const assert = require('assert')

/**
 * @description Parses the field-value attributes of a set-cookie header string.
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.4
 * @param {string} header
 * @returns if the header is invalid, null will be returned
 */
function parseSetCookie (header) {
  // 1. If the set-cookie-string contains a %x00-08 / %x0A-1F / %x7F
  //    character (CTL characters excluding HTAB): Abort these steps and
  //    ignore the set-cookie-string entirely.
  if (/[\x00-\x08\x0A-\x1F\x7F]/g.test(header)) { // eslint-disable-line no-control-regex
    return null
  }

  let nameValuePair = ''
  let unparsedAttributes = ''
  let name = ''
  let value = ''

  // 2. If the set-cookie-string contains a %x3B (";") character:
  if (header.includes(';')) {
    // 1. The name-value-pair string consists of the characters up to,
    //    but not including, the first %x3B (";"), and the unparsed-
    //    attributes consist of the remainder of the set-cookie-string
    //    (including the %x3B (";") in question).
    const position = { position: 0 }

    nameValuePair = collectASequenceOfCodePoints((char) => char !== ';', header, position)
    unparsedAttributes = header.slice(position.position)
  } else {
    // Otherwise:

    // 1. The name-value-pair string consists of all the characters
    //    contained in the set-cookie-string, and the unparsed-
    //    attributes is the empty string.
    nameValuePair = header
  }

  // 3. If the name-value-pair string lacks a %x3D ("=") character, then
  //    the name string is empty, and the value string is the value of
  //    name-value-pair.
  if (!nameValuePair.includes('=')) {
    value = nameValuePair
  } else {
    //    Otherwise, the name string consists of the characters up to, but
    //    not including, the first %x3D ("=") character, and the (possibly
    //    empty) value string consists of the characters after the first
    //    %x3D ("=") character.
    const position = { position: 0 }
    name = collectASequenceOfCodePoints(
      (char) => char !== '=',
      nameValuePair,
      position
    )
    value = nameValuePair.slice(position.position + 1)
  }

  // 4. Remove any leading or trailing WSP characters from the name
  //    string and the value string.
  name = name.trim()
  value = value.trim()

  // 5. If the sum of the lengths of the name string and the value string
  //    is more than 4096 octets, abort these steps and ignore the set-
  //    cookie-string entirely.
  if (name.length + value.length > 4096) {
    return null
  }

  // 6. The cookie-name is the name string, and the cookie-value is the
  //    value string.
  return { cookieName: name, cookieValue: value, unparsedAttributes }
}

/**
 * Parses the remaining attributes of a set-cookie header
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.4
 * @param {string} unparsedAttributes
 * @param {[Object.<string, unknown>]={}} cookieAttributeList
 */
function parseUnparsedAttributes (unparsedAttributes, cookieAttributeList = {}) {
  // 1. If the unparsed-attributes string is empty, skip the rest of
  //    these steps.
  if (unparsedAttributes.length === 0) {
    return cookieAttributeList
  }

  // 2. Discard the first character of the unparsed-attributes (which
  //    will be a %x3B (";") character).
  assert(unparsedAttributes[0] === ';')
  unparsedAttributes = unparsedAttributes.slice(1)

  let cookieAv = ''

  // 3. If the remaining unparsed-attributes contains a %x3B (";")
  //    character:
  if (unparsedAttributes.includes(';')) {
    // 1. Consume the characters of the unparsed-attributes up to, but
    //    not including, the first %x3B (";") character.
    cookieAv = collectASequenceOfCodePoints(
      (char) => char !== ';',
      unparsedAttributes,
      { position: 0 }
    )
    unparsedAttributes = unparsedAttributes.slice(cookieAv.length)
  } else {
    // Otherwise:

    // 1. Consume the remainder of the unparsed-attributes.
    cookieAv = unparsedAttributes
    unparsedAttributes = ''
  }

  // Let the cookie-av string be the characters consumed in this step.

  let attributeName = ''
  let attributeValue = ''

  // 4. If the cookie-av string contains a %x3D ("=") character:
  if (cookieAv.includes('=')) {
    // 1. The (possibly empty) attribute-name string consists of the
    //    characters up to, but not including, the first %x3D ("=")
    //    character, and the (possibly empty) attribute-value string
    //    consists of the characters after the first %x3D ("=")
    //    character.
    const position = { position: 0 }

    attributeName = collectASequenceOfCodePoints(
      (char) => char !== '=',
      cookieAv,
      position
    )
    attributeValue = cookieAv.slice(position.position + 1)
  } else {
    // Otherwise:

    // 1. The attribute-name string consists of the entire cookie-av
    //    string, and the attribute-value string is empty.
    attributeName = cookieAv
  }

  // 5. Remove any leading or trailing WSP characters from the attribute-
  //    name string and the attribute-value string.
  attributeName = attributeName.trim()
  attributeValue = attributeValue.trim()

  // 6. If the attribute-value is longer than 1024 octets, ignore the
  //    cookie-av string and return to Step 1 of this algorithm.
  if (attributeValue.length > 1024) {
    return parseUnparsedAttributes(unparsedAttributes, cookieAttributeList)
  }

  // 7. Process the attribute-name and attribute-value according to the
  //    requirements in the following subsections.  (Notice that
  //    attributes with unrecognized attribute-names are ignored.)
  const attributeNameLowercase = attributeName.toLowerCase()

  // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.4.1
  // If the attribute-name case-insensitively matches the string
  // "Expires", the user agent MUST process the cookie-av as follows.
  if (attributeNameLowercase === 'expires') {
    // TODO:
  }

  // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.4.2
  // If the attribute-name case-insensitively matches the string "Max-
  // Age", the user agent MUST process the cookie-av as follows.
  if (attributeNameLowercase === 'max-age') {
    // 1. If the first character of the attribute-value is not a DIGIT or a
    //    "-" character, ignore the cookie-av.
    const charCode = attributeValue.charCodeAt(0)

    if (charCode < 48 || charCode > 57 || attributeValue[0] !== '-') {
      cookieAv = ''
    }

    // 2. If the remainder of attribute-value contains a non-DIGIT
    //    character, ignore the cookie-av.
    if (!/^\d+$/.test(attributeValue.slice(1))) {
      cookieAv = ''
    }

    // 3. Let delta-seconds be the attribute-value converted to an integer.
    let deltaSeconds = Number(attributeValue)

    // 4. Let cookie-age-limit be the maximum age of the cookie (which
    //    SHOULD be 400 days or less, see Section 4.1.2.2).
    const cookieAgeLimit = 34_560_000 // 400 days in seconds, see section 4.1.2.2

    // 5. Set delta-seconds to the smaller of its present value and cookie-
    //    age-limit.
    deltaSeconds = Math.min(deltaSeconds, cookieAgeLimit)

    // 6. If delta-seconds is less than or equal to zero (0), let expiry-
    //    time be the earliest representable date and time.  Otherwise, let
    //    the expiry-time be the current date and time plus delta-seconds
    //    seconds.
    const expiryTime = deltaSeconds <= 0
      ? Date.now()
      : Date.now() + (deltaSeconds * 1000)

    // 7. Append an attribute to the cookie-attribute-list with an
    //    attribute-name of Max-Age and an attribute-value of expiry-time.
    cookieAttributeList['Max-Age'] = expiryTime
  }

  // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.4.3
  // If the attribute-name case-insensitively matches the string "Domain",
  // the user agent MUST process the cookie-av as follows.
  if (attributeNameLowercase === 'domain') {
    // 1. Let cookie-domain be the attribute-value.
    let cookieDomain = attributeValue

    // 2. If cookie-domain starts with %x2E ("."), let cookie-domain be
    //    cookie-domain without its leading %x2E (".").
    if (cookieDomain[0] === '.') {
      cookieDomain = cookieDomain.slice(1)
    }

    // 3. Convert the cookie-domain to lower case.
    cookieDomain = cookieDomain.toLowerCase()

    // 4. Append an attribute to the cookie-attribute-list with an
    //    attribute-name of Domain and an attribute-value of cookie-domain.
    cookieAttributeList.Domain = cookieDomain
  }

  // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.4.4
  // If the attribute-name case-insensitively matches the string "Path",
  // the user agent MUST process the cookie-av as follows.
  if (attributeNameLowercase === 'path') {
    // 1. If the attribute-value is empty or if the first character of the
    //    attribute-value is not %x2F ("/"):
    let cookiePath = ''
    if (attributeValue.length === 0 || attributeValue[0] !== '/') {
      // 1. Let cookie-path be the default-path.
      cookiePath = '/'
    } else {
      // Otherwise:

      // 1. Let cookie-path be the attribute-value.
      cookiePath = attributeValue
    }

    // 2. Append an attribute to the cookie-attribute-list with an
    //    attribute-name of Path and an attribute-value of cookie-path.
    cookieAttributeList.Path = cookiePath
  }

  // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.4.5
  // If the attribute-name case-insensitively matches the string "Secure",
  // the user agent MUST append an attribute to the cookie-attribute-list
  // with an attribute-name of Secure and an empty attribute-value.
  if (attributeNameLowercase === 'secure') {
    cookieAttributeList.Secure = ''
  }

  // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.4.6
  // If the attribute-name case-insensitively matches the string
  // "HttpOnly", the user agent MUST append an attribute to the cookie-
  // attribute-list with an attribute-name of HttpOnly and an empty
  // attribute-value.
  if (attributeNameLowercase === 'httponly') {
    cookieAttributeList.HttpOnly = ''
  }

  // https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.4.7
  // If the attribute-name case-insensitively matches the string
  // "SameSite", the user agent MUST process the cookie-av as follows:
  if (attributeNameLowercase === 'samesite') {
    // 1. Let enforcement be "Default".
    let enforcement = 'Default'

    const attributeValueLowercase = attributeValue.toLowerCase()
    // 2. If cookie-av's attribute-value is a case-insensitive match for
    //    "None", set enforcement to "None".
    if (attributeValueLowercase.includes('none')) {
      enforcement = 'None'
    }

    // 3. If cookie-av's attribute-value is a case-insensitive match for
    //    "Strict", set enforcement to "Strict".
    if (attributeValueLowercase.includes('strict')) {
      enforcement = 'Strict'
    }

    // 4. If cookie-av's attribute-value is a case-insensitive match for
    //    "Lax", set enforcement to "Lax".
    if (attributeValueLowercase.includes('lax')) {
      enforcement = 'Lax'
    }

    // 5. Append an attribute to the cookie-attribute-list with an
    //    attribute-name of "SameSite" and an attribute-value of
    //    enforcement.
    cookieAttributeList.SameSite = enforcement
  }

  // 8. Return to Step 1 of this algorithm.
  return parseUnparsedAttributes(unparsedAttributes, cookieAttributeList)
}

module.exports = {
  parseSetCookie,
  parseUnparsedAttributes
}
