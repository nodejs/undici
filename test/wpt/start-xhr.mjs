import { WPTRunner } from './runner/runner/runner.mjs'
import { once } from 'events'

const runner = new WPTRunner('xhr/formdata', 'http://localhost:3333')
runner.run()

await once(runner, 'completion')
