'use strict'

const { readFile } = require('node:fs/promises')
const { fileURLToPath } = require('node:url')

function createAbortController () {
  let aborted = false
  let reason = null

  return {
    resume () {},
    pause () {},
    get paused () {
      return false
    },
    get aborted () {
      return aborted
    },
    get reason () {
      return reason
    },
    abort (err) {
      if (aborted) {
        return
      }

      aborted = true
      reason = err ?? new Error('Request aborted')
    }
  }
}

function toFileURL (opts) {
  if (opts == null || typeof opts !== 'object') {
    return null
  }

  if (opts.origin != null) {
    try {
      const origin = opts.origin instanceof URL ? opts.origin : new URL(String(opts.origin))
      if (origin.protocol === 'file:') {
        return new URL(opts.path ?? '', origin)
      }
    } catch {
      // Ignore invalid origin and try path.
    }
  }

  if (typeof opts.path === 'string' && opts.path.startsWith('file:')) {
    try {
      return new URL(opts.path)
    } catch {
      return null
    }
  }

  return null
}

function toRawHeaders (headers) {
  const rawHeaders = []
  for (const [name, value] of Object.entries(headers)) {
    rawHeaders.push(Buffer.from(name), Buffer.from(String(value)))
  }
  return rawHeaders
}

/**
 * @param {import('../../types/interceptors').FileInterceptorOpts} [opts]
 */
function createFileInterceptor (opts = {}) {
  const {
    allow = () => false,
    contentType,
    read = readFile,
    resolvePath = fileURLToPath
  } = opts

  if (typeof allow !== 'function') {
    throw new TypeError('file interceptor: opts.allow must be a function')
  }

  if (contentType != null && typeof contentType !== 'function') {
    throw new TypeError('file interceptor: opts.contentType must be a function')
  }

  if (typeof read !== 'function') {
    throw new TypeError('file interceptor: opts.read must be a function')
  }

  if (typeof resolvePath !== 'function') {
    throw new TypeError('file interceptor: opts.resolvePath must be a function')
  }

  return dispatch => {
    return function fileInterceptorDispatch (dispatchOpts, handler) {
      const fileURL = toFileURL(dispatchOpts)
      if (!fileURL) {
        return dispatch(dispatchOpts, handler)
      }

      const controller = createAbortController()

      try {
        handler.onConnect?.((err) => controller.abort(err))
        handler.onRequestStart?.(controller, null)
      } catch (err) {
        handler.onResponseError?.(controller, err)
        handler.onError?.(err)
        return true
      }

      if (controller.aborted) {
        return true
      }

      ;(async () => {
        try {
          const method = String(dispatchOpts.method || 'GET').toUpperCase()
          if (method !== 'GET' && method !== 'HEAD') {
            throw new TypeError(`Method ${method} is not supported for file URLs.`)
          }

          const path = resolvePath(fileURL)
          const allowed = await allow({ path, url: fileURL, method, opts: dispatchOpts })
          if (!allowed) {
            throw new Error(`Access to ${fileURL.href} is not allowed by file interceptor.`)
          }

          const fileContent = await read(path)
          const chunk = Buffer.isBuffer(fileContent) ? fileContent : Buffer.from(fileContent)

          const headers = {
            'content-length': String(chunk.length)
          }

          if (contentType) {
            const value = await contentType({ path, url: fileURL, method, opts: dispatchOpts })
            if (typeof value === 'string' && value.length > 0) {
              headers['content-type'] = value
            }
          }

          if (typeof handler.onResponseStart === 'function') {
            handler.onResponseStart(controller, 200, headers, 'OK')
          } else {
            if (typeof handler.onHeaders === 'function') {
              handler.onHeaders(200, toRawHeaders(headers), () => {}, 'OK')
            }
          }

          if (!controller.aborted && method !== 'HEAD') {
            if (typeof handler.onResponseData === 'function') {
              handler.onResponseData(controller, chunk)
            } else {
              handler.onData?.(chunk)
            }
          }

          if (!controller.aborted) {
            if (typeof handler.onResponseEnd === 'function') {
              handler.onResponseEnd(controller, {})
            } else {
              handler.onComplete?.([])
            }
          }
        } catch (err) {
          if (typeof handler.onResponseError === 'function') {
            handler.onResponseError(controller, err)
          } else {
            handler.onError?.(err)
          }
        }
      })()

      return true
    }
  }
}

module.exports = createFileInterceptor
