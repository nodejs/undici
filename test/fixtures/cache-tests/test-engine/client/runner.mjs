import * as config from './config.mjs'
import { makeTest, testResults } from './test.mjs'

export async function runTests (tests, browserCache, base, chunkSize = 25) {
  config.setBaseUrl(base)
  config.setUseBrowserCache(browserCache)

  const testArray = []
  tests.forEach(testSet => {
    testSet.tests.forEach(test => {
      if (test.id === undefined) throw new Error('Missing test id')
      if (test.browser_only === true && !config.useBrowserCache === true) return
      if (test.cdn_only === true && config.useBrowserCache === true) return
      // note: still runs cdn tests on rev-proxy
      if (test.browser_skip === true && config.useBrowserCache === true) return
      testArray.push(test)
    })
  })
  return runSome(testArray, chunkSize)
}

export function getResults () {
  const ordered = {}
  Object.keys(testResults).sort().forEach(key => {
    ordered[key] = testResults[key]
  })
  return ordered
}

async function runSome (tests, chunkSize) {
  let index = 0
  function next () {
    if (index < tests.length) {
      const these = tests.slice(index, index + chunkSize).map(makeTest)
      index += chunkSize
      return Promise.all(these).then(next)
    }
  }
  return next()
}
