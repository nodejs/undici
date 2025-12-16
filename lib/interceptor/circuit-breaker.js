'use strict'

const { InvalidArgumentError, CircuitBreakerError } = require('../core/errors')
const DecoratorHandler = require('../handler/decorator-handler')

// Circuit states
const STATE_CLOSED = 0
const STATE_OPEN = 1
const STATE_HALF_OPEN = 2

// Default error codes that trigger circuit breaker
const DEFAULT_ERROR_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EAI_AGAIN'
])

// Default status codes that trigger circuit breaker
const DEFAULT_STATUS_CODES = new Set([500, 502, 503, 504])

/**
 * Per-key circuit state tracking.
 * Uses a simple sliding window counter for fast failure tracking.
 */
class CircuitState {
  constructor () {
    this.state = STATE_CLOSED
    this.failureCount = 0
    this.successCount = 0
    this.lastFailureTime = 0
    this.halfOpenRequests = 0
  }

  reset () {
    this.state = STATE_CLOSED
    this.failureCount = 0
    this.successCount = 0
    this.lastFailureTime = 0
    this.halfOpenRequests = 0
  }
}

/**
 * Circuit breaker state storage with automatic cleanup.
 */
class CircuitBreakerStorage {
  #circuits = new Map()
  #maxSize
  #cleanupInterval
  #cleanupTimer = null

  constructor (opts = {}) {
    this.#maxSize = opts.maxSize ?? 1000
    this.#cleanupInterval = opts.cleanupInterval ?? 60000

    // Start cleanup timer
    if (this.#cleanupInterval > 0) {
      this.#cleanupTimer = setInterval(() => this.#cleanup(), this.#cleanupInterval).unref()
    }
  }

  get (key) {
    let circuit = this.#circuits.get(key)
    if (!circuit) {
      // Enforce max size with LRU-like eviction
      if (this.#circuits.size >= this.#maxSize) {
        const firstKey = this.#circuits.keys().next().value
        this.#circuits.delete(firstKey)
      }
      circuit = new CircuitState()
      this.#circuits.set(key, circuit)
    }
    return circuit
  }

  delete (key) {
    this.#circuits.delete(key)
  }

  #cleanup () {
    const now = Date.now()
    for (const [key, circuit] of this.#circuits) {
      // Remove circuits that have been closed for a while
      if (circuit.state === STATE_CLOSED && circuit.failureCount === 0) {
        this.#circuits.delete(key)
      } else if (circuit.state === STATE_OPEN && circuit.lastFailureTime > 0) {
        // Also clean up very old open circuits (stale entries)
        const age = now - circuit.lastFailureTime
        if (age > 300000) { // 5 minutes
          this.#circuits.delete(key)
        }
      }
    }
  }

  destroy () {
    if (this.#cleanupTimer) {
      clearInterval(this.#cleanupTimer)
      this.#cleanupTimer = null
    }
    this.#circuits.clear()
  }

  get size () {
    return this.#circuits.size
  }
}

class CircuitBreakerHandler extends DecoratorHandler {
  #circuit
  #opts
  #statusCodes
  #errorCodes
  #key

  constructor (opts, circuit, key, handler) {
    super(handler)
    this.#opts = opts
    this.#circuit = circuit
    this.#statusCodes = opts.statusCodes
    this.#errorCodes = opts.errorCodes
    this.#key = key
  }

  onResponseStart (controller, statusCode, headers, statusMessage) {
    if (this.#statusCodes.has(statusCode)) {
      this.#recordFailure()
    } else {
      this.#recordSuccess()
    }
    return super.onResponseStart(controller, statusCode, headers, statusMessage)
  }

  onResponseEnd (controller, trailers) {
    return super.onResponseEnd(controller, trailers)
  }

  onResponseError (controller, err) {
    const code = err?.code
    if (code && this.#errorCodes.has(code)) {
      this.#recordFailure()
    }
    return super.onResponseError(controller, err)
  }

  #recordFailure () {
    const circuit = this.#circuit
    circuit.failureCount++
    circuit.lastFailureTime = Date.now()
    circuit.successCount = 0

    if (circuit.state === STATE_HALF_OPEN) {
      // Any failure in half-open immediately opens the circuit
      circuit.state = STATE_OPEN
      circuit.halfOpenRequests = 0
    } else if (circuit.state === STATE_CLOSED) {
      if (circuit.failureCount >= this.#opts.threshold) {
        circuit.state = STATE_OPEN
      }
    }
  }

  #recordSuccess () {
    const circuit = this.#circuit

    if (circuit.state === STATE_HALF_OPEN) {
      circuit.successCount++
      circuit.halfOpenRequests = Math.max(0, circuit.halfOpenRequests - 1)

      if (circuit.successCount >= this.#opts.successThreshold) {
        circuit.reset()
      }
    } else if (circuit.state === STATE_CLOSED) {
      // In closed state, reset failure count on success
      circuit.failureCount = 0
    }
  }
}

/**
 * Default key generator - uses origin only for simplicity.
 * Override with getKey option for route-level granularity.
 */
function defaultGetKey (opts) {
  const origin = typeof opts.origin === 'string' ? opts.origin : opts.origin?.origin
  return origin || 'unknown'
}

/**
 * Creates a circuit breaker interceptor.
 *
 * @param {Object} opts Configuration options
 * @param {number} [opts.threshold=5] Number of failures before opening circuit
 * @param {number} [opts.timeout=30000] How long circuit stays open (ms)
 * @param {number} [opts.successThreshold=1] Successes needed in half-open to close
 * @param {number} [opts.maxHalfOpenRequests=1] Max concurrent requests in half-open
 * @param {Set|Array} [opts.statusCodes=[500,502,503,504]] Status codes that count as failures
 * @param {Set|Array} [opts.errorCodes] Error codes that count as failures
 * @param {Function} [opts.getKey] Function to extract circuit key from request opts
 * @param {CircuitBreakerStorage} [opts.storage] Custom storage instance
 * @param {Function} [opts.onStateChange] Callback when circuit state changes
 */
function createCircuitBreakerInterceptor (opts = {}) {
  const {
    threshold = 5,
    timeout = 30000,
    successThreshold = 1,
    maxHalfOpenRequests = 1,
    getKey = defaultGetKey,
    storage = new CircuitBreakerStorage(),
    onStateChange = null
  } = opts

  // Validate options
  if (typeof threshold !== 'number' || threshold < 1) {
    throw new InvalidArgumentError('threshold must be a positive number')
  }
  if (typeof timeout !== 'number' || timeout < 0) {
    throw new InvalidArgumentError('timeout must be a non-negative number')
  }
  if (typeof successThreshold !== 'number' || successThreshold < 1) {
    throw new InvalidArgumentError('successThreshold must be a positive number')
  }
  if (typeof maxHalfOpenRequests !== 'number' || maxHalfOpenRequests < 1) {
    throw new InvalidArgumentError('maxHalfOpenRequests must be a positive number')
  }
  if (typeof getKey !== 'function') {
    throw new InvalidArgumentError('getKey must be a function')
  }
  if (onStateChange != null && typeof onStateChange !== 'function') {
    throw new InvalidArgumentError('onStateChange must be a function')
  }

  // Convert arrays to Sets for O(1) lookup
  let statusCodes = opts.statusCodes
  if (statusCodes == null) {
    statusCodes = DEFAULT_STATUS_CODES
  } else if (Array.isArray(statusCodes)) {
    statusCodes = new Set(statusCodes)
  } else if (!(statusCodes instanceof Set)) {
    throw new InvalidArgumentError('statusCodes must be an array or Set')
  }

  let errorCodes = opts.errorCodes
  if (errorCodes == null) {
    errorCodes = DEFAULT_ERROR_CODES
  } else if (Array.isArray(errorCodes)) {
    errorCodes = new Set(errorCodes)
  } else if (!(errorCodes instanceof Set)) {
    throw new InvalidArgumentError('errorCodes must be an array or Set')
  }

  const resolvedOpts = {
    threshold,
    timeout,
    successThreshold,
    maxHalfOpenRequests,
    statusCodes,
    errorCodes
  }

  return dispatch => {
    return function circuitBreakerInterceptor (opts, handler) {
      const key = getKey(opts)

      // If getKey returns null/undefined, bypass circuit breaker
      if (key == null) {
        return dispatch(opts, handler)
      }

      const circuit = storage.get(key)
      const now = Date.now()

      // State machine logic
      if (circuit.state === STATE_OPEN) {
        // Check if timeout has elapsed
        if (now - circuit.lastFailureTime >= timeout) {
          circuit.state = STATE_HALF_OPEN
          circuit.halfOpenRequests = 0
          circuit.successCount = 0
          if (onStateChange) {
            onStateChange(key, 'half-open', 'open')
          }
        } else {
          // Fast fail - circuit is open
          const err = new CircuitBreakerError('Circuit breaker is open', {
            state: 'open',
            key
          })
          // Use queueMicrotask for async error delivery to match other interceptors
          queueMicrotask(() => {
            handler.onResponseError?.(null, err)
          })
          return true
        }
      }

      if (circuit.state === STATE_HALF_OPEN) {
        // Check if we've reached max half-open requests
        if (circuit.halfOpenRequests >= maxHalfOpenRequests) {
          const err = new CircuitBreakerError('Circuit breaker is half-open (max requests reached)', {
            state: 'half-open',
            key
          })
          queueMicrotask(() => {
            handler.onResponseError?.(null, err)
          })
          return true
        }
        circuit.halfOpenRequests++
      }

      return dispatch(
        opts,
        new CircuitBreakerHandler(resolvedOpts, circuit, key, handler)
      )
    }
  }
}

// Export state constants for testing/debugging
createCircuitBreakerInterceptor.STATE_CLOSED = STATE_CLOSED
createCircuitBreakerInterceptor.STATE_OPEN = STATE_OPEN
createCircuitBreakerInterceptor.STATE_HALF_OPEN = STATE_HALF_OPEN
createCircuitBreakerInterceptor.CircuitBreakerStorage = CircuitBreakerStorage

module.exports = createCircuitBreakerInterceptor
