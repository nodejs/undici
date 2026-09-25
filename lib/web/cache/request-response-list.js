'use strict'

const { HeadersList } = require('../fetch/headers')
const { makeRequest } = require('../fetch/request')
const { filterResponse, makeResponse } = require('../fetch/response')
const { extractBody, cloneBody } = require('../fetch/body')
const { readAllBytes } = require('../fetch/util')
const { types } = require('node:util')

/**
 * @type {import('node:sqlite').DatabaseSync}
 */
let DatabaseSync

const VERSION = 1

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
   * Stored items whose body is still being read, by id.
   * @type {Map<number, { stream: ReadableStream, length: number | null, source: any }>}
   */
  #pendingBodies = new Map()

  /**
   * Ids of the items read from storage, by their request's URL list. Copies of a request
   * share its URL list, so they map to the same item.
   * @type {WeakMap<URL[], number>}
   */
  #ids = new WeakMap()

  /**
   * @param {string} [location] where the list is stored, see `new DatabaseSync(location)`
   */
  constructor (location = ':memory:') {
    if (!DatabaseSync) {
      DatabaseSync = require('node:sqlite').DatabaseSync
    }

    this.#db = new DatabaseSync(location)

    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS requestResponseListV${VERSION} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request TEXT NOT NULL,
        response TEXT NOT NULL,
        responseFilter TEXT,
        body BLOB
      )
    `)

    this.#appendQuery = this.#db.prepare(`INSERT INTO requestResponseListV${VERSION} (request, response, responseFilter, body) VALUES (?, ?, ?, ?)`)
    this.#setBodyQuery = this.#db.prepare(`UPDATE requestResponseListV${VERSION} SET body = ? WHERE id = ?`)
    this.#removeQuery = this.#db.prepare(`DELETE FROM requestResponseListV${VERSION} WHERE id = ?`)
    this.#clearQuery = this.#db.prepare(`DELETE FROM requestResponseListV${VERSION}`)
    this.#itemsQuery = this.#db.prepare(`SELECT id, request, response, responseFilter, body FROM requestResponseListV${VERSION} ORDER BY id`)
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
      JSON.stringify({ ...request, client: null, body: null }, replacer),
      JSON.stringify({ ...internalResponse, body: null }, replacer),
      response.internalResponse ? response.type : null,
      bytes ?? null
    )

    if (bytes !== undefined) {
      return
    }

    // The body's bytes are only available by reading its stream, so they are written once it has been read.
    // Until then, the item's body is a clone of the body being read.
    const body = cloneBody(internalResponse.body)

    this.#pendingBodies.set(id, internalResponse.body)

    readAllBytes(body.stream.getReader(), (bytes) => {
      this.#setBodyQuery.run(bytes, id)
      this.#pendingBodies.delete(id)
    }, () => {
      this.#removeQuery.run(id)
      this.#pendingBodies.delete(id)
    })
  }

  /**
   * Removes the item whose value matches requestResponse, which must have been read from this list.
   * @see https://infra.spec.whatwg.org/#list-remove
   * @param {[any, any]} requestResponse
   */
  remove ([request]) {
    const id = this.#ids.get(request.urlList)

    if (id !== undefined) {
      this.#removeQuery.run(id)
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
   * @param {{ id: number, request: string, response: string, responseFilter: string | null, body: Uint8Array | null }} row
   * @returns {[any, any]}
   */
  #toItem (row) {
    const request = makeRequest(JSON.parse(row.request, reviver))
    this.#ids.set(request.urlList, row.id)

    const response = makeResponse(JSON.parse(row.response, reviver))
    const pendingBody = this.#pendingBodies.get(row.id)

    if (pendingBody !== undefined) {
      response.body = cloneBody(pendingBody)
    } else {
      response.body = row.body === null ? null : extractBody(row.body)[0]
    }

    return [request, row.responseFilter === null ? response : filterResponse(response, row.responseFilter)]
  }
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

  if (types.isArrayBuffer(source)) {
    return new Uint8Array(source)
  }

  return undefined
}

/**
 * Stores the values that JSON can't represent as tagged objects, which reviver() turns back into those values.
 * @this {any}
 * @param {string} key
 * @param {any} value
 */
function replacer (key, value) {
  const original = this[key]

  if (original instanceof URL) {
    return { $url: original.href }
  }

  if (original instanceof HeadersList) {
    return { $headersList: original.entriesList }
  }

  if (original instanceof Error) {
    return { $error: original.message, name: original.name }
  }

  return value
}

/**
 * @param {string} key
 * @param {any} value
 */
function reviver (key, value) {
  if (value?.$url !== undefined) {
    return new URL(value.$url)
  }

  if (value?.$headersList !== undefined) {
    const headersList = new HeadersList()

    for (const [name, headerValue] of value.$headersList) {
      headersList.append(name, headerValue, false)
    }

    return headersList
  }

  if (value?.$error !== undefined) {
    const error = new Error(value.$error)
    error.name = value.name
    return error
  }

  return value
}

module.exports = {
  RequestResponseList
}
