'use strict'

/** @type {undefined|URL} */
let origin

function getGlobalOrigin () {
  return origin
}

function setGlobalOrigin (newOrigin) {
  if (
    newOrigin !== undefined &&
    typeof newOrigin !== 'string' &&
    !(newOrigin instanceof URL)
  ) {
    throw new Error('Invalid base url')
  }

  if (newOrigin === undefined) {
    origin = newOrigin
    return
  }

  const parsedURL = new URL(newOrigin)

  if (parsedURL.protocol !== 'http:' && parsedURL.protocol !== 'https:') {
    throw new TypeError(`Only http & https urls are allowed, received ${parsedURL.protocol}`)
  }

  origin = parsedURL
}

module.exports = {
  getGlobalOrigin,
  setGlobalOrigin
}
