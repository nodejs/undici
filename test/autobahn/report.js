'use strict'

const result = require('./reports/clients/index.json').undici

function testCaseIdToWeight (testCaseId) {
  const [major, minor, sub] = testCaseId.split('.')
  return sub
    ? parseInt(major, 10) * 10000 + parseInt(minor, 10) * 100 + parseInt(sub, 10)
    : parseInt(major, 10) * 10000 + parseInt(minor, 10) * 100
}

const keys = Object.keys(result).sort((a, b) => {
  a = testCaseIdToWeight(a)
  b = testCaseIdToWeight(b)
  return a - b
})

const reorderedResult = {}
for (const key of keys) {
  reorderedResult[key] = result[key]
}

console.table(reorderedResult)
