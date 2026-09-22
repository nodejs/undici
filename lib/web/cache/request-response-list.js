'use strict'

const { HeadersList } = require('../fetch/headers')
const { filterResponse } = require('../fetch/response')
const { extractBody } = require('../fetch/body')
const { environmentSettingsObject, readAllBytes } = require('../fetch/util')

/**
 * @type {import('node:sqlite').DatabaseSync}
 */
let DatabaseSync

/**
 * @see https://w3c.github.io/ServiceWorker/#dfn-request-response-list
 *
 * Every change to the list is written to storage. Reading the list returns new request and
 * response objects, and each response's body is read from the stored bytes.
 */
class RequestResponseList {
  /**
   * @type {import('node:sqlite').DatabaseSync}
   */
  #db

  /**
   * @type {import('node:sqlite').StatementSync}
   */
  #appendQuery

  /**
   * @type {import('node:sqlite').StatementSync}
   */
  #setBodyQuery

  /**
   * @type {import('node:sqlite').StatementSync}
   */
  #removeQuery

  /**
   * @type {import('node:sqlite').StatementSync}
   */
  #clearQuery

  /**
   * @type {import('node:sqlite').StatementSync}
   */
  #itemsQuery

  /**
   * Bodies whose stream is being read into storage.
   * @type {WeakMap<object, Promise<Uint8Array>>}
   */
  #bodyReads = new WeakMap()

  /**
   * Stored items whose body is still being read, by id.
   * @type {Map<number, Promise<Uint8Array>>}
   */
  #pendingBodies = new Map()

  /**
   * @param {string} [location] where the list is stored, see `new DatabaseSync(location)`
   */
  constructor (location = ':memory:') {
    if (!DatabaseSync) {
      DatabaseSync = require('node:sqlite').DatabaseSync
    }

    this.#db = new DatabaseSync(location)

    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS requestResponseList (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request TEXT NOT NULL,
        response TEXT NOT NULL,
        body BLOB
      )
    `)

    this.#appendQuery = this.#db.prepare('INSERT INTO requestResponseList (request, response, body) VALUES (?, ?, ?)')
    this.#setBodyQuery = this.#db.prepare('UPDATE requestResponseList SET body = ? WHERE id = ?')
    this.#removeQuery = this.#db.prepare('DELETE FROM requestResponseList WHERE id = ?')
    this.#clearQuery = this.#db.prepare('DELETE FROM requestResponseList')
    this.#itemsQuery = this.#db.prepare('SELECT id, request, response, body FROM requestResponseList ORDER BY id')
  }

  /**
   * @see https://infra.spec.whatwg.org/#list-iterate
   * @returns {Generator<[any, any]>}
   */
  * [Symbol.iterator] () {
    for (const row of this.#itemsQuery.all()) {
      yield this.#toItem(row)
    }
  }

  /**
   * @see https://infra.spec.whatwg.org/#list-append
   * @param {[any, any]} requestResponse
   */
  append ([request, response]) {
    const internalResponse = response.internalResponse ?? response
    const bytes = bodyBytes(internalResponse.body)

    const { lastInsertRowid: id } = this.#appendQuery.run(
      JSON.stringify(encode(request)),
      JSON.stringify({
        filter: response.internalResponse ? response.type : null,
        internalResponse: encode({ ...internalResponse, body: null })
      }),
      bytes ?? null
    )

    if (bytes !== undefined) {
      return
    }

    // The body's bytes are only available by reading its stream, so they are written once it has been read.
    const read = this.#readBody(internalResponse.body)

    this.#pendingBodies.set(id, read)

    read.then((bytes) => {
      this.#setBodyQuery.run(bytes, id)
    }, () => {
      this.#removeQuery.run(id)
    }).finally(() => {
      this.#pendingBodies.delete(id)
    })
  }

  /**
   * Starts writing response's body to storage while it is received, so that its bytes are stored by the
   * time response is appended.
   * @param {any} response
   */
  writeBody (response) {
    const { body } = response.internalResponse ?? response

    if (body != null && bodyBytes(body) === undefined) {
      this.#readBody(body).catch(() => {})
    }
  }

  /**
   * Removes the item whose value matches requestResponse.
   * @see https://infra.spec.whatwg.org/#list-remove
   * @param {[any, any]} requestResponse
   */
  remove (requestResponse) {
    const value = valueOf(requestResponse)

    for (const row of this.#itemsQuery.all()) {
      if (valueOf(this.#toItem(row)) === value) {
        this.#removeQuery.run(row.id)
        return
      }
    }
  }

  /**
   * Removes all the items.
   * @see https://infra.spec.whatwg.org/#list-empty
   */
  clear () {
    this.#clearQuery.run()
  }

  /**
   * @param {{ stream: ReadableStream, source: any }} body
   * @returns {Promise<Uint8Array>}
   */
  #readBody (body) {
    let read = this.#bodyReads.get(body)

    if (read === undefined) {
      read = new Promise((resolve, reject) => {
        readAllBytes(body.stream.getReader(), (bytes) => {
          body.source = bytes
          resolve(bytes)
        }, reject)
      })

      this.#bodyReads.set(body, read)
    }

    return read
  }

  /**
   * @param {{ id: number, request: string, response: string, body: Uint8Array | null }} row
   * @returns {[any, any]}
   */
  #toItem (row) {
    const request = decode(JSON.parse(row.request))
    request.url = request.urlList[0]

    const { filter, internalResponse } = JSON.parse(row.response)
    const response = decode(internalResponse)
    const pendingBody = this.#pendingBodies.get(row.id)

    if (pendingBody !== undefined) {
      response.body = extractBody((async function * () {
        yield await pendingBody
      })())[0]
    } else {
      response.body = row.body === null ? null : extractBody(row.body)[0]
    }

    return [request, filter === null ? response : filterResponse(response, filter)]
  }
}

/**
 * The value of a request/response pair, as a string that is equal for pairs with equal values.
 * @param {[any, any]} requestResponse
 * @returns {string}
 */
function valueOf ([request, response]) {
  const bytes = bodyBytes(response.body)

  return JSON.stringify([
    encode({ ...request }),
    encode({ ...response, body: null }),
    bytes === undefined ? 'unread' : bytes === null ? null : Buffer.from(bytes).toString('base64')
  ])
}

/**
 * @param {{ source: any } | null} body
 * @returns {Uint8Array | null | undefined} undefined when the bytes can only be read from the body's stream
 */
function bodyBytes (body) {
  if (body == null) {
    return null
  }

  const { source } = body

  if (typeof source === 'string') {
    return Buffer.from(source)
  }

  if (ArrayBuffer.isView(source)) {
    return new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
  }

  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source)
  }

  return undefined
}

/**
 * @param {any} value
 * @returns {any} a JSON-compatible representation of value
 */
function encode (value) {
  if (value === undefined) {
    return { $: 'undefined' }
  }

  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (value === environmentSettingsObject.settingsObject) {
    return { $: 'settingsObject' }
  }

  if (value instanceof URL) {
    return { $: 'URL', href: value.href }
  }

  if (value instanceof HeadersList) {
    return { $: 'HeadersList', entries: value.entriesList }
  }

  if (value instanceof DOMException) {
    return { $: 'DOMException', name: value.name, message: value.message }
  }

  if (value instanceof Error) {
    return { $: 'Error', name: value.name, message: value.message }
  }

  if (Array.isArray(value)) {
    return { $: 'Array', items: value.map(encode) }
  }

  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value)

    if (prototype === Object.prototype || prototype === null) {
      const entries = {}

      for (const key of Object.keys(value)) {
        entries[key] = encode(value[key])
      }

      return { $: 'Object', entries }
    }
  }

  throw new TypeError(`Cannot store ${Object.prototype.toString.call(value)} in a request response list.`)
}

/**
 * @param {any} value the result of encode()
 * @returns {any}
 */
function decode (value) {
  if (value === null || typeof value !== 'object') {
    return value
  }

  switch (value.$) {
    case 'undefined':
      return undefined
    case 'settingsObject':
      return environmentSettingsObject.settingsObject
    case 'URL':
      return new URL(value.href)
    case 'HeadersList': {
      const headersList = new HeadersList()

      for (const [name, headerValue] of value.entries) {
        headersList.append(name, headerValue, false)
      }

      return headersList
    }
    case 'DOMException':
      return new DOMException(value.message, value.name)
    case 'Error': {
      const ErrorConstructor = globalThis[value.name]

      if (ErrorConstructor === Error || ErrorConstructor?.prototype instanceof Error) {
        return new ErrorConstructor(value.message)
      }

      const error = new Error(value.message)
      error.name = value.name
      return error
    }
    case 'Array':
      return value.items.map(decode)
    case 'Object': {
      const object = {}

      for (const key of Object.keys(value.entries)) {
        object[key] = decode(value.entries[key])
      }

      return object
    }
  }

  throw new TypeError(`Unknown stored value ${JSON.stringify(value)}.`)
}

module.exports = {
  RequestResponseList
}
