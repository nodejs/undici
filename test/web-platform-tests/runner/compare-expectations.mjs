import * as jsondiffpatch from 'jsondiffpatch'

const jsondiff = jsondiffpatch.create()

function projectCase (testCase) {
  if (testCase === null || typeof testCase !== 'object' || Array.isArray(testCase)) {
    return testCase
  }

  return Object.hasOwn(testCase, 'success') ? { success: testCase.success } : {}
}

function projectOutcomes (node) {
  if (node === null || typeof node !== 'object') {
    return node
  }

  if (Array.isArray(node)) {
    return node.map(projectOutcomes)
  }

  if (Array.isArray(node.cases)) {
    const file = { cases: node.cases.map(projectCase) }
    if (Object.hasOwn(node, 'success')) {
      file.success = node.success
    }
    return file
  }

  return Object.fromEntries(
    Object.entries(node).map(([path, value]) => [path, projectOutcomes(value)])
  )
}

export function diffExpectations (before, after) {
  return jsondiff.diff(projectOutcomes(before), projectOutcomes(after))
}
