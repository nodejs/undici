'use strict'

const { kClients } = require('../core/symbols')
const Agent = require('../agent')
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
  kGetMockAgentClientsByConsumedStatus
} = require('./mock-symbols')
const MockClient = require('./mock-client')
const MockPool = require('./mock-pool')
const { matchValue, buildMockOptions } = require('./mock-utils')
const { InvalidArgumentError } = require('../core/errors')
const Dispatcher = require('../dispatcher')
const Pluralizer = require('./pluralizer')
const TableFormatter = require('./table-formatter')

class FakeWeakRef {
  constructor (value) {
    this.value = value
  }

  deref () {
    return this.value
  }
}

class MockAgent extends Dispatcher {
  constructor (opts) {
    super(opts)

    this[kNetConnect] = true
    this[kIsMockActive] = true

    // Instantiate Agent and encapsulate
    if ((opts && opts.agent && typeof opts.agent.dispatch !== 'function')) {
      throw new InvalidArgumentError('Argument opts.agent must implement Agent')
    }
    const agent = opts && opts.agent ? opts.agent : new Agent(opts)
    this[kAgent] = agent

    this[kClients] = agent[kClients]
    this[kOptions] = buildMockOptions(opts)
  }

  get (origin) {
    let dispatcher = this[kMockAgentGet](origin)

    if (!dispatcher) {
      dispatcher = this[kFactory](origin)
      this[kMockAgentSet](origin, dispatcher)
    }
    return dispatcher
  }

  dispatch (opts, handler) {
    // Call MockAgent.get to perform additional setup before dispatching as normal
    this.get(opts.origin)
    return this[kAgent].dispatch(opts, handler)
  }

  async close () {
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

  [kMockAgentSet] (origin, dispatcher) {
    this[kClients].set(origin, new FakeWeakRef(dispatcher))
  }

  [kFactory] (origin) {
    const mockOptions = Object.assign({ agent: this }, this[kOptions])
    return this[kOptions] && this[kOptions].connections === 1
      ? new MockClient(origin, mockOptions)
      : new MockPool(origin, mockOptions)
  }

  [kMockAgentGet] (origin) {
    // First check if we can immediately find it
    const ref = this[kClients].get(origin)
    if (ref) {
      return ref.deref()
    }

    // If the origin is not a string create a dummy parent pool and return to user
    if (typeof origin !== 'string') {
      const dispatcher = this[kFactory]('http://localhost:9999')
      this[kMockAgentSet](origin, dispatcher)
      return dispatcher
    }

    // If we match, create a pool and assign the same dispatches
    for (const [keyMatcher, nonExplicitRef] of Array.from(this[kClients])) {
      const nonExplicitDispatcher = nonExplicitRef.deref()
      if (nonExplicitDispatcher && typeof keyMatcher !== 'string' && matchValue(keyMatcher, origin)) {
        const dispatcher = this[kFactory](origin)
        this[kMockAgentSet](origin, dispatcher)
        dispatcher[kDispatches] = nonExplicitDispatcher[kDispatches]
        return dispatcher
      }
    }
  }

  [kGetNetConnect] () {
    return this[kNetConnect]
  }

  [kGetMockAgentClientsByConsumedStatus] () {
    const mockAgentClients = this[kClients]

    return Array.from(mockAgentClients.entries())
      .map(([origin, scopeWeakRef]) => {
        const scope = scopeWeakRef.deref()

        if (scope == null) {
          throw new Error('scope was null; this should not happen')
        }

        return { origin, scope }
      })
      .map(({ origin, scope }) => {
        // @ts-expect-error TypeScript doesn't understand the symbol use
        const clients = scope[kDispatches]

        const consumed = clients.filter(({ consumed }) => consumed)
        const unconsumed = clients.filter(({ consumed }) => !consumed)
        const persistent = unconsumed.filter(({ persist }) => persist)
        const tooFewUses = unconsumed.filter(({ persist }) => !persist)

        return { origin, clients, consumed, persistent, tooFewUses }
      })
      .reduce(
        (all, current) => ({
          totals: {
            consumed: all.totals.consumed.concat(current.consumed),
            persistent: all.totals.persistent.concat(current.persistent),
            tooFewUses: all.totals.tooFewUses.concat(current.tooFewUses)
          },
          clients: all.clients.concat({
            origin: current.origin,
            clients: current.clients
          })
        }),
        {
          totals: {
            consumed: [],
            persistent: [],
            tooFewUses: []
          },
          clients: []
        }
      )
  }

  pendingInterceptors () {
    return this[kGetMockAgentClientsByConsumedStatus]().totals.tooFewUses
  }

  assertNoUnusedInterceptors (options = {}) {
    const clients = this[kGetMockAgentClientsByConsumedStatus]()

    if (clients.totals.tooFewUses.length === 0) {
      return clients
    }

    const interceptorPluralizer = new Pluralizer('interceptor', 'interceptors')
    const tooFew = interceptorPluralizer.pluralize(
      clients.totals.tooFewUses.length
    )
    const consumed = interceptorPluralizer.pluralize(
      clients.totals.consumed.length
    )
    const persistent = interceptorPluralizer.pluralize(
      clients.totals.persistent.length
    )

    throw new Error(`
${tooFew.count} ${tooFew.noun} ${tooFew.was} not consumed!
(${consumed.count} ${consumed.noun} ${consumed.was} consumed, and ${persistent.count} ${persistent.was} not counted because ${persistent.pronoun} ${persistent.is} persistent.)

${Pluralizer.capitalize(tooFew.this)} ${tooFew.noun} ${tooFew.was} not consumed:
${(options.tableFormatter ?? new TableFormatter()).formatTable(
      clients.totals.tooFewUses.map(
        ({ method, path, data: { statusCode }, persist, times }) => ({
          Method: method,
          Path: path,
          'Status code': statusCode,
          Persistent: persist ? '✅' : '❌',
          'Remaining calls': times ?? 1
        })))}
`.trim())
  }
}

module.exports = MockAgent
