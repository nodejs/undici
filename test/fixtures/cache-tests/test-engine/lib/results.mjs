export const resultTypes = {
  untested: ['-', '', '-'],
  pass: ['\uf058', '#1aa123', '✅'],
  fail: ['\uf057', '#c33131', '⛔️'],
  optional_fail: ['\uf05a', '#bbbd15', '⚠️'],
  yes: ['\uf055', '#999696', 'Y'],
  no: ['\uf056', '#999696', 'N'],
  setup_fail: ['\uf059', '#4c61ae', '🔹'],
  harness_fail: ['\uf06a', '#4c61ae', '⁉️'],
  dependency_fail: ['\uf192', '#b4b2b2', '⚪️'],
  retry: ['\uf01e', '#4c61ae', '↻']
}
const passTypes = [resultTypes.pass, resultTypes.yes]

export function determineTestResult (testSuites, testId, testResults, honorDependencies = true) {
  const test = testLookup(testSuites, testId)
  const result = testResults[testId]
  if (result === undefined) {
    return resultTypes.untested
  }
  if (honorDependencies && test.depends_on !== undefined) {
    for (const dependencyId of test.depends_on) {
      if (!passTypes.includes(determineTestResult(testSuites, dependencyId, testResults))) {
        return resultTypes.dependency_fail
      }
    }
  }
  if (result[0] === 'Setup') {
    if (result[1] === 'retry') {
      return resultTypes.retry
    } else {
      return resultTypes.setup_fail
    }
  }
  if (result === false && result[0] !== 'Assertion') {
    return resultTypes.harness_fail
  }
  if (result[0] === 'AbortError') {
    return resultTypes.harness_fail
  }
  if (test.kind === 'required' || test.kind === undefined) {
    if (result === true) {
      return resultTypes.pass
    } else {
      return resultTypes.fail
    }
  } else if (test.kind === 'optimal') {
    if (result === true) {
      return resultTypes.pass
    } else {
      return resultTypes.optional_fail
    }
  } else if (test.kind === 'check') {
    if (result === true) {
      return resultTypes.yes
    } else {
      return resultTypes.no
    }
  } else {
    throw new Error(`Unrecognised test kind ${test.kind}`)
  }
}

export function testLookup (testSuites, testId) {
  for (const testSuite of testSuites) {
    for (const test of testSuite.tests) {
      if (test.id === testId) {
        return test
      }
    }
  }
  throw new Error(`Cannot find test ${testId}`)
}
