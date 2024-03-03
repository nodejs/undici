'use strict'
const ProxyAgent = require('../dispatcher/proxy-agent')

module.exports = opts => {
  const agent = new ProxyAgent(opts)
  return () => {
    return function proxyInterceptor (opts, handler) {
      return agent.dispatch(opts, handler)
    }
  }
}
