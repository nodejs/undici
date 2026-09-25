'use strict'

const { HeadersList } = require('../fetch/headers')
const { makeRequest } = require('../fetch/request')
const { filterResponse, makeResponse } = require('../fetch/response')
const { extractBody } = require('../fetch/body')
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
      serializeRequest(request),
      serializeResponse(internalResponse),
      response.internalResponse ? response.type : null,
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
   * @param {{ id: number, request: string, response: string, responseFilter: string | null, body: Uint8Array | null }} row
   * @returns {[any, any]}
   */
  #toItem (row) {
    const request = deserializeRequest(row.request)
    this.#ids.set(request.urlList, row.id)

    const response = deserializeResponse(row.response)
    const pendingBody = this.#pendingBodies.get(row.id)

    if (pendingBody !== undefined) {
      response.body = extractBody((async function * () {
        yield await pendingBody
      })())[0]
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
 * The request's state as JSON. Its body is not stored; requests in the list are GET requests.
 * @param {any} request
 * @returns {string}
 */
function serializeRequest (request) {
  return JSON.stringify({
    ...request,
    client: undefined,
    url: undefined,
    body: undefined,
    urlList: request.urlList.map((url) => url.href),
    headersList: request.headersList.entriesList
  })
}

/**
 * @param {string} text the result of serializeRequest()
 */
function deserializeRequest (text) {
  const request = JSON.parse(text)

  return makeRequest({
    ...request,
    urlList: request.urlList.map((url) => new URL(url)),
    headersList: toHeadersList(request.headersList)
  })
}

/**
 * The response's state as JSON. Its body is stored separately.
 * @param {any} response
 * @returns {string}
 */
function serializeResponse (response) {
  return JSON.stringify({
    ...response,
    body: undefined,
    error: response.error?.message,
    urlList: response.urlList.map((url) => url.href),
    headersList: response.headersList.entriesList
  })
}

/**
 * @param {string} text the result of serializeResponse()
 */
function deserializeResponse (text) {
  const response = JSON.parse(text)

  if (response.error !== undefined) {
    response.error = new Error(response.error)
  }

  return makeResponse({
    ...response,
    body: null,
    urlList: response.urlList.map((url) => new URL(url)),
    headersList: toHeadersList(response.headersList)
  })
}

/**
 * @param {[string, string][]} entries the header list's entries
 */
function toHeadersList (entries) {
  const headersList = new HeadersList()

  for (const [name, value] of entries) {
    headersList.append(name, value, false)
  }

  return headersList
}

module.exports = {
  RequestResponseList
}
