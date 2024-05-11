/**
 * @typedef {'???'} ClientFrameType @todo
 * @typedef {'main' | 'worker'} ClientType
 */

/**
 * @typedef {Object} SerializedClient
 * @property {string} id
 * @property {string} url
 * @property {ClientType} type
 * @property {ClientFrameType} frameType
 */

/**
 * @see https://w3c.github.io/ServiceWorker/#client-interface
 */
export class Client {
  /**
   * @type {MessagePort['postMessage']}
   */
  postMessage = () => {
    throw new Error(
      'Failed to call Client#postMessage: the "postMessage" method is not implemented'
    )
  }

  /**
   *
   * @param {string} id
   * @param {string} url
   * @param {ClientType} type
   * @param {ClientFrameType} frameType
   */
  constructor (id, url, type, frameType) {
    /** @type {string} id */
    this.id = id
    /** @type {string} url */
    this.url = url
    /** @type {ClientType} type */
    this.type = type
    /** @type {ClientFrameType} frameType */
    this.frameType = frameType
  }

  /** @todo Finish the implementation. */
}
