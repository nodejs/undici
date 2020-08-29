import { expectAssignable } from 'tsd'
import Undici, { Pool, Client } from '../..'

expectAssignable<Pool>(Undici('', {}))
expectAssignable<Pool>(new Undici.Pool('', {}))
expectAssignable<Client>(new Undici.Client('', {}))
