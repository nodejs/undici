'use strict'

const Headers = require('./headers')
const { Blob } = require('buffer')
const { STATUS_CODES } = require('http')
const {
  NotSupportedError
} = require('../../core/errors')
const util = require('../../core/util')

const {
  kType,
  kStatus,
  kStatusText,
  kUrlList,
  kHeaders,
  kBody
} = require('./symbols')

class Response {
  constructor ({
    type,
    url,
    body,
    statusCode,
    headers,
    context
  }) {
    this[kType] = type || 'default'
    this[kStatus] = statusCode || 0
    this[kStatusText] = STATUS_CODES[statusCode] || ''
    this[kUrlList] = Array.isArray(url) ? url : (url ? [url] : [])
    this[kHeaders] = headers || new Headers()
    this[kBody] = body || null

    if (context && context.history) {
      this[kUrlList].push(...context.history)
    }
  }

  get type () {
    return this[kType]
  }

  get url () {
    const length = this[kUrlList].length
    return length === 0 ? '' : this[kUrlList][length - 1].toString()
  }

  get redirected () {
    return this[kUrlList].length > 1
  }

  get status () {
    return this[kStatus]
  }

  get ok () {
    return this[kStatus] >= 200 && this[kStatus] <= 299
  }

  get statusText () {
    return this[kStatusText]
  }

  get headers () {
    return this[kHeaders]
  }

  async blob () {
    const chunks = []
    if (this.body) {
      if (this.bodyUsed || this.body.locked) {
        throw new TypeError('unusable')
      }

      for await (const chunk of this.body) {
        chunks.push(chunk)
      }
    }

    return new Blob(chunks, { type: this.headers.get('Content-Type') || '' })
  }

  async arrayBuffer () {
    const blob = await this.blob()
    return await blob.arrayBuffer()
  }

  async text () {
    const blob = await this.blob()
    return await blob.text()
  }

  async json () {
    return JSON.parse(await this.text())
  }

  async formData () {
    // TODO: Implement.
    throw new NotSupportedError('formData')
  }

  get body () {
    return this[kBody]
  }

  get bodyUsed () {
    return util.isDisturbed(this.body)
  }

  clone () {
    let body = null

    if (this[kBody]) {
      if (util.isDisturbed(this[kBody])) {
        throw new TypeError('disturbed')
      }

      if (this[kBody].locked) {
        throw new TypeError('locked')
      }

      // https://fetch.spec.whatwg.org/#concept-body-clone
      const [out1, out2] = this[kBody].tee()

      this[kBody] = out1
      body = out2
    }

    return new Response({
      type: this[kType],
      statusCode: this[kStatus],
      url: this[kUrlList],
      headers: this[kHeaders],
      body
    })
  }
}

module.exports = Response
