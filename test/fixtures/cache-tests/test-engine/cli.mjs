import { runTests, getResults } from './client/runner.mjs'
import { determineTestResult } from './lib/results.mjs'
import { GREEN, NC } from './lib/defines.mjs'
import tests from '../tests/index.mjs'

const baseUrl = process.env.npm_config_base || process.env.npm_package_config_base
const testId = process.env.npm_config_id || process.env.npm_package_config_id

let testsToRun
if (testId !== '') {
  console.log(`Running ${testId}`)
  tests.forEach(suite => {
    suite.tests.forEach(test => {
      if (test.id === testId) {
        test.dump = true
        testsToRun = [{
          name: suite.name,
          id: suite.id,
          description: suite.description,
          tests: [test]
        }]
      }
    })
  })
} else {
  testsToRun = tests
}

await runTests(testsToRun, false, baseUrl).catch(err => {
  console.error(err)
  process.exit(1)
})

const results = getResults()

if (testId !== '') {
  console.log(`${GREEN}==== Results${NC}`)
  const resultSymbol = determineTestResult(tests, testId, results, false)
  const resultDetails = results[testId][1] || ''
  console.log(`${resultSymbol[2]} - ${resultDetails}`)
} else {
  console.log(JSON.stringify(results, null, 2))
}
