'use strict'

const { writeFile, readFile, mkdir } = require('node:fs/promises')
const { dirname, resolve } = require('node:path')
const { InvalidArgumentError, UndiciError } = require('../core/errors')

/**
 * Formats a request for consistent snapshot storage
 */
function formatRequestKey (opts) {
  const url = new URL(opts.path, opts.origin)
  return {
    method: opts.method || 'GET',
    url: url.toString(),
    headers: normalizeHeaders(opts.headers),
    body: opts.body ? String(opts.body) : undefined
  }
}

/**
 * Normalizes headers for consistent comparison
 */
function normalizeHeaders (headers) {
  if (!headers) return {}
  
  const normalized = {}
  
  // Handle array format (undici internal format: [name, value, name, value, ...])
  if (Array.isArray(headers)) {
    for (let i = 0; i < headers.length; i += 2) {
      const key = headers[i]
      const value = headers[i + 1]
      if (key && value !== undefined) {
        // Convert Buffers to strings if needed
        const keyStr = Buffer.isBuffer(key) ? key.toString() : String(key)
        const valueStr = Buffer.isBuffer(value) ? value.toString() : String(value)
        normalized[keyStr.toLowerCase()] = valueStr
      }
    }
    return normalized
  }
  
  // Handle object format
  if (headers && typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers)) {
      if (key && typeof key === 'string') {
        normalized[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value)
      }
    }
  }
  
  return normalized
}

/**
 * Creates a hash key for request matching
 */
function createRequestHash (request) {
  const parts = [
    request.method,
    request.url,
    JSON.stringify(request.headers, Object.keys(request.headers).sort()),
    request.body || ''
  ]
  return Buffer.from(parts.join('|')).toString('base64url')
}

class SnapshotRecorder {
  constructor (options = {}) {
    this.snapshots = new Map()
    this.snapshotPath = options.snapshotPath
    this.mode = options.mode || 'record'
    this.loaded = false
    this.maxSnapshots = options.maxSnapshots || Infinity
    this.autoFlush = options.autoFlush || false
    this.flushInterval = options.flushInterval || 30000 // 30 seconds default
    this._flushTimer = null
    this._flushTimeout = null
    
    // Start auto-flush timer if enabled
    if (this.autoFlush && this.snapshotPath) {
      this._startAutoFlush()
    }
  }

  /**
   * Records a request-response interaction
   */
  async record (requestOpts, response) {
    const request = formatRequestKey(requestOpts)
    const hash = createRequestHash(request)
    
    // Extract response data - always store body as base64
    const responseData = {
      statusCode: response.statusCode,
      headers: normalizeHeaders(response.headers),
      body: Buffer.isBuffer(response.body) 
        ? response.body.toString('base64') 
        : Buffer.from(String(response.body || '')).toString('base64'),
      trailers: response.trailers
    }

    // Remove oldest snapshot if we exceed maxSnapshots limit
    if (this.snapshots.size >= this.maxSnapshots && !this.snapshots.has(hash)) {
      const oldestKey = this.snapshots.keys().next().value
      this.snapshots.delete(oldestKey)
    }

    this.snapshots.set(hash, {
      request,
      response: responseData,
      timestamp: new Date().toISOString()
    })

    // Auto-flush if enabled
    if (this.autoFlush && this.snapshotPath) {
      this._scheduleFlush()
    }
  }

  /**
   * Finds a matching snapshot for the given request
   */
  findSnapshot (requestOpts) {
    const request = formatRequestKey(requestOpts)
    const hash = createRequestHash(request)
    return this.snapshots.get(hash)
  }

  /**
   * Loads snapshots from file
   */
  async loadSnapshots (filePath) {
    const path = filePath || this.snapshotPath
    if (!path) {
      throw new InvalidArgumentError('Snapshot path is required')
    }

    try {
      const data = await readFile(resolve(path), 'utf8')
      const parsed = JSON.parse(data)
      
      // Convert array format back to Map
      if (Array.isArray(parsed)) {
        this.snapshots.clear()
        for (const { hash, snapshot } of parsed) {
          this.snapshots.set(hash, snapshot)
        }
      } else {
        // Legacy object format
        this.snapshots = new Map(Object.entries(parsed))
      }
      
      this.loaded = true
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet - that's ok for recording mode
        this.snapshots.clear()
        this.loaded = true
      } else {
        throw new UndiciError(`Failed to load snapshots from ${path}`, { cause: error })
      }
    }
  }

  /**
   * Saves snapshots to file
   */
  async saveSnapshots (filePath) {
    const path = filePath || this.snapshotPath
    if (!path) {
      throw new InvalidArgumentError('Snapshot path is required')
    }

    const resolvedPath = resolve(path)
    
    // Ensure directory exists
    await mkdir(dirname(resolvedPath), { recursive: true })
    
    // Convert Map to serializable format
    const data = Array.from(this.snapshots.entries()).map(([hash, snapshot]) => ({
      hash,
      snapshot
    }))
    
    await writeFile(resolvedPath, JSON.stringify(data, null, 2), 'utf8')
  }

  /**
   * Clears all recorded snapshots
   */
  clear () {
    this.snapshots.clear()
  }

  /**
   * Gets all recorded snapshots
   */
  getSnapshots () {
    return Array.from(this.snapshots.values())
  }

  /**
   * Gets snapshot count
   */
  size () {
    return this.snapshots.size
  }

  /**
   * Starts the auto-flush timer
   */
  _startAutoFlush () {
    if (!this._flushTimer) {
      this._flushTimer = setInterval(() => {
        this.saveSnapshots().catch(() => {
          // Ignore flush errors - they shouldn't interrupt normal operation
        })
      }, this.flushInterval)
    }
  }

  /**
   * Stops the auto-flush timer
   */
  _stopAutoFlush () {
    if (this._flushTimer) {
      clearInterval(this._flushTimer)
      this._flushTimer = null
    }
  }

  /**
   * Schedules a flush (debounced to avoid excessive writes)
   */
  _scheduleFlush () {
    // Simple debouncing - clear existing timeout and set new one
    if (this._flushTimeout) {
      clearTimeout(this._flushTimeout)
    }
    this._flushTimeout = setTimeout(() => {
      this.saveSnapshots().catch(() => {
        // Ignore flush errors
      })
      this._flushTimeout = null
    }, 1000) // 1 second debounce
  }

  /**
   * Cleanup method to stop timers
   */
  destroy () {
    this._stopAutoFlush()
    if (this._flushTimeout) {
      clearTimeout(this._flushTimeout)
      this._flushTimeout = null
    }
  }
}

module.exports = { SnapshotRecorder, formatRequestKey, createRequestHash }