'use strict'

const result = require('./reports/clients/index.json').undici

const failOnError = process.env.FAIL_ON_ERROR === 'true'
const reporter = process.env.REPORTER || 'table'
let runFailed = false

let okTests = 0
let failedTests = 0
let nonStrictTests = 0
let wrongCodeTests = 0
let uncleanTests = 0
let failedByClientTests = 0
let informationalTests = 0
let unimplementedTests = 0

let totalTests = 0

function testCaseIdToWeight (testCaseId) {
  const [major, minor, sub] = testCaseId.split('.')
  return sub
    ? parseInt(major, 10) * 10000 + parseInt(minor, 10) * 100 + parseInt(sub, 10)
    : parseInt(major, 10) * 10000 + parseInt(minor, 10) * 100
}

function isFailedTestCase (testCase) {
  return (
    testCase.behavior === 'FAILED' ||
    testCase.behavior === 'WRONG CODE' ||
    testCase.behavior === 'UNCLEAN' ||
    testCase.behavior === 'FAILED BY CLIENT' ||
    testCase.behaviorClose === 'FAILED' ||
    testCase.behaviorClose === 'WRONG CODE' ||
    testCase.behaviorClose === 'UNCLEAN' ||
    testCase.behaviorClose === 'FAILED BY CLIENT'
  )
}

const keys = Object.keys(result).sort((a, b) => {
  a = testCaseIdToWeight(a)
  b = testCaseIdToWeight(b)
  return a - b
})

const reorderedResult = {}
for (const key of keys) {
  reorderedResult[key] = result[key]
  delete reorderedResult[key].reportfile

  totalTests++

  if (
    failOnError &&
    !runFailed &&
    isFailedTestCase(result[key])
  ) {
    runFailed = true
  }

  switch (result[key].behavior) {
    case 'OK':
      okTests++
      break
    case 'FAILED':
      failedTests++
      break
    case 'NON-STRICT':
      nonStrictTests++
      break
    case 'WRONG CODE':
      wrongCodeTests++
      break
    case 'UNCLEAN':
      uncleanTests++
      break
    case 'FAILED BY CLIENT':
      failedByClientTests++
      break
    case 'INFORMATIONAL':
      informationalTests++
      break
    case 'UNIMPLEMENTED':
      unimplementedTests++
      break
  }
}

if (
  reporter === 'table'
) {
  console.log('Autobahn Test Report\n\nSummary:')

  console.table({
    OK: okTests,
    Failed: failedTests,
    'Non-Strict': nonStrictTests,
    'Wrong Code': wrongCodeTests,
    Unclean: uncleanTests,
    'Failed By Client': failedByClientTests,
    Informational: informationalTests,
    Unimplemented: unimplementedTests,
    'Total Tests': totalTests
  })

  console.log('Details:')

  console.table(reorderedResult)
}

if (reporter === 'markdown') {
  console.log(`## Autobahn Test Report

### Summary

| Type | Count |
|---|---|
| OK | ${okTests} |
| Failed | ${failedTests} |
| Non-Strict | ${nonStrictTests} |
| Wrong Code | ${wrongCodeTests} |
| Unclean | ${uncleanTests} |
| Failed By Client | ${failedByClientTests} |
| Informational | ${informationalTests} |
| Unimplemented | ${unimplementedTests} |
| Total Tests | ${totalTests} |

<details>
<summary>Details</summary>

| Test Case | Behavior | Close Behavior | Duration | Remote Close Code |
|---|---|---|---|---|
${keys.map(key => {
  const testCase = reorderedResult[key]
  return `| ${key} | ${testCase.behavior} | ${testCase.behaviorClose} | ${testCase.duration} | ${testCase.remoteCloseCode} |`
}).join('\n')}

</details>
`)
}

process.exit(runFailed ? 1 : 0)
