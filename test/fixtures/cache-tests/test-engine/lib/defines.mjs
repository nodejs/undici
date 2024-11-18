export const noBodyStatus = new Set([204, 304])

export const dateHeaders = new Set(['date', 'expires', 'last-modified', 'if-modified-since', 'if-unmodified-since'])

export const locationHeaders = new Set(['location', 'content-location'])

// https://fetch.spec.whatwg.org/#forbidden-response-header-name
export const forbiddenResponseHeaders = new Set(['set-cookie', 'set-cookie2'])

// headers to skip when checking response_headers (not expected)
export const skipResponseHeaders = new Set(['date'])

// colours for console
export const RED = '\x1b[31m'
export const GREEN = '\x1b[32m'
export const BLUE = '\x1b[34m'
export const NC = '\x1b[0m'

// mime types for server
export const mimeTypes = {
  html: 'text/html',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  js: 'application/javascript',
  mjs: 'application/javascript',
  css: 'text/css'
}
