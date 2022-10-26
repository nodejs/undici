const { WPTRunner } = require('./runner/runner/runner.js')
const { once } = require('events')

const runner = new WPTRunner('xhr', 'http://localhost:3333')
runner.run()

;(async () => {
  await once(runner, 'completion')
})()
