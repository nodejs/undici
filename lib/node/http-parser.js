'use strict'

// TODO: This is not really allowed by Node but it works for now.
const common = require('_http_common')

let NodeHTTPParser
if (common.HTTPParser) {
  NodeHTTPParser = common.HTTPParser
} else {
  // Node 10
  NodeHTTPParser = process.binding('http_parser').HTTPParser // eslint-disable-line
}

const nodeVersions = process.version.split('.')
const nodeMajorVersion = parseInt(nodeVersions[0].slice(1))
const nodeMinorVersion = parseInt(nodeVersions[1])
const insecureHTTPParser = process.execArgv.includes('--insecure-http-parser')

module.exports = class HTTPParser {
  constructor ({ maxHeadersSize }) {
    /* istanbul ignore next */
    if (nodeMajorVersion === 12 && nodeMinorVersion < 19) {
      this.parser = new NodeHTTPParser()
      this.parser.initialize(
        NodeHTTPParser.RESPONSE,
        {},
        0
      )
    } else if (nodeMajorVersion === 12 && nodeMinorVersion >= 19) {
      this.parser = new NodeHTTPParser()
      this.parser.initialize(
        NodeHTTPParser.RESPONSE,
        {},
        maxHeadersSize,
        0
      )
    } else if (nodeMajorVersion > 12) {
      this.parser = new NodeHTTPParser()
      this.parser.initialize(
        NodeHTTPParser.RESPONSE,
        {},
        maxHeadersSize,
        insecureHTTPParser,
        0
      )
    } else {
      this.parser = new NodeHTTPParser(NodeHTTPParser.RESPONSE, false)
    }

    this.parser[NodeHTTPParser.kOnHeaders] = function (rawHeaders) {
      /* istanbul ignore next: difficult to make a test case for */
      if (this.paused) {
        this.queue.push([NodeHTTPParser.kOnHeaders, rawHeaders])
        return
      }
      this.onHeaders(rawHeaders)
    }

    this.parser[NodeHTTPParser.kOnExecute] = (ret, currentBuffer) => {
      if (this.paused) {
        this.queue.push([NodeHTTPParser.kOnExecute, ret, currentBuffer])
        return
      }
      this.onExecute(ret, currentBuffer)
    }

    this.parser[NodeHTTPParser.kOnHeadersComplete] = (versionMajor, versionMinor, rawHeaders, method,
      url, statusCode, statusMessage, upgrade, shouldKeepAlive) => {
      /* istanbul ignore next: difficult to make a test case for */
      if (this.paused) {
        this.queue.push([NodeHTTPParser.kOnHeadersComplete, versionMajor, versionMinor, rawHeaders, method,
          url, statusCode, statusMessage, upgrade, shouldKeepAlive])
        return // TODO (fix): What do we return here?
      }
      return this.onHeadersComplete(rawHeaders, statusCode, statusMessage, upgrade, shouldKeepAlive)
    }

    this.parser[NodeHTTPParser.kOnBody] = (chunk, offset, length) => {
      if (this.paused) {
        this.queue.push([NodeHTTPParser.kOnBody, chunk, offset, length])
        return
      }
      this.onBody(chunk, offset, length)
    }

    this.parser[NodeHTTPParser.kOnMessageComplete] = () => {
      /* istanbul ignore next: difficult to make a test case for */
      if (this.paused) {
        this.queue.push([NodeHTTPParser.kOnMessageComplete])
        return
      }
      this.onMessageComplete()
    }

    // Parser can't be paused from within a callback.
    // Use a buffer in JS land in order to stop further progress while paused.
    this.resuming = false
    this.queue = []
    this.paused = false
  }

  resume () {
    if (!this.paused || this.resuming) {
      return
    }

    this.paused = false

    this.resuming = true
    while (this.queue.length) {
      const [key, ...args] = this.queue.shift()

      this[key](...args)

      if (this.paused) {
        this.resuming = false
        return
      }
    }
    this.resuming = false
  }

  pause () {
    this.paused = true
  }

  execute (data) {
    let ret
    try {
      ret = this.parser.execute(data)
    } catch (err) {
      ret = err
    }

    this.parser[NodeHTTPParser.kOnExecute](ret, data)
  }

  destroy () {
    setImmediate((parser) => parser.close(), this.parser)
    this.parser = null
  }
}
