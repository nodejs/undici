const assert = require('assert')

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

  let sameSite = ''
  // 7. Switch on cookie’s same-site-flag:
  if (['None', 'Strict', 'Lax'].includes(cookie.SameSite)) {
    sameSite = cookie.SameSite
  }

  // 8. Return «[ "name" → name, "value" → value, "domain" → domain, "path" → path,
  //    "expires" → expires, "secure" → secure, "sameSite" → sameSite ]»
  return { name, value, domain, path, expires, secure, sameSite }
}

module.exports = {
  queryCookies
}
