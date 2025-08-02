'use strict'

const { kClients } = require('../core/symbols')
const Agent = require('../dispatcher/agent')
const {
  kAgent,
  kMockAgentSet,
  kMockAgentGet,
  kDispatches,
  kIsMockActive,
  kNetConnect,
  kGetNetConnect,
  kOptions,
  kFactory,
  kMockAgentRegisterCallHistory,
  kMockAgentIsCallHistoryEnabled,
  kMockAgentAddCallHistoryLog,
  kMockAgentMockCallHistoryInstance,
  kMockAgentAcceptsNonStandardSearchParameters,
  kMockCallHistoryAddLog,
  kIgnoreTrailingSlash
} = require('./mock-symbols')
const MockClient = require('./mock-client')
const MockPool = require('./mock-pool')
const { matchValue, normalizeSearchParams, buildAndValidateMockOptions } = require('./mock-utils')
const { InvalidArgumentError, UndiciError } = require('../core/errors')
const Dispatcher = require('../dispatcher/dispatcher')
const PendingInterceptorsFormatter = require('./pending-interceptors-formatter')
const { MockCallHistory } = require('./mock-call-history')

class MockAgent extends Dispatcher {
  constructor (opts) {
    super(opts)

    const mockOptions = buildAndValidateMockOptions(opts)

    this[kNetConnect] = true
    this[kIsMockActive] = true
    this[kMockAgentIsCallHistoryEnabled] = mockOptions?.enableCallHistory ?? false
    this[kMockAgentAcceptsNonStandardSearchParameters] = mockOptions?.acceptNonStandardSearchParameters ?? false
    this[kIgnoreTrailingSlash] = mockOptions?.ignoreTrailingSlash ?? false

    // Handle development mode options
    if (mockOptions?.developmentMode) {
      this[kMockAgentIsCallHistoryEnabled] = true
      mockOptions.traceRequests = mockOptions.traceRequests ?? true
      mockOptions.verboseErrors = mockOptions.verboseErrors ?? true
    }

    // Instantiate Agent and encapsulate
    if (opts?.agent && typeof opts.agent.dispatch !== 'function') {
      throw new InvalidArgumentError('Argument opts.agent must implement Agent')
    }
    const agent = opts?.agent ? opts.agent : new Agent(opts)
    this[kAgent] = agent

    this[kClients] = agent[kClients]
    this[kOptions] = mockOptions

    if (this[kMockAgentIsCallHistoryEnabled]) {
      this[kMockAgentRegisterCallHistory]()
    }
  }

  get (origin) {
    const originKey = this[kIgnoreTrailingSlash]
      ? origin.replace(/\/$/, '')
      : origin

    let dispatcher = this[kMockAgentGet](originKey)

    if (!dispatcher) {
      dispatcher = this[kFactory](originKey)
      this[kMockAgentSet](originKey, dispatcher)
    }
    return dispatcher
  }

  dispatch (opts, handler) {
    // Call MockAgent.get to perform additional setup before dispatching as normal
    this.get(opts.origin)

    this[kMockAgentAddCallHistoryLog](opts)

    const acceptNonStandardSearchParameters = this[kMockAgentAcceptsNonStandardSearchParameters]

    const dispatchOpts = { ...opts }

    if (acceptNonStandardSearchParameters && dispatchOpts.path) {
      const [path, searchParams] = dispatchOpts.path.split('?')
      const normalizedSearchParams = normalizeSearchParams(searchParams, acceptNonStandardSearchParameters)
      dispatchOpts.path = `${path}?${normalizedSearchParams}`
    }

    return this[kAgent].dispatch(dispatchOpts, handler)
  }

  async close () {
    this.clearCallHistory()
    await this[kAgent].close()
    this[kClients].clear()
  }

  deactivate () {
    this[kIsMockActive] = false
  }

  activate () {
    this[kIsMockActive] = true
  }

  enableNetConnect (matcher) {
    if (typeof matcher === 'string' || typeof matcher === 'function' || matcher instanceof RegExp) {
      if (Array.isArray(this[kNetConnect])) {
        this[kNetConnect].push(matcher)
      } else {
        this[kNetConnect] = [matcher]
      }
    } else if (typeof matcher === 'undefined') {
      this[kNetConnect] = true
    } else {
      throw new InvalidArgumentError('Unsupported matcher. Must be one of String|Function|RegExp.')
    }
  }

  disableNetConnect () {
    this[kNetConnect] = false
  }

  enableCallHistory () {
    this[kMockAgentIsCallHistoryEnabled] = true

    return this
  }

  disableCallHistory () {
    this[kMockAgentIsCallHistoryEnabled] = false

    return this
  }

  getCallHistory () {
    return this[kMockAgentMockCallHistoryInstance]
  }

  clearCallHistory () {
    if (this[kMockAgentMockCallHistoryInstance] !== undefined) {
      this[kMockAgentMockCallHistoryInstance].clear()
    }
  }

  // This is required to bypass issues caused by using global symbols - see:
  // https://github.com/nodejs/undici/issues/1447
  get isMockActive () {
    return this[kIsMockActive]
  }

  [kMockAgentRegisterCallHistory] () {
    if (this[kMockAgentMockCallHistoryInstance] === undefined) {
      this[kMockAgentMockCallHistoryInstance] = new MockCallHistory()
    }
  }

  [kMockAgentAddCallHistoryLog] (opts) {
    if (this[kMockAgentIsCallHistoryEnabled]) {
      // additional setup when enableCallHistory class method is used after mockAgent instantiation
      this[kMockAgentRegisterCallHistory]()

      // add call history log on every call (intercepted or not)
      this[kMockAgentMockCallHistoryInstance][kMockCallHistoryAddLog](opts)
    }
  }

  [kMockAgentSet] (origin, dispatcher) {
    this[kClients].set(origin, { count: 0, dispatcher })
  }

  [kFactory] (origin) {
    const mockOptions = Object.assign({ agent: this }, this[kOptions])
    return this[kOptions] && this[kOptions].connections === 1
      ? new MockClient(origin, mockOptions)
      : new MockPool(origin, mockOptions)
  }

  [kMockAgentGet] (origin) {
    // First check if we can immediately find it
    const result = this[kClients].get(origin)
    if (result?.dispatcher) {
      return result.dispatcher
    }

    // If the origin is not a string create a dummy parent pool and return to user
    if (typeof origin !== 'string') {
      const dispatcher = this[kFactory]('http://localhost:9999')
      this[kMockAgentSet](origin, dispatcher)
      return dispatcher
    }

    // If we match, create a pool and assign the same dispatches
    for (const [keyMatcher, result] of Array.from(this[kClients])) {
      if (result && typeof keyMatcher !== 'string' && matchValue(keyMatcher, origin)) {
        const dispatcher = this[kFactory](origin)
        this[kMockAgentSet](origin, dispatcher)
        dispatcher[kDispatches] = result.dispatcher[kDispatches]
        return dispatcher
      }
    }
  }

  [kGetNetConnect] () {
    return this[kNetConnect]
  }

  pendingInterceptors () {
    const mockAgentClients = this[kClients]

    return Array.from(mockAgentClients.entries())
      .flatMap(([origin, result]) => result.dispatcher[kDispatches].map(dispatch => ({ ...dispatch, origin })))
      .filter(({ pending }) => pending)
  }

  assertNoPendingInterceptors ({ pendingInterceptorsFormatter = new PendingInterceptorsFormatter() } = {}) {
    const pending = this.pendingInterceptors()

    if (pending.length === 0) {
      return
    }

    throw new UndiciError(
      pending.length === 1
        ? `1 interceptor is pending:\n\n${pendingInterceptorsFormatter.format(pending)}`.trim()
        : `${pending.length} interceptors are pending:\n\n${pendingInterceptorsFormatter.format(pending)}`.trim()
    )
  }

  debug () {
    const mockAgentClients = this[kClients]
    const origins = Array.from(mockAgentClients.keys())
    const interceptorsByOrigin = {}
    let totalInterceptors = 0
    let pendingInterceptorsCount = 0

    for (const [origin, result] of mockAgentClients.entries()) {
      const dispatches = result.dispatcher[kDispatches]
      interceptorsByOrigin[origin] = dispatches.map(dispatch => ({
        method: dispatch.method,
        path: dispatch.path,
        statusCode: dispatch.data?.statusCode,
        timesInvoked: dispatch.timesInvoked || 0,
        times: dispatch.times || 1,
        persist: dispatch.persist || false,
        consumed: dispatch.consumed || false,
        pending: dispatch.pending !== false,
        headers: dispatch.headers,
        body: dispatch.body
      }))
      totalInterceptors += dispatches.length
      pendingInterceptorsCount += dispatches.filter(d => d.pending !== false).length
    }

    return {
      origins,
      totalInterceptors,
      pendingInterceptors: pendingInterceptorsCount,
      callHistory: {
        enabled: this[kMockAgentIsCallHistoryEnabled],
        calls: this[kMockAgentIsCallHistoryEnabled] ? this.getCallHistory()?.calls() || [] : []
      },
      interceptorsByOrigin,
      options: {
        traceRequests: this[kOptions]?.traceRequests || false,
        developmentMode: this[kOptions]?.developmentMode || false,
        verboseErrors: this[kOptions]?.verboseErrors || false,
        enableCallHistory: this[kMockAgentIsCallHistoryEnabled],
        acceptNonStandardSearchParameters: this[kMockAgentAcceptsNonStandardSearchParameters],
        ignoreTrailingSlash: this[kIgnoreTrailingSlash]
      },
      isMockActive: this[kIsMockActive],
      netConnect: this[kNetConnect]
    }
  }

  inspect () {
    const debugInfo = this.debug()

    console.log('\n=== MockAgent Debug Information ===')
    console.log(`Mock Active: ${debugInfo.isMockActive}`)
    console.log(`Net Connect: ${debugInfo.netConnect}`)
    console.log(`Total Origins: ${debugInfo.origins.length}`)
    console.log(`Total Interceptors: ${debugInfo.totalInterceptors}`)
    console.log(`Pending Interceptors: ${debugInfo.pendingInterceptors}`)
    console.log(`Call History: ${debugInfo.callHistory.enabled ? 'enabled' : 'disabled'}`)

    if (debugInfo.callHistory.enabled) {
      console.log(`Total Calls: ${debugInfo.callHistory.calls.length}`)
    }

    console.log('\nOptions:')
    for (const [key, value] of Object.entries(debugInfo.options)) {
      console.log(`  ${key}: ${value}`)
    }

    if (debugInfo.origins.length > 0) {
      console.log('\nInterceptors by Origin:')
      for (const origin of debugInfo.origins) {
        const interceptors = debugInfo.interceptorsByOrigin[origin]
        console.log(`\n${origin} (${interceptors.length} interceptors):`)

        if (interceptors.length > 0) {
          const formatter = new PendingInterceptorsFormatter()
          const formattedInterceptors = interceptors.map(i => ({
            ...i,
            origin,
            data: { statusCode: i.statusCode }
          }))
          console.log(formatter.format(formattedInterceptors))
        }
      }
    }

    if (debugInfo.pendingInterceptors === 0) {
      console.log('\n✅ No pending interceptors')
    } else {
      console.log(`\n⚠️  ${debugInfo.pendingInterceptors} pending interceptors`)
    }

    console.log('=== End Debug Information ===\n')

    return debugInfo
  }

  compareRequest (request, interceptor) {
    const { matchValue, calculateStringSimilarity } = require('./mock-utils')

    const differences = []
    let matches = true

    // Compare path
    const pathMatch = matchValue(interceptor.path, request.path)
    if (!pathMatch) {
      matches = false
      const similarity = calculateStringSimilarity(String(interceptor.path), String(request.path))
      differences.push({
        field: 'path',
        expected: interceptor.path,
        actual: request.path,
        similarity: Number(similarity.toFixed(2))
      })
    }

    // Compare method
    const methodMatch = matchValue(interceptor.method, request.method)
    if (!methodMatch) {
      matches = false
      const similarity = interceptor.method === request.method ? 1.0 : 0.0
      differences.push({
        field: 'method',
        expected: interceptor.method,
        actual: request.method,
        similarity
      })
    }

    // Compare body if interceptor has body constraint
    if (typeof interceptor.body !== 'undefined') {
      const bodyMatch = matchValue(interceptor.body, request.body)
      if (!bodyMatch) {
        matches = false
        const similarity = calculateStringSimilarity(String(interceptor.body || ''), String(request.body || ''))
        differences.push({
          field: 'body',
          expected: interceptor.body,
          actual: request.body,
          similarity: Number(similarity.toFixed(2))
        })
      }
    }

    // Compare headers if interceptor has header constraints
    if (interceptor.headers) {
      const { matchHeaders } = require('./mock-utils')
      const headersMatch = matchHeaders(interceptor, request.headers)
      if (!headersMatch) {
        matches = false
        differences.push({
          field: 'headers',
          expected: interceptor.headers,
          actual: request.headers,
          similarity: 0.0 // Header matching is complex, simplified for now
        })
      }
    }

    return {
      matches,
      differences,
      score: differences.length === 0 ? 1.0 : differences.reduce((sum, d) => sum + d.similarity, 0) / differences.length
    }
  }
}

module.exports = MockAgent
