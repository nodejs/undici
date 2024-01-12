'use strict'

const { pipeline } = require('node:stream')
const {
  kEvents,
  kState
} = require('./symbols')
const { getGlobalOrigin } = require('../fetch/global')
const { webidl } = require('../fetch/webidl')
const { CONNECTING, OPEN, CLOSED, mimeType, defaultReconnectionTime } = require('./constants')
const { EventSourceStream } = require('./eventsource-stream')

/**
 * @typedef {object} EventSourceInit
 * @property {boolean} [withCredentials] indicates whether the request
 * should include credentials.
 */

/**
 * The EventSource interface is used to receive server-sent events. It
 * connects to a server over HTTP and receives events in text/event-stream
 * format without closing the connection.
 * @extends {EventTarget}
 * @see https://developer.mozilla.org/en-US/docs/Web/API/EventSource
 * @api public
 */
class EventSource extends EventTarget {
  #url = null
  #withCredentials = false
  #readyState = CONNECTING
  #lastEventId = ''
  #connection = null
  #reconnectionTimer = null
  #controller = new AbortController()

  /**
   * Creates a new EventSource object.
   * @param {string} url
   * @param {EventSourceInit} [eventSourceInitDict]
   */
  constructor (url, eventSourceInitDict) {
    super()

    webidl.argumentLengthCheck(arguments, 1, { header: 'EventSource constructor' })

    // 1. Let baseURL be this's relevant settings object's API base URL.
    const baseURL = getGlobalOrigin()

    // 2. Let urlRecord be the result of applying the URL parser to url with baseURL.
    let urlRecord

    try {
      urlRecord = new URL(url, baseURL)
    } catch (e) {
      // 3. If urlRecord is failure, then throw a "SyntaxError" DOMException.
      throw new DOMException(e, 'SyntaxError')
    }

    // 4. Set this's url to urlRecord.
    this.#url = urlRecord.href

    this[kState] = {
      lastEventId: '',
      origin: '',
      reconnectionTime: defaultReconnectionTime
    }

    this[kEvents] = {
      message: null,
      error: null,
      open: null
    }

    this[kState].origin = urlRecord.origin

    if (eventSourceInitDict) {
      if (eventSourceInitDict.withCredentials) {
        this.#withCredentials = eventSourceInitDict.withCredentials
      }
    }

    this.#connect()
  }

  /**
   * Returns the state of this EventSource object's connection. It can have the
   * values described below.
   * @returns {0|1|2}
   * @readonly
   */
  get readyState () {
    return this.#readyState
  }

  /**
   * Returns the URL providing the event stream.
   * @readonly
   * @returns {string}
   */
  get url () {
    return this.#url
  }

  /**
   * Returns a boolean indicating whether the EventSource object was
   * instantiated with CORS credentials set (true), or not (false, the default).
   */
  get withCredentials () {
    return this.#withCredentials
  }

  async #connect () {
    if (this.#readyState === CLOSED) return

    this.#readyState = CONNECTING
    this.#connection = null

    /**
     * @type {RequestInit}
     */
    const options = {
      method: 'GET',
      redirect: 'manual',
      keepalive: true,
      headers: {
        Accept: mimeType,
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      },
      signal: this.#controller.signal
    }

    if (this.#lastEventId) {
      options.headers['Last-Event-ID'] = this.#lastEventId
    }

    options.credentials = this.#withCredentials ? 'include' : 'omit'

    try {
      this.#connection = await fetch(this.#url, options)

      // Handle HTTP redirects
      // https://html.spec.whatwg.org/multipage/server-sent-events.html#server-sent-events-intro
      switch (this.#connection.status) {
        // Redirecting status codes
        case 301: // 301 Moved Permanently
        case 302: // 302 Found
        case 307: // 307 Temporary Redirect
        case 308: // 308 Permanent Redirect
          if (!this.#connection.headers.has('Location')) {
            this.close()
            this.dispatchEvent(new Event('error'))
            return
          }
          this.#url = new URL(this.#connection.headers.get('Location'), new URL(this.#url).origin).href
          this[kState].origin = new URL(this.#url).origin
          this.#connect()
          return
        case 204: // 204 No Content
          // Clients will reconnect if the connection is closed; a client can be told to stop reconnecting
          // using the HTTP 204 No Content response code.
          this.close()
          this.dispatchEvent(new Event('error'))
          return
        case 200:
          if (this.#connection.headers.get('Content-Type') !== mimeType) {
            this.close()
            this.dispatchEvent(new Event('error'))
            return
          }
          break
        default:
          this.close()
          this.dispatchEvent(new Event('error'))
          return
      }

      if (this.#connection === null) {
        this.close()
        this.dispatchEvent(new Event('error'))
        return
      }

      pipeline(this.#connection.body,
        new EventSourceStream({
          eventSourceState: this[kState],
          push: this.dispatchEvent
        }),
        (err) => {
          if (err) {
            this.dispatchEvent(new Event('error'))
            this.close()
          }
        })

      this.dispatchEvent(new Event('open'))
      this.#readyState = OPEN
    } catch (error) {
      if (error.name === 'AbortError') {
        return
      }
      this.dispatchEvent(new Event('error'))

      // Always set to CONNECTING as the readyState could be OPEN
      this.#readyState = CONNECTING
      this.#connection = null

      this.#reconnectionTimer = setTimeout(() => {
        this.#connect()
      }, this[kState].reconnectionTime).unref()
    }
  }

  /**
   * Closes the connection, if any, and sets the readyState attribute to
   * CLOSED.
   */
  close () {
    webidl.brandCheck(this, EventSource)

    if (this.#readyState === CLOSED) return
    clearTimeout(this.#reconnectionTimer)
    this.#controller.abort()
    if (this.#connection) {
      this.#connection = null
    }
    this.#readyState = CLOSED
  }

  get onopen () {
    webidl.brandCheck(this, EventSource)

    return this[kEvents].open
  }

  set onopen (fn) {
    webidl.brandCheck(this, EventSource)

    if (this[kEvents].open) {
      this.removeEventListener('open', this[kEvents].open)
    }

    if (typeof fn === 'function') {
      this[kEvents].open = fn
      this.addEventListener('open', fn)
    } else {
      this[kEvents].open = null
    }
  }

  get onmessage () {
    webidl.brandCheck(this, EventSource)

    return this[kEvents].message
  }

  set onmessage (fn) {
    webidl.brandCheck(this, EventSource)

    if (this[kEvents].message) {
      this.removeEventListener('message', this[kEvents].message)
    }

    if (typeof fn === 'function') {
      this[kEvents].message = fn
      this.addEventListener('message', fn)
    } else {
      this[kEvents].message = null
    }
  }

  get onerror () {
    webidl.brandCheck(this, EventSource)

    return this[kEvents].error
  }

  set onerror (fn) {
    webidl.brandCheck(this, EventSource)

    if (this[kEvents].error) {
      this.removeEventListener('error', this[kEvents].error)
    }

    if (typeof fn === 'function') {
      this[kEvents].error = fn
      this.addEventListener('error', fn)
    } else {
      this[kEvents].error = null
    }
  }
}

Object.defineProperties(EventSource, {
  CONNECTING: {
    __proto__: null,
    configurable: false,
    enumerable: true,
    value: CONNECTING,
    writable: false
  },
  OPEN: {
    __proto__: null,
    configurable: false,
    enumerable: true,
    value: OPEN,
    writable: false
  },
  CLOSED: {
    __proto__: null,
    configurable: false,
    enumerable: true,
    value: CLOSED,
    writable: false
  }
})

EventSource.prototype.CONNECTING = CONNECTING
EventSource.prototype.OPEN = OPEN
EventSource.prototype.CLOSED = CLOSED

module.exports = {
  EventSource
}
