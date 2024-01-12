'use strict'

const { pipeline } = require('node:stream')
const {
  kEvents,
  kState
} = require('./symbols')
const { fetch } = require('../fetch')
const { getGlobalOrigin } = require('../fetch/global')
const { webidl } = require('../fetch/webidl')
const { CONNECTING, OPEN, CLOSED, mimeType, defaultReconnectionTime } = require('./constants')
const { EventSourceStream } = require('./eventsource-stream')
const { parseMIMEType } = require('../fetch/dataURL')
const { MessageEvent, OpenEvent, ErrorEvent } = require('./events')

let experimentalWarned = false

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
  constructor (url, eventSourceInitDict = {}) {
    super()

    webidl.argumentLengthCheck(arguments, 1, { header: 'EventSource constructor' })

    if (!experimentalWarned) {
      experimentalWarned = true
      process.emitWarning('EventSource is experimental, expect them to change at any time.', {
        code: 'UNDICI-ES'
      })
    }

    url = webidl.converters.USVString(url)
    eventSourceInitDict = webidl.converters.EventSourceInitDict(eventSourceInitDict)

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
        {
          if (!this.#connection.headers.has('Location')) {
            this.close()
            this.dispatchEvent(new ErrorEvent('error', { message: 'Missing Location header' }))
            return
          }

          let urlRecord
          try {
            urlRecord = new URL(this.#connection.headers.get('Location'), this[kState].origin)
          } catch (e) {
            // If urlRecord is failure, then throw a "SyntaxError" DOMException.
            throw new DOMException(e, 'SyntaxError')
          }
          this.#url = urlRecord.href
          this[kState].origin = urlRecord.origin
          this.#connect()
          return
        }
        case 204: // 204 No Content
        {
          // Clients will reconnect if the connection is closed; a client can be told to stop reconnecting
          // using the HTTP 204 No Content response code.
          this.close()
          this.dispatchEvent(new ErrorEvent('error', { message: 'Closing connection as 204 No Content was received' }))
          return }
        case 200: // 200 OK
        {
          const contentType = this.#connection.headers.get('content-type', true)
          const mimeType = contentType !== null ? parseMIMEType(contentType) : 'failure'

          /**
           * The event stream format's MIME type is text/event-stream.
           * @see https://html.spec.whatwg.org/multipage/server-sent-events.html#parsing-an-event-stream
           */
          if (mimeType === 'failure' || mimeType.essence !== 'text/event-stream') {
            this.close()
            this.dispatchEvent(new ErrorEvent('error', { message: 'Content-Type is not text/event-stream' }))
            return
          }
          break
        }
        default:
        {
          this.close()
          this.dispatchEvent(new ErrorEvent('error', { message: 'Unsupported status code' }))
          return
        }
      }

      if (this.#connection === null) {
        this.close()
        this.dispatchEvent(new ErrorEvent('error', { message: 'Could not establish connection' }))
        return
      }

      const eventSourceStream = new EventSourceStream({
        eventSourceState: this[kState],
        push: (eventPayload) => {
          this.dispatchEvent(new MessageEvent(
            eventPayload.type,
            eventPayload.payload
          ))
        }
      })

      pipeline(this.#connection.body,
        eventSourceStream,
        (error) => {
          if (error) {
            this.dispatchEvent(new ErrorEvent('error', { error }))
            this.close()
          }
        })

      this.dispatchEvent(new OpenEvent('open'))
      this.#readyState = OPEN
    } catch (error) {
      if (error.name === 'AbortError') {
        return
      }
      this.dispatchEvent(new ErrorEvent('error', { error }))

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

webidl.converters.EventSourceInitDict = webidl.dictionaryConverter([
  { key: 'withCredentials', converter: webidl.converters.boolean, defaultValue: false }
])

module.exports = {
  EventSource
}
