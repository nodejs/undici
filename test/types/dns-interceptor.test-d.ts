import { expectAssignable, expectNotAssignable } from 'tsd'
import { LookupOptions } from 'node:dns'
import Interceptors from '../../types/interceptors'

const storage: Interceptors.DNSStorage = {
  get size (): number {
    throw new Error('stub')
  },
  get (origin: string): Interceptors.DNSInterceptorOriginRecords | null {
    throw new Error('stub')
  },
  set (origin: string, records: Interceptors.DNSInterceptorOriginRecords | null, options: { ttl: number }): void {
    throw new Error('stub')
  },
  delete (origin: string): void {
    throw new Error('stub')
  },
  full (): boolean {
    throw new Error('stub')
  }
}

const lookup: Interceptors.DNSInterceptorOpts['lookup'] = (origin: URL, options: LookupOptions, callback: (err: NodeJS.ErrnoException | null, addresses: Interceptors.DNSInterceptorRecord[]) => void): void => {
  throw new Error('stub')
}

const pick: Interceptors.DNSInterceptorOpts['pick'] = (origin: URL, records: Interceptors.DNSInterceptorOriginRecords, affinity: 4 | 6): Interceptors.DNSInterceptorRecord => {
  throw new Error('stub')
}

expectAssignable<Interceptors.DNSInterceptorOpts>({})
expectAssignable<Interceptors.DNSInterceptorOpts>({ storage })
expectAssignable<Interceptors.DNSInterceptorOpts>({ maxTTL: 1000 })
expectAssignable<Interceptors.DNSInterceptorOpts>({ maxItems: 1000 })
expectAssignable<Interceptors.DNSInterceptorOpts>({ dualStack: true })
expectAssignable<Interceptors.DNSInterceptorOpts>({ affinity: 4 })
expectAssignable<Interceptors.DNSInterceptorOpts>({ lookup })
expectAssignable<Interceptors.DNSInterceptorOpts>({ pick })

expectAssignable<Interceptors.DNSInterceptorRecord>({ address: '127.0.0.1', ttl: 300, family: 4 })

expectAssignable<Interceptors.DNSInterceptorOriginRecords>({ records: { 4: { ips: [{ address: '127.0.0.1', ttl: 300, family: 4 }] }, 6: null } })

expectNotAssignable<Interceptors.DNSInterceptorOpts>({ storage: new Map() })
expectNotAssignable<Interceptors.DNSInterceptorOpts>({
  lookup: (origin: string) => {
    throw new Error('stub')
  }
})
expectNotAssignable<Interceptors.DNSInterceptorOpts>({
  pick: (origin: string) => {
    throw new Error('stub')
  }
})

expectNotAssignable<Interceptors.DNSInterceptorRecord>({})

expectNotAssignable<Interceptors.DNSInterceptorOriginRecords>({ 4: { ips: [{ address: '127.0.0.1', ttl: 300, family: 4 }] }, 6: null })
