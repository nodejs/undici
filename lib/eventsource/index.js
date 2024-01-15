'use strict'

const { pipeline } = require('node:stream')
const { mainFetch, Fetch, finalizeAndReportTiming } = require('../fetch')
const { HeadersList } = require('../fetch/headers')
const { makeRequest } = require('../fetch/request')
const { getGlobalOrigin } = require('../fetch/global')
const { webidl } = require('../fetch/webidl')
const { CONNECTING, OPEN, CLOSED, defaultReconnectionTime, ANONYMOUS, USE_CREDENTIALS } = require('./constants')
const { EventSourceStream } = require('./eventsource-stream')
const { parseMIMEType } = require('../fetch/dataURL')
const { MessageEvent, OpenEvent, ErrorEvent } = require('./events')
const { isNetworkError } = require('../fetch/response')
const { getGlobalDispatcher } = require('../global')
const { createOpaqueTimingInfo } = require('../fetch/util')

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
 * @see https://html.spec.whatwg.org/multipage/server-sent-events.html#server-sent-events
 * @api public
 */
class EventSource extends EventTarget {
  #events = {
    open: null,
    error: null,
    message: null
  }

  #url = null
  #withCredentials = false
  #readyState = CONNECTING
  #lastEventId = ''
  #reconnectionTimer = null
  #request = null
  #controller = null
  #settings = null

  /**
   * Creates a new EventSource object.
   * @param {string} url
   * @param {EventSourceInit} [eventSourceInitDict]
   * @see https://html.spec.whatwg.org/multipage/server-sent-events.html#the-eventsource-interface
   */
  constructor (url, eventSourceInitDict = {}) {
    // 1. Let ev be a new EventSource object.
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

    // 2. Let settings be ev's relevant settings object.
    this.#settings = {
      lastEventId: '',
      origin: '',
      reconnectionTime: defaultReconnectionTime
    }

    // 1. Let baseURL be this's relevant settings object's API base URL.
    const baseURL = getGlobalOrigin()

    // 2. Let urlRecord be the result of applying the URL parser to url with baseURL.
    let urlRecord

    try {
      // 3. Let urlRecord be the result of encoding-parsing a URL given url, relative to settings.
      urlRecord = new URL(url, baseURL)
    } catch (e) {
      // 4. If urlRecord is failure, then throw a "SyntaxError" DOMException.
      throw new DOMException(e, 'SyntaxError')
    }

    // 5. Set ev's url to urlRecord.
    this.#url = urlRecord.href

    // 6. Let corsAttributeState be Anonymous.
    let corsAttributeState = ANONYMOUS

    // 7. If the value of eventSourceInitDict's withCredentials member is true,
    // then set corsAttributeState to Use Credentials and set ev's
    // withCredentials attribute to true.
    if (eventSourceInitDict.withCredentials) {
      corsAttributeState = USE_CREDENTIALS
      this.#withCredentials = true
    }

    // 8. Let request be the result of creating a potential-CORS request given
    // urlRecord, the empty string, and corsAttributeState.
    const initRequest = {
      redirect: 'follow',
      keepalive: true,
      // @see https://html.spec.whatwg.org/multipage/urls-and-fetching.html#cors-settings-attributes
      mode: 'cors',
      credentials: corsAttributeState === 'anonymous'
        ? 'same-origin'
        : 'omit',
      referrer: 'no-referrer',
      referrerPolicy: 'no-referrer'
    }

    // 9. Set request's client to settings.

    // 10. User agents may set (`Accept`, `text/event-stream`) in request's header list.
    initRequest.headers = new HeadersList()
    initRequest.headers.set('accept', 'text/event-stream', true)

    // 11. Set request's cache mode to "no-store".
    initRequest.cache = 'no-store'

    // 12. Set request's initiator type to "other".
    initRequest.initiator = 'other'

    initRequest.urlList = [new URL(this.#url)]

    // 13. Set ev's request to request.
    this.#request = makeRequest(initRequest)

    this.#request.headersList = initRequest.headers

    this.#events = {
      message: null,
      error: null,
      open: null
    }

    this.#settings.origin = urlRecord.origin

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

    const fetchParam = {
      request: this.#request
    }

    // 12. Set request's initiator type to "other".
    fetchParam.processResponseEndOfBody = (response) =>
      finalizeAndReportTiming(response, 'other')

    if (this.#lastEventId) {
      fetchParam.request.headers.set('last-event-id', this.#lastEventId, true)
    }

    // 14. Let processEventSourceEndOfBody given response res be the following step: if res is not a network error, then reestablish the connection.
    const processEventSourceEndOfBody = (response) => {
      if (isNetworkError(response)) {
        this.dispatchEvent(new ErrorEvent('error', { error: response.error }))
        this.close()
      }

      this.#connect()
    }

    // 15. Fetch request, with processResponseEndOfBody set to processEventSourceEndOfBody...
    fetchParam.processResponseEndOfBody = processEventSourceEndOfBody

    // and processResponse set to the following steps given response res:

    fetchParam.processResponse = (response) => {
      // 1. If res is an aborted network error, then fail the connection.

      if (isNetworkError(response)) {
        // 1. When a user agent is to fail the connection, the user agent
        // must queue a task which, if the readyState attribute is set to a
        // value other than CLOSED, sets the readyState attribute to CLOSED
        // and fires an event named error at the EventSource object. Once the
        // user agent has failed the connection, it does not attempt to
        // reconnect.
        if (response.aborted) {
          this.close()
          this.dispatchEvent(new ErrorEvent('error', { error: response.error }))
          return
          // 2. Otherwise, if res is a network error, then reestablish the
          // connection, unless the user agent knows that to be futile, in
          // which case the user agent may fail the connection.
        } else {
          this.#reconnect()
          return
        }
        // 3. Otherwise, if res's status is not 200, [...], then fail the
        // connection.
      } else if (response.status !== 200) {
        let message = `Unexpected status code: ${response.status}`

        if (response.status === 204) {
          message = 'No content'
        }
        this.close()
        this.dispatchEvent(new ErrorEvent('error', { message }))
        return
      }

      // 3. Otherwise, [...] if res's
      // `Content-Type` is not `text/event-stream`, then fail the
      // connection.

      const contentType = response.headersList.get('content-type', true)
      const mimeType = contentType !== null ? parseMIMEType(contentType) : 'failure'
      if (mimeType === 'failure' || mimeType.essence !== 'text/event-stream') {
        this.close()
        this.dispatchEvent(new ErrorEvent('error', { error: 'Invalid content-type' }))
        return
      }
      // 4. Otherwise, announce the connection and interpret res's body
      // line by line.

      // When a user agent is to announce the connection, the user agent
      // must queue a task which, if the readyState attribute is set to a
      // value other than CLOSED, sets the readyState attribute to OPEN
      // and fires an event named open at the EventSource object.
      // @see https://html.spec.whatwg.org/multipage/server-sent-events.html#sse-processing-model
      this.#readyState = OPEN
      this.dispatchEvent(new OpenEvent('open', {}))

      const eventSourceStream = new EventSourceStream({
        eventSourceState: this.#settings,
        push: (eventPayload) => {
          this.dispatchEvent(new MessageEvent(
            eventPayload.type,
            eventPayload.payload
          ))
        }
      })

      pipeline(response.body.stream,
        eventSourceStream,
        (error) => {
          if (
            error &&
            error.aborted === false
          ) {
            this.close()
            this.dispatchEvent(new ErrorEvent('error', { error }))
          }
        })
    }

    fetchParam.timingInfo = createOpaqueTimingInfo({})

    fetchParam.controller = new Fetch(getGlobalDispatcher())

    this.#controller = fetchParam.controller

    await mainFetch(fetchParam)
  }

  #reconnect () {
    // TODO: implement reestablish
    this.dispatchEvent(new ErrorEvent('error'))
    this.close()
  }

  /**
   * Closes the connection, if any, and sets the readyState attribute to
   * CLOSED.
   */
  close () {
    webidl.brandCheck(this, EventSource)

    if (this.#readyState === CLOSED) return
    this.#readyState = CLOSED
    clearTimeout(this.#reconnectionTimer)
    this.#controller.abort()

    if (this.#request) {
      this.#request = null
    }
  }

  get onopen () {
    webidl.brandCheck(this, EventSource)

    return this.#events.open
  }

  set onopen (fn) {
    webidl.brandCheck(this, EventSource)

    if (this.#events.open) {
      this.removeEventListener('open', this.#events.open)
    }

    if (typeof fn === 'function') {
      this.#events.open = fn
      this.addEventListener('open', fn)
    } else {
      this.#events.open = null
    }
  }

  get onmessage () {
    webidl.brandCheck(this, EventSource)

    return this.#events.message
  }

  set onmessage (fn) {
    webidl.brandCheck(this, EventSource)

    if (this.#events.message) {
      this.removeEventListener('message', this.#events.message)
    }

    if (typeof fn === 'function') {
      this.#events.message = fn
      this.addEventListener('message', fn)
    } else {
      this.#events.message = null
    }
  }

  get onerror () {
    webidl.brandCheck(this, EventSource)

    return this.#events.error
  }

  set onerror (fn) {
    webidl.brandCheck(this, EventSource)

    if (this.#events.error) {
      this.removeEventListener('error', this.#events.error)
    }

    if (typeof fn === 'function') {
      this.#events.error = fn
      this.addEventListener('error', fn)
    } else {
      this.#events.error = null
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
