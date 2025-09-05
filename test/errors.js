'use strict'

const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tspl } = require('@matteo.collina/tspl')
const { describe, test } = require('node:test')
const typescript = require('typescript')

const errors = require('../lib/core/errors')

const createScenario = (ErrorClass, defaultMessage, name, code) => {
  return {
    ErrorClass,
    defaultMessage,
    name,
    code
  }
}

const scenarios = [
  createScenario(errors.UndiciError, '', 'UndiciError', 'UND_ERR'),
  createScenario(errors.AbortError, 'The operation was aborted', 'AbortError', 'UND_ERR_ABORT'),
  createScenario(errors.BalancedPoolMissingUpstreamError, 'No upstream has been added to the BalancedPool', 'BalancedPoolMissingUpstreamError', 'UND_ERR_BPL_MISSING_UPSTREAM'),
  createScenario(errors.BodyTimeoutError, 'Body Timeout Error', 'BodyTimeoutError', 'UND_ERR_BODY_TIMEOUT'),
  createScenario(errors.ClientClosedError, 'The client is closed', 'ClientClosedError', 'UND_ERR_CLOSED'),
  createScenario(errors.ClientDestroyedError, 'The client is destroyed', 'ClientDestroyedError', 'UND_ERR_DESTROYED'),
  createScenario(errors.ConnectTimeoutError, 'Connect Timeout Error', 'ConnectTimeoutError', 'UND_ERR_CONNECT_TIMEOUT'),
  createScenario(errors.HeadersOverflowError, 'Headers Overflow Error', 'HeadersOverflowError', 'UND_ERR_HEADERS_OVERFLOW'),
  createScenario(errors.HeadersTimeoutError, 'Headers Timeout Error', 'HeadersTimeoutError', 'UND_ERR_HEADERS_TIMEOUT'),
  createScenario(errors.HTTPParserError, '', 'HTTPParserError', undefined),
  createScenario(errors.InformationalError, 'Request information', 'InformationalError', 'UND_ERR_INFO'),
  createScenario(errors.InvalidArgumentError, 'Invalid Argument Error', 'InvalidArgumentError', 'UND_ERR_INVALID_ARG'),
  createScenario(errors.InvalidReturnValueError, 'Invalid Return Value Error', 'InvalidReturnValueError', 'UND_ERR_INVALID_RETURN_VALUE'),
  createScenario(errors.MaxOriginsReachedError, 'Maximum allowed origins reached', 'MaxOriginsReachedError', 'UND_ERR_MAX_ORIGINS_REACHED'),
  createScenario(errors.NotSupportedError, 'Not supported error', 'NotSupportedError', 'UND_ERR_NOT_SUPPORTED'),
  createScenario(errors.RequestAbortedError, 'Request aborted', 'RequestAbortedError', 'UND_ERR_REQUEST_ABORTED'),
  createScenario(errors.RequestContentLengthMismatchError, 'Request body length does not match content-length header', 'RequestContentLengthMismatchError', 'UND_ERR_REQ_CONTENT_LENGTH_MISMATCH'),
  createScenario(errors.RequestRetryError, 'Request retry error', 'RequestRetryError', 'UND_ERR_REQ_RETRY'),
  createScenario(errors.ResponseContentLengthMismatchError, 'Response body length does not match content-length header', 'ResponseContentLengthMismatchError', 'UND_ERR_RES_CONTENT_LENGTH_MISMATCH'),
  createScenario(errors.ResponseError, 'Response error', 'ResponseError', 'UND_ERR_RESPONSE'),
  createScenario(errors.ResponseExceededMaxSizeError, 'Response content exceeded max size', 'ResponseExceededMaxSizeError', 'UND_ERR_RES_EXCEEDED_MAX_SIZE'),
  createScenario(errors.SecureProxyConnectionError, 'Secure Proxy Connection failed', 'SecureProxyConnectionError', 'UND_ERR_PRX_TLS'),
  createScenario(errors.SocketError, 'Socket error', 'SocketError', 'UND_ERR_SOCKET')
]

assert.strictEqual(scenarios.length, Object.keys(errors).length)

// Read Errors.md and extract the table of errors
const errorsMd = fs.readFileSync(path.resolve(__dirname, '..', 'docs', 'docs', 'api', 'Errors.md'), 'utf8')
const errorsMdTableHead = '| ------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------- |'
const errorsMdTableStart = errorsMd.indexOf(errorsMdTableHead)
assert.notStrictEqual(errorsMdTableStart, -1)
const errorsMdTableEnd = errorsMd.indexOf('\n\n', errorsMdTableStart)
assert.notStrictEqual(errorsMdTableEnd, -1)
const errorsTable = errorsMd.slice(errorsMdTableStart + errorsMdTableHead.length + 1, errorsMdTableEnd).split('\n')

assert.strictEqual(errorsTable.length, scenarios.length, 'Errors.md should not have more or less documented errors than actual errors')

// Read errors.d.ts and parse it with TypeScript
const errorsDts = fs.readFileSync(path.resolve(__dirname, '..', 'types', 'errors.d.ts'), 'utf8')
const errorsSourceFile = typescript.createSourceFile('errors.d.ts', errorsDts, typescript.ScriptTarget.ES2015, /* setParentNodes */ true)
assert.strictEqual([...errorsSourceFile.identifiers.values()].filter(v => v.endsWith('Error') && v !== 'Error').length, scenarios.length, 'errors.d.ts should not have more or less declared errors than actual errors')

for (const { name, ErrorClass, defaultMessage, code } of scenarios) {
  describe(name, () => {
    test('should use default message', t => {
      t = tspl(t, { plan: 1 })

      t.strictEqual(new ErrorClass().message, defaultMessage)
    })

    test('should use provided message', t => {
      t = tspl(t, { plan: 1 })

      t.strictEqual(new ErrorClass('sample message').message, 'sample message')
    })

    test('should have proper fields', t => {
      t = tspl(t, { plan: 6 })
      const errorInstances = [new ErrorClass(), new ErrorClass('sample message')]
      errorInstances.forEach(error => {
        t.strictEqual(error.name, name, `name should be ${name}`)
        t.strictEqual(error.code, code, `code should be ${code}`)
        t.ok(error.stack)
      })
    })

    test('should be instance of Error', t => {
      t = tspl(t, { plan: 1 })

      t.ok(new ErrorClass() instanceof Error)
    })

    test('should be instance of UndiciError', t => {
      t = tspl(t, { plan: 1 })

      t.ok(new ErrorClass() instanceof errors.UndiciError)
    })

    test('Error-specific-Symbol should not be on the Error-Instance and not be enumerable', t => {
      t = tspl(t, { plan: 3 })

      const ErrorSymbol = name === 'HTTPParserError'
        ? Symbol.for('undici.error.UND_ERR_HTTP_PARSER')
        : Symbol.for(`undici.error.${code}`)

      t.strictEqual(new ErrorClass()[Symbol.for('undici.error.UND_ERR')], true)
      t.strictEqual(new ErrorClass()[ErrorSymbol], true)
      t.strictEqual(Object.getOwnPropertySymbols(new ErrorClass()).includes(ErrorSymbol), false)
    })

    test('should be documented in Errors.md', t => {
      t = tspl(t, { plan: 2 })

      const errorsTableEntry = errorsTable.find(line => line.includes(`| \`${name}\` `))
      t.ok(errorsTableEntry, `${name} should be documented in Errors.md`)
      const documentedCode = code !== undefined
        ? `| \`${code}\` `
        : '|                                       |'
      t.ok(errorsTableEntry.includes(documentedCode), `${name} should have code ${code} documented in Errors.md`)

      // remove the entry so that we can check at the end if there are undocumented errors
      const index = errorsTable.indexOf(errorsTableEntry)
      errorsTable.splice(index, 1)
    })

    test('should be declared in errors.d.ts', t => {
      t = tspl(t, { plan: 4 })

      t.strictEqual(errorsSourceFile.identifiers.get(name), name, `${name} should be declared in errors.d.ts`)

      // check if it extends UndiciError, has correct name property and code property
      let extendsUndiciError = false
      let typeNameValue
      let typeCodeValue

      function visit (node) {
        if (typescript.isClassDeclaration(node) &&
          node.name?.text === name) {
          // Check inheritance
          if (node.heritageClauses) {
            for (const heritageClause of node.heritageClauses) {
              if (heritageClause.token === typescript.SyntaxKind.ExtendsKeyword) {
                for (const type of heritageClause.types) {
                  if (typescript.isIdentifier(type.expression) &&
                    type.expression.text === 'UndiciError') {
                    extendsUndiciError = true
                  }
                }
              }
            }
          }

          // Check properties
          if (node.members) {
            for (const member of node.members) {
              if (typescript.isPropertyDeclaration(member) &&
                member.name &&
                typescript.isIdentifier(member.name)) {
                const propertyName = member.name.text

                // Check name property
                if (propertyName === 'name' && member.type) {
                  if (typescript.isLiteralTypeNode(member.type) &&
                    typescript.isStringLiteral(member.type.literal)) {
                    typeNameValue = member.type.literal.text
                  }
                }

                // Check code property (if code is defined for this error)
                if (propertyName === 'code' && member.type && code !== undefined) {
                  if (typescript.isLiteralTypeNode(member.type) &&
                    typescript.isStringLiteral(member.type.literal)) {
                    typeCodeValue = member.type.literal.text
                  }
                }
              }
            }
          }
        }

        typescript.forEachChild(node, visit)
      }

      visit(errorsSourceFile)

      if (name === 'UndiciError') {
        t.strictEqual(extendsUndiciError, false, 'UndiciError does not extend itself')
        t.strictEqual(typeNameValue, undefined, 'UndiciError should not have specific name property in errors.d.ts')
        t.strictEqual(typeCodeValue, undefined, 'UndiciError should not have specific code property in errors.d.ts')
      } else {
        t.strictEqual(extendsUndiciError, true, `${name} should extend UndiciError in errors.d.ts`)
        t.strictEqual(typeNameValue, name, `${name} should have '${name}' as name but got '${typeNameValue}' in errors.d.ts`)
        t.strictEqual(typeCodeValue, code, `${name} should have ${code}' as code property but got '${typeCodeValue}' in errors.d.ts`)
      }
    })
  })
}

describe('Default HTTPParseError Codes', () => {
  test('code and data should be undefined when not set', t => {
    t = tspl(t, { plan: 2 })

    const error = new errors.HTTPParserError('HTTPParserError')

    t.strictEqual(error.code, undefined)
    t.strictEqual(error.data, undefined)
  })
})

describe('SecureProxyConnectionError constructor should be backwards compatible', () => {
  test('message is first and cause is second parameter', t => {
    t = tspl(t, { plan: 2 })

    const message = 'message'
    const cause = new Error('cause error')
    const error = new errors.SecureProxyConnectionError(message, cause)

    t.strictEqual(error.cause, cause)
    t.strictEqual(error.message, 'message')
  })

  test('cause is first and message is second parameter', t => {
    t = tspl(t, { plan: 2 })

    const message = 'message'
    const cause = new Error('cause error')
    const error = new errors.SecureProxyConnectionError(cause, message)

    t.strictEqual(error.cause, cause)
    t.strictEqual(error.message, 'message')
  })
})
