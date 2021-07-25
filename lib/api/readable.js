'use strict'

const { Readable } = require('stream')

let Blob

const kBody = Symbol('body')

const kWebStreamType = 1
const kTextType = 2
const kBlobType = 3
const kArrayBufferType = 4
const kJSONType = 5

class AbortError extends Error {
  constructor () {
    super('The operation was aborted')
    this.code = 'ABORT_ERR'
    this.name = 'AbortError'
  }
}

module.exports = class BodyReadable extends Readable {
  constructor (opts) {
    super(opts)

    this[kBody] = undefined
  }

  // https://fetch.spec.whatwg.org/#dom-body-bodyused
  get bodyUsed () {
    return isDisturbed(this)
  }

  get body () {
    if (this[kBody]?.type === kWebStreamType) {
      return this[kBody].body
    }

    return consume(this, kWebStreamType)
  }

  text () {
    return consume(this, kTextType)
  }

  json () {
    return consume(this, kJSONType)
  }

  blob () {
    return consume(this, kBlobType)
  }

  arrayBuffer () {
    return consume(this, kArrayBufferType)
  }
}

function isLocked (self) {
  return self[kBody] && (self[kBody].type !== kWebStreamType || self[kBody].body.locked)
}

// https://streams.spec.whatwg.org/#readablestream-disturbed
function isDisturbed (self) {
  return self.destroyed || self.readableDidRead
}

// https://fetch.spec.whatwg.org/#body-unusable
function isUnusable (self) {
  return isDisturbed(self) || isLocked(self)
}

function consume (self, type) {
  if (isUnusable(self)) {
    throw new TypeError('unusable')
  }

  if (type === kWebStreamType) {
    self[kBody] = {
      type,
      body: Readable.toWeb(self)
    }

    return self[kBody].body
  }

  return new Promise((resolve, reject) => {
    self[kBody] = {
      type,
      resolve,
      reject,
      body: type === kTextType || type === kJSONType ? '' : []
    }
    self
      .on('error', reject)
      .on('data', function (val) {
        const { type } = this[kBody]

        if (type === kTextType || type === kJSONType) {
          this[kBody].body += val
        } else {
          this[kBody].body.push(val)
        }
      })
      .on('end', function () {
        const { type, resolve, body } = this[kBody]

        try {
          if (type === kTextType) {
            resolve(body)
          } else if (type === kJSONType) {
            resolve(JSON.parse(body))
          } else if (type === kArrayBufferType) {
            resolve(Buffer.concat(body).buffer)
          } else if (type === kBlobType) {
            if (!Blob) {
              Blob = require('buffer').Blob
            }
            resolve(new Blob(body))
          }

          this[kBody].body = null
        } catch (err) {
          self.destroy(err)
        }
      })
      .on('close', function () {
        const { body, reject } = this[kBody]

        if (body !== null) {
          reject(new AbortError())
        }
      })
  })
}
