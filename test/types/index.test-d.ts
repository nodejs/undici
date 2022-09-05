import { expectAssignable } from 'tsd'
import Undici, {Pool, Client, errors, fetch, Interceptable, RedirectHandler, DecoratorHandler} from '../..'

expectAssignable<Pool>(Undici('', {}))
expectAssignable<Pool>(new Undici.Pool('', {}))
expectAssignable<Client>(new Undici.Client('', {}))
expectAssignable<Interceptable>(new Undici.MockAgent().get(''))
expectAssignable<typeof errors>(Undici.errors)
expectAssignable<typeof fetch>(Undici.fetch)

const client = new Undici.Client('', {})
expectAssignable<RedirectHandler>(new Undici.RedirectHandler(client, 10, {}, client))
expectAssignable<DecoratorHandler>(new Undici.DecoratorHandler(client))
