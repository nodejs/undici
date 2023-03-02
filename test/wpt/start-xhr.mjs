import { WPTRunner } from './runner/runner.mjs'
import { once } from 'events'

const { WPT_REPORT } = process.env

const runner = new WPTRunner('xhr/formdata', 'http://localhost:3333', {
  appendReport: !!WPT_REPORT,
  reportPath: WPT_REPORT
})
runner.run()

await once(runner, 'completion')
