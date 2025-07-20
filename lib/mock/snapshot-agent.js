'use strict'

const Agent = require('../dispatcher/agent')
const MockAgent = require('./mock-agent')
const { SnapshotRecorder } = require('./snapshot-recorder')
const { InvalidArgumentError, UndiciError } = require('../core/errors')
// Removed unused import: const { kClients } = require('../core/symbols')

const kSnapshotRecorder = Symbol('kSnapshotRecorder')
const kSnapshotMode = Symbol('kSnapshotMode')
const kSnapshotPath = Symbol('kSnapshotPath')
const kSnapshotLoaded = Symbol('kSnapshotLoaded')
const kRealAgent = Symbol('kRealAgent')

class SnapshotAgent extends MockAgent {
  constructor (opts = {}) {
    // Emit experimental warning
    process.emitWarning(
      'SnapshotAgent is experimental and subject to change',
      'ExperimentalWarning'
    )

    const mockOptions = { ...opts }
    delete mockOptions.mode
    delete mockOptions.snapshotPath

    super(mockOptions)

    // Validate mode option
    const validModes = ['record', 'playback', 'update']
    const mode = opts.mode || 'record'
    if (!validModes.includes(mode)) {
      throw new InvalidArgumentError(`Invalid snapshot mode: ${mode}. Must be one of: ${validModes.join(', ')}`)
    }

    // Validate snapshotPath is provided when required
    if ((mode === 'playback' || mode === 'update') && !opts.snapshotPath) {
      throw new InvalidArgumentError(`snapshotPath is required when mode is '${mode}'`)
    }

    this[kSnapshotMode] = mode
    this[kSnapshotPath] = opts.snapshotPath
    this[kSnapshotRecorder] = new SnapshotRecorder({
      snapshotPath: this[kSnapshotPath],
      mode: this[kSnapshotMode],
      maxSnapshots: opts.maxSnapshots,
      autoFlush: opts.autoFlush,
      flushInterval: opts.flushInterval,
      matchHeaders: opts.matchHeaders,
      ignoreHeaders: opts.ignoreHeaders,
      excludeHeaders: opts.excludeHeaders,
      matchBody: opts.matchBody,
      matchQuery: opts.matchQuery,
      caseSensitive: opts.caseSensitive,
      shouldRecord: opts.shouldRecord,
      shouldPlayback: opts.shouldPlayback,
      excludeUrls: opts.excludeUrls
    })
    this[kSnapshotLoaded] = false

    // For recording mode, we need a real agent to make actual requests
    if (this[kSnapshotMode] === 'record' || this[kSnapshotMode] === 'update') {
      this[kRealAgent] = new Agent(opts)
    }

    // Auto-load snapshots in playback/update mode
    if ((this[kSnapshotMode] === 'playback' || this[kSnapshotMode] === 'update') && this[kSnapshotPath]) {
      this.loadSnapshots().catch(() => {
        // Ignore load errors - file might not exist yet
      })
    }
  }

  async dispatch (opts, handler) {
    const mode = this[kSnapshotMode]

    if (mode === 'playback' || mode === 'update') {
      // Ensure snapshots are loaded
      if (!this[kSnapshotLoaded]) {
        await this.loadSnapshots()
      }

      // Try to find existing snapshot
      const snapshot = this[kSnapshotRecorder].findSnapshot(opts)

      if (snapshot) {
        // Use recorded response
        return this._replaySnapshot(snapshot, handler)
      } else if (mode === 'update') {
        // Make real request and record it
        return this._recordAndReplay(opts, handler)
      } else {
        // Playback mode but no snapshot found
        const error = new UndiciError(`No snapshot found for ${opts.method || 'GET'} ${opts.path}`)
        if (handler.onError) {
          handler.onError(error)
          return
        }
        throw error
      }
    } else if (mode === 'record') {
      // Record mode - make real request and save response
      return this._recordAndReplay(opts, handler)
    } else {
      throw new InvalidArgumentError(`Invalid snapshot mode: ${mode}. Must be 'record', 'playback', or 'update'`)
    }
  }

  /**
   * Records a real request and replays the response
   */
  async _recordAndReplay (opts, handler) {
    return new Promise((resolve, reject) => {
      const responseData = {
        statusCode: null,
        headers: {},
        trailers: {},
        body: []
      }

      const self = this // Capture 'this' context

      const recordingHandler = {
        onConnect (abort) {
          handler.onConnect?.(abort)
        },
        onError (error) {
          reject(error)
        },
        onUpgrade (statusCode, headers, socket) {
          handler.onUpgrade?.(statusCode, headers, socket)
        },
        onHeaders (statusCode, headers, resume, statusText) {
          responseData.statusCode = statusCode
          responseData.headers = headers

          const result = handler.onHeaders?.(statusCode, headers, resume, statusText)
          if (result === false) return false

          return true
        },
        onData (chunk) {
          responseData.body.push(chunk)
          return handler.onData?.(chunk)
        },
        onComplete (trailers) {
          responseData.trailers = trailers

          // Record the interaction using captured 'self' context
          const responseBody = Buffer.concat(responseData.body)
          self[kSnapshotRecorder].record(opts, {
            statusCode: responseData.statusCode,
            headers: responseData.headers,
            body: responseBody,
            trailers: responseData.trailers
          })

          handler.onComplete?.(trailers)
          resolve()
        }
      }

      // Make real request through the real agent
      this[kRealAgent].dispatch(opts, recordingHandler)
    })
  }

  /**
   * Replays a recorded response
   */
  _replaySnapshot (snapshot, handler) {
    return new Promise((resolve) => {
      // Simulate the response
      setImmediate(() => {
        try {
          const { response } = snapshot

          handler.onConnect?.(() => {})

          const continueReading = handler.onHeaders?.(
            response.statusCode,
            response.headers,
            () => {}, // resume
            'OK'
          )

          if (continueReading !== false && response.body) {
            // Body is always stored as base64 string
            const body = Buffer.from(response.body, 'base64')
            handler.onData?.(body)
          }

          handler.onComplete?.(response.trailers || {})
          resolve()
        } catch (error) {
          handler.onError?.(error)
        }
      })
    })
  }

  /**
   * Loads snapshots from file
   */
  async loadSnapshots (filePath) {
    await this[kSnapshotRecorder].loadSnapshots(filePath || this[kSnapshotPath])
    this[kSnapshotLoaded] = true

    // In playback mode, set up MockAgent interceptors for all snapshots
    if (this[kSnapshotMode] === 'playback') {
      this._setupMockInterceptors()
    }
  }

  /**
   * Saves snapshots to file
   */
  async saveSnapshots (filePath) {
    return this[kSnapshotRecorder].saveSnapshots(filePath || this[kSnapshotPath])
  }

  /**
   * Sets up MockAgent interceptors based on recorded snapshots.
   *
   * This method creates MockAgent interceptors for each recorded snapshot,
   * allowing the SnapshotAgent to fall back to MockAgent's standard intercept
   * mechanism in playback mode. Each interceptor is configured to persist
   * (remain active for multiple requests) and responds with the recorded
   * response data.
   *
   * Called automatically when loading snapshots in playback mode.
   *
   * @private
   */
  _setupMockInterceptors () {
    for (const snapshot of this[kSnapshotRecorder].getSnapshots()) {
      const { request, responses, response } = snapshot
      const url = new URL(request.url)

      const mockPool = this.get(url.origin)

      // Handle both new format (responses array) and legacy format (response object)
      const responseData = responses ? responses[0] : response
      if (!responseData) continue

      mockPool.intercept({
        path: url.pathname + url.search,
        method: request.method,
        headers: request.headers,
        body: request.body
      }).reply(responseData.statusCode, responseData.body, {
        headers: responseData.headers,
        trailers: responseData.trailers
      }).persist()
    }
  }

  /**
   * Gets the snapshot recorder
   */
  getRecorder () {
    return this[kSnapshotRecorder]
  }

  /**
   * Gets the current mode
   */
  getMode () {
    return this[kSnapshotMode]
  }

  /**
   * Clears all snapshots
   */
  clearSnapshots () {
    this[kSnapshotRecorder].clear()
  }

  /**
   * Resets call counts for all snapshots (useful for test cleanup)
   */
  resetCallCounts () {
    this[kSnapshotRecorder].resetCallCounts()
  }

  /**
   * Deletes a specific snapshot by request options
   */
  deleteSnapshot (requestOpts) {
    return this[kSnapshotRecorder].deleteSnapshot(requestOpts)
  }

  /**
   * Gets information about a specific snapshot
   */
  getSnapshotInfo (requestOpts) {
    return this[kSnapshotRecorder].getSnapshotInfo(requestOpts)
  }

  /**
   * Replaces all snapshots with new data (full replacement)
   */
  replaceSnapshots (snapshotData) {
    this[kSnapshotRecorder].replaceSnapshots(snapshotData)
  }

  async close () {
    // Cleanup recorder timers
    this[kSnapshotRecorder].destroy()

    if (this[kRealAgent]) {
      await this[kRealAgent].close()
    }
    await super.close()
  }
}

module.exports = SnapshotAgent
