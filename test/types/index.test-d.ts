import { expectAssignable } from 'tsd'
import Undici, { Pool, Client, errors, fetch } from '../..'

expectAssignable<Pool>(Undici('', {}))
expectAssignable<Pool>(new Undici.Pool('', {}))
expectAssignable<Client>(new Undici.Client('', {}))
expectAssignable<typeof errors>(Undici.errors)
expectAssignable<typeof fetch>(Undici.fetch)