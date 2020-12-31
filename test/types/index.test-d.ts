import { expectAssignable } from 'tsd'
import Undici, { Pool, Client, errors } from '../..'

expectAssignable<Pool>(Undici('', {}))
expectAssignable<Pool>(new Undici.Pool('', {}))
expectAssignable<Client>(new Undici.Client('', {}))
expectAssignable<typeof errors>(Undici.errors)
