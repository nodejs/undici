'use strict'
const ProxyAgent = require('../dispatcher/proxy-agent')

module.exports = opts => {
  const agent = new ProxyAgent(opts)
  return dispatch => {
    dispatch = agent.dispatch.bind(agent)

    return dispatch
  }
}
