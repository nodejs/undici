'use strict'

const { Buffer } = require('node:buffer')
const { InvalidArgumentError } = require('./errors')

// Authentication method constants
const AUTH_METHODS = {
  NO_AUTH: 0x00,
  GSSAPI: 0x01,
  USERNAME_PASSWORD: 0x02,
  NO_ACCEPTABLE: 0xFF
}

// Username/Password auth version
const USERNAME_PASSWORD_VERSION = 0x01

/**
 * Build authentication methods selection message
 * @param {Array<number>} methods - Array of authentication method codes
 * @returns {Buffer} Authentication selection message
 */
function buildAuthMethodsMessage (methods) {
  if (!Array.isArray(methods) || methods.length === 0) {
    throw new InvalidArgumentError('At least one authentication method must be provided')
  }

  if (methods.length > 255) {
    throw new InvalidArgumentError('Too many authentication methods (max 255)')
  }

  const buffer = Buffer.allocUnsafe(2 + methods.length)
  buffer[0] = 0x05 // SOCKS version
  buffer[1] = methods.length

  for (let i = 0; i < methods.length; i++) {
    buffer[2 + i] = methods[i]
  }

  return buffer
}

/**
 * Parse authentication method selection response
 * @param {Buffer} buffer - Response buffer
 * @returns {{version: number, method: number}} Parsed response
 */
function parseAuthMethodResponse (buffer) {
  if (buffer.length < 2) {
    throw new InvalidArgumentError('Buffer too small for auth method response')
  }

  return {
    version: buffer[0],
    method: buffer[1]
  }
}

/**
 * Build username/password authentication request
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Buffer} Authentication request
 */
function buildUsernamePasswordAuth (username, password) {
  if (!username || !password) {
    throw new InvalidArgumentError('Username and password are required')
  }

  const usernameBuffer = Buffer.from(username, 'utf8')
  const passwordBuffer = Buffer.from(password, 'utf8')

  if (usernameBuffer.length > 255) {
    throw new InvalidArgumentError('Username too long (max 255 bytes)')
  }

  if (passwordBuffer.length > 255) {
    throw new InvalidArgumentError('Password too long (max 255 bytes)')
  }

  const buffer = Buffer.allocUnsafe(3 + usernameBuffer.length + passwordBuffer.length)
  let offset = 0

  // Version
  buffer[offset++] = USERNAME_PASSWORD_VERSION

  // Username
  buffer[offset++] = usernameBuffer.length
  usernameBuffer.copy(buffer, offset)
  offset += usernameBuffer.length

  // Password
  buffer[offset++] = passwordBuffer.length
  passwordBuffer.copy(buffer, offset)

  return buffer
}

/**
 * Parse username/password authentication response
 * @param {Buffer} buffer - Response buffer
 * @returns {{version: number, status: number}} Parsed response
 */
function parseUsernamePasswordResponse (buffer) {
  if (buffer.length < 2) {
    throw new InvalidArgumentError('Buffer too small for auth response')
  }

  return {
    version: buffer[0],
    status: buffer[1]
  }
}

/**
 * Determine which authentication methods to use based on options
 * @param {Object} options - Connection options
 * @returns {Array<number>} Array of authentication method codes
 */
function getAuthMethods (options) {
  const methods = []

  // Add username/password if provided
  if (options.username && options.password) {
    methods.push(AUTH_METHODS.USERNAME_PASSWORD)
  }

  // Always offer no authentication as fallback
  methods.push(AUTH_METHODS.NO_AUTH)

  return methods
}

/**
 * Check if authentication method is supported
 * @param {number} method - Authentication method code
 * @param {Object} options - Connection options
 * @returns {boolean} True if method is supported
 */
function isAuthMethodSupported (method, options) {
  switch (method) {
    case AUTH_METHODS.NO_AUTH:
      return true
    case AUTH_METHODS.USERNAME_PASSWORD:
      return !!(options.username && options.password)
    case AUTH_METHODS.GSSAPI:
      return false // Not implemented yet
    default:
      return false
  }
}

module.exports = {
  AUTH_METHODS,
  USERNAME_PASSWORD_VERSION,
  buildAuthMethodsMessage,
  parseAuthMethodResponse,
  buildUsernamePasswordAuth,
  parseUsernamePasswordResponse,
  getAuthMethods,
  isAuthMethodSupported
}
