'use strict'

// We include a version number for the DNSResolver. In case of breaking changes,
// this version number must be increased to avoid conflicts.
const globalDNSResolver = Symbol.for('undici.globalDNSResolver.1')
const { InvalidArgumentError } = require('./core/errors')
const DNSResolver = require('./dns-resolver')

if (getGlobalDNSResolver() === undefined) {
  setGlobalDNSResolver(new DNSResolver())
}

function getGlobalDNSResolver () {
  return globalThis[globalDNSResolver]
}

function setGlobalDNSResolver (dnsResolver) {
  if (!dnsResolver || typeof dnsResolver.lookup !== 'function') {
    throw new InvalidArgumentError('Argument dnsResolver must implement DNSResolver')
  }
  Object.defineProperty(globalThis, globalDNSResolver, {
    value: dnsResolver,
    writable: true,
    enumerable: false,
    configurable: false
  })
}

module.exports = {
  setGlobalDNSResolver,
  getGlobalDNSResolver
}
