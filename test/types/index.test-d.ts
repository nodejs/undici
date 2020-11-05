import { expectAssignable } from 'tsd'
import Undici, { Pool, Client, Errors } from '../..'

expectAssignable<Pool>(Undici('', {}))
expectAssignable<Pool>(new Undici.Pool('', {}))
expectAssignable<Client>(new Undici.Client('', {}))
expectAssignable<typeof Errors>(Undici.errors)
