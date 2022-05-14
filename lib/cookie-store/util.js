const assert = require('assert')
const {
  maxAttributeValueSize,
  maxNameValuePairSize
} = require('./constants')

/**
 * @see https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-rfc6265bis#section-5.6.3
 * @param {object[]} cookieStore
 */
function cookieRetrieval (cookieStore) {
  // 1. Let cookie-list be the set of cookies from the cookie store that
  //    meets all of the following requirements:

  // Note: there are a lot of steps I omitted for the sake of this function
  // not being mostly comments. However, this section details whether a
  // cookie is valid. Node.js doesn't have a domain, or runtime flags that
  // could be used to invalidate cookies, so all cookies are seen as valid.

  // Remove all cookies that are not name
  const cookieList = cookieStore

  // 2. The user agent SHOULD sort the cookie-list in the following
  //    order:

  // * Cookies with longer paths are listed before cookies with
  //   shorter paths.

  // * Among cookies that have equal-length path fields, cookies with
  //   earlier creation-times are listed before cookies with later
  //   creation-times.
  cookieList.sort((a, b) => {
    return a.Path.length !== b.Path.length
      ? b.Path.length - a.Path.length
      : a['Max-Age'] - b['Max-Age']
  })

  // 3. Update the last-access-time of each cookie in the cookie-list to
  //    the current date and time.
  // TODO

  // 4. Serialize the cookie-list into a cookie-string by processing each
  //    cookie in the cookie-list in order:
  // Note: "The cookie-string itself is ignored, but the intermediate cookie
  //        list is used in subsequent steps."
  return cookieList
}

/**
 * @see https://wicg.github.io/cookie-store/#query-cookies
 * @param {object[]} cookieStore
 * @param {string} name
 */
function queryCookies (cookieStore, name) {
  // 1. Perform the steps defined in Cookies: HTTP State Management Mechanism
  //    §Retrieval Model to compute the "cookie-string from a given cookie store"
  //    with url as request-uri. The cookie-string itself is ignored, but the
  //    intermediate cookie-list is used in subsequent steps.
  const cookieList = cookieRetrieval(cookieStore)

  // 2. Let list be a new list.
  const list = []

  // 3. For each cookie in cookie-list, run these steps:
  for (const cookie of cookieList) {
    // 1. Assert: cookie’s http-only-flag is false.
    assert(!('HttpOnly' in cookie))

    // 2. If name is given, then run these steps:
    if (typeof name === 'string') {
      // 1. Let cookieName be cookie’s name (decoded).
      const cookieName = decodeUTF8NoBom(cookie.cookieName)

      // 2. If cookieName does not equal name, then continue.
      if (cookieName !== name) {
        continue
      }
    }

    // 3. Let item be the result of running create a CookieListItem from cookie.
    const item = createCookieListItem(cookie)

    // 4. Append item to list.
    list.push(item)
  }

  // 4. Return list.
  return list
}

function decodeUTF8NoBom (string) {
  return string.replace(/[\u00EF|\u00BB|\u00BF]/g, '')
}

/**
 * @see https://wicg.github.io/cookie-store/#create-a-cookielistitem
 * @param {object} cookie
 */
function createCookieListItem (cookie) {
  // 1. Let name be cookie’s name (decoded).
  const name = decodeUTF8NoBom(cookie.cookieName)

  // 2. Let value be cookie’s value (decoded).
  const value = decodeUTF8NoBom(cookie.cookieValue)

  // 3. Let domain be cookie’s domain (decoded).
  const domain = cookie.Domain ? decodeUTF8NoBom(cookie.Domain) : null

  // 4. Let path be cookie’s path (decoded).
  const path = cookie.Path ? decodeUTF8NoBom(cookie.Path) : null

  // 5. Let expires be cookie’s expiry-time (as a timestamp).
  // TODO: this is a random time lol
  const expires = Date.now() + 36_500_000

  // 6. Let secure be cookie’s secure-only-flag.
  const secure = 'Secure' in cookie

  let sameSite = 'strict'
  // 7. Switch on cookie’s same-site-flag:
  if (['None', 'Strict', 'Lax'].includes(cookie.SameSite)) {
    sameSite = cookie.SameSite.toLowerCase()
  }

  // 8. Return «[ "name" → name, "value" → value, "domain" → domain, "path" → path,
  //    "expires" → expires, "secure" → secure, "sameSite" → sameSite ]»
  return { name, value, domain, path, expires, secure, sameSite }
}

/**
 * @see https://wicg.github.io/cookie-store/#set-a-cookie
 * @param {import('../../types/cookie-store').CookieInit} init
 */
function setCookie (init) {
  const { name, value, expires, domain, sameSite = 'strict' } = init
  let { path = '/' } = init

  // 1. If name or value contain U+003B (;), any C0 control character except
  //    U+0009 (the horizontal tab character), or U+007F, then return failure.
  if (/(?![\u0009])[\u0000-\u001F]|;|\u007F/.test(name)) { // eslint-disable-line no-control-regex
    return 'failure'
  } else if (/(?![\u0009])[\u0000-\u001F]|;|\u007F/.test(value)) { // eslint-disable-line no-control-regex
    return 'failure'
  }

  // 2. If name’s length is 0 and value contains U+003D (=), then return failure.
  if (name.length === 0 && value.includes('=')) {
    return 'failure'
  }

  // 3. If name’s length is 0 and value’s length is 0, then return failure.
  if (name.length === 0 && value.length === 0) {
    return 'failure'
  }

  // 4. Let encodedName be the result of UTF-8 encoding name.
  const encodedName = Buffer.from(name, 'utf-8').toString()

  // 5. Let encodedValue be the result of UTF-8 encoding value.
  const encodedValue = Buffer.from(value, 'utf-8').toString()

  // 6. If the byte sequence length of encodedName plus the byte sequence length
  //    of encodedValue is greater than the maximum name/value pair size, then
  //    return failure.
  if (encodedName.length + encodedValue.length > maxNameValuePairSize) {
    return 'failure'
  }

  // 7. Let host be url’s host
  // TODO

  // 8. Let attributes be a new list.
  const attributes = []

  // 9. If domain is not null, then run these steps:
  if (domain != null && typeof domain === 'string') {
    // 1. If domain starts with U+002D (.), then return failure.
    if (domain[0] === '.') {
      return 'failure'
    }

    // 2. If host does not equal domain and host does not end with U+002D (.)
    //    followed by domain, then return failure.
    // TODO (see step 7)

    // 3. Let encodedDomain be the result of UTF-8 encoding domain.
    const encodedDomain = Buffer.from(domain, 'utf-8').toString()

    // 4. If the byte sequence length of encodedDomain is greater than the maximum
    //    attribute value size, then return failure.
    if (encodedDomain.length > maxAttributeValueSize) {
      return 'failure'
    }

    // 5. Append `Domain`/encodedDomain to attributes.
    attributes.push({ Domain: encodedDomain })
  }

  // 10. If expires is given, then append `Expires`/expires (date serialized) to
  //     attributes.
  if (expires != null && typeof expires === 'number') {
    attributes.push({ Expires: expires })
  }

  // 11. If path is not null, then run these steps:
  if (path != null && typeof path === 'string') {
    // 1. If path does not start with U+002F (/), then return failure.
    if (path[0] !== '/') {
      return 'failure'
    }

    // 2. If path does not end with U+002F (/), then append U+002F (/) to path.
    if (path[path.length - 1] !== '/') {
      path += '/'
    }

    // 3. Let encodedPath be the result of UTF-8 encoding path.
    const encodedPath = Buffer.from(path, 'utf-8').toString()

    // 4. If the byte sequence length of encodedPath is greater than the maximum
    //    attribute value size, then return failure.
    if (encodedPath.length > maxAttributeValueSize) {
      return 'failure'
    }

    // 5. Append `Path`/encodedPath to attributes.
    attributes.push({ Path: encodedPath })
  }

  // 12. Append `Secure`/`` to attributes.
  attributes.push({ Secure: '' })

  // 13. Switch on sameSite:
  switch (sameSite) {
    case 'none': {
      attributes.push({ SameSite: 'None' })
      break
    }
    case 'lax': {
      attributes.push({ SameSite: 'Lax' })
      break
    }
    case 'strict':
    default: {
      attributes.push({ SameSite: 'Strict' })
    }
  }

  // 14. Perform the steps defined in Cookies: HTTP State Management Mechanism
  //     §Storage Model for when the user agent "receives a cookie" with url as
  //     request-uri, encodedName as cookie-name, encodedValue as cookie-value,
  //     and attributes as cookie-attribute-list.
  // TODO

  // 15. Return success.
  return 'success'
}

/**
 * @see https://wicg.github.io/cookie-store/#delete-a-cookie
 * @param {string} name
 * @param {object[]} cookieStore
 */
function deleteCookie (name, cookieStore) {
  // Note: the spec calls for us to "expire" the cookie, but there is
  // no mechanism for deleting expired cookies.
  const idx = cookieStore.findIndex((cookie) => cookie.cookieName === name)

  if (idx !== -1) {
    cookieStore.splice(idx, 1)
  }

  return 'success'
}

module.exports = {
  queryCookies,
  setCookie,
  deleteCookie
}
