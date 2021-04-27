'use strict'

const t = require('tap')
const { test } = t

const errors = require('../lib/core/errors')

const createScenario = (ErrorClass, defaultMessage, name, code) => ({
  ErrorClass,
  defaultMessage,
  name,
  code
})

const scenarios = [
  createScenario(errors.UndiciError, '', 'UndiciError', 'UND_ERR'),
  createScenario(errors.ConnectTimeoutError, 'Connect Timeout Error', 'ConnectTimeoutError', 'UND_ERR_CONNECT_TIMEOUT'),
  createScenario(errors.HeadersTimeoutError, 'Headers Timeout Error', 'HeadersTimeoutError', 'UND_ERR_HEADERS_TIMEOUT'),
  createScenario(errors.HeadersOverflowError, 'Headers Overflow Error', 'HeadersOverflowError', 'UND_ERR_HEADERS_OVERFLOW'),
  createScenario(errors.InvalidArgumentError, 'Invalid Argument Error', 'InvalidArgumentError', 'UND_ERR_INVALID_ARG'),
  createScenario(errors.InvalidReturnValueError, 'Invalid Return Value Error', 'InvalidReturnValueError', 'UND_ERR_INVALID_RETURN_VALUE'),
  createScenario(errors.RequestAbortedError, 'Request aborted', 'RequestAbortedError', 'UND_ERR_ABORTED'),
  createScenario(errors.InformationalError, 'Request information', 'InformationalError', 'UND_ERR_INFO'),
  createScenario(errors.RequestContentLengthMismatchError, 'Request body length does not match content-length header', 'RequestContentLengthMismatchError', 'UND_ERR_CONTENT_LENGTH_MISMATCH'),
  createScenario(errors.TrailerMismatchError, 'Trailers does not match trailer header', 'TrailerMismatchError', 'UND_ERR_TRAILER_MISMATCH'),
  createScenario(errors.ClientDestroyedError, 'The client is destroyed', 'ClientDestroyedError', 'UND_ERR_DESTROYED'),
  createScenario(errors.ClientClosedError, 'The client is closed', 'ClientClosedError', 'UND_ERR_CLOSED'),
  createScenario(errors.SocketError, 'Socket error', 'SocketError', 'UND_ERR_SOCKET'),
  createScenario(errors.NotSupportedError, 'Not supported error', 'NotSupportedError', 'UND_ERR_NOT_SUPPORTED')
]

scenarios.forEach(scenario => {
  test(scenario.name, t => {
    const SAMPLE_MESSAGE = 'sample message'

    const errorWithDefaultMessage = () => new scenario.ErrorClass()
    const errorWithProvidedMessage = () => new scenario.ErrorClass(SAMPLE_MESSAGE)

    test('should use default message', t => {
      t.plan(1)

      const error = errorWithDefaultMessage()

      t.equal(error.message, scenario.defaultMessage)
    })

    test('should use provided message', t => {
      t.plan(1)

      const error = errorWithProvidedMessage()

      t.equal(error.message, SAMPLE_MESSAGE)
    })

    test('should have proper fields', t => {
      t.plan(6)
      const errorInstances = [errorWithDefaultMessage(), errorWithProvidedMessage()]
      errorInstances.forEach(error => {
        t.equal(error.name, scenario.name)
        t.equal(error.code, scenario.code)
        t.ok(error.stack)
      })
    })

    t.end()
  })
})
