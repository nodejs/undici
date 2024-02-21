import { expectAssignable, expectType } from 'tsd'
import { DNSResolver } from '../..'
import { LookupAddress } from 'dns'

type LookupResponse = Promise<DNSResolver.LookupAddress[] | DNSResolver.LookupAddress>

// constructor
expectAssignable<DNSResolver>(new DNSResolver())
expectAssignable<DNSResolver>(new DNSResolver({
  maxTtl: 0,
  cache: new Map(),
  fallbackDuration: 100,
  errorTtl: 10,
  scheduling: 'random',
  lookupOptions: {
    family: 4,
  }
}))
expectAssignable<DNSResolver>(new DNSResolver({
  maxTtl: 0,
  fallbackDuration: 100,
  errorTtl: 10,
}))
expectAssignable<DNSResolver>(new DNSResolver({
  maxTtl: 0,
  cache: new Map(),
  fallbackDuration: 100,
  errorTtl: 10,
  scheduling: 'random',
}))

{
  const dnsResolver = new DNSResolver()

  // lookup
  expectAssignable<void>(dnsResolver.lookup('localhost', (err, address, family, ttl, expires) => {
    expectAssignable<Error | null>(err)
    expectAssignable<string>(address)
    expectAssignable<number>(family)
    expectAssignable<number>(ttl)
    expectAssignable<number>(expires)
  }))
  expectAssignable<void>(dnsResolver.lookup('localhost', { family: 6 }, (err, address, family, ttl, expires) => {
    expectAssignable<Error | null>(err)
    expectAssignable<string>(address)
    expectAssignable<number>(family)
    expectAssignable<number>(ttl)
    expectAssignable<number>(expires)
  }))
  expectAssignable<void>(dnsResolver.lookup('localhost', 4, (err, address, family, ttl, expires) => {
    expectAssignable<Error | null>(err)
    expectAssignable<string>(address)
    expectAssignable<number>(family)
    expectAssignable<number>(ttl)
    expectAssignable<number>(expires)
  }))
  expectAssignable<void>(dnsResolver.lookup('localhost', { all: true }, (err, entries) => {
    expectAssignable<Error | null>(err)
    expectAssignable<LookupAddress[]>(entries)
  }))

  // lookupAsync
  expectAssignable<LookupResponse>(dnsResolver.lookupAsync('localhost', 4))
  expectAssignable<Promise<DNSResolver.LookupAddress[] | DNSResolver.LookupAddress>>(dnsResolver.lookupAsync('localhost', { family: 6 }))

  // query and cache
  expectAssignable<LookupResponse>(dnsResolver.query('localhost'))
  expectAssignable<LookupResponse>(dnsResolver.queryAndCache('localhost'))

  // other utils
  expectAssignable<string[]>(dnsResolver.servers = ['0.0.0.0'])
  expectAssignable<void>(dnsResolver.updateInterfaceInfo())
  expectAssignable<void>(dnsResolver.clear())
}
