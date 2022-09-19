import { expectAssignable } from 'tsd'
import Undici, {Pool, Client, errors, fetch, Interceptable, RedirectHandler, DecoratorHandler} from '../..'
import Dispatcher from "../../types/dispatcher";

expectAssignable<Pool>(new Undici.Pool('', {}))
expectAssignable<Client>(new Undici.Client('', {}))
expectAssignable<Interceptable>(new Undici.MockAgent().get(''))
expectAssignable<typeof errors>(Undici.errors)
expectAssignable<typeof fetch>(Undici.fetch)

const client = new Undici.Client('', {})
const handler: Dispatcher.DispatchHandlers =  {}

expectAssignable<RedirectHandler>(new Undici.RedirectHandler(client, 10, {
  path: '/', method: 'GET'
}, handler))
expectAssignable<DecoratorHandler>(new Undici.DecoratorHandler(handler))
