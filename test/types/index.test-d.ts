import { expectAssignable } from 'tsd'
import Undici, { Pool, Client, errors, fetch, Interceptable } from '../..'

expectAssignable<Pool>(Undici('', {}))
expectAssignable<Pool>(new Undici.Pool('', {}))
expectAssignable<Client>(new Undici.Client('', {}))
expectAssignable<Interceptable>(new Undici.MockAgent().get(''))
expectAssignable<typeof errors>(Undici.errors)
expectAssignable<typeof fetch>(Undici.fetch)
