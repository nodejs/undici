import { expectAssignable } from 'tsd'
import Undici, {Pool, Client, errors, fetch, Interceptable, RedirectHandler, DecoratorHandler, Headers, Response, Request, FormData, File, FileReader} from '../..'
import Dispatcher from "../../types/dispatcher";

expectAssignable<Pool>(new Undici.Pool('', {}))
expectAssignable<Client>(new Undici.Client('', {}))
expectAssignable<Interceptable>(new Undici.MockAgent().get(''))
expectAssignable<typeof errors>(Undici.errors)
expectAssignable<typeof fetch>(Undici.fetch)
expectAssignable<typeof Headers>(Undici.Headers)
expectAssignable<typeof Response>(Undici.Response)
expectAssignable<typeof Request>(Undici.Request)
expectAssignable<typeof FormData>(Undici.FormData)
expectAssignable<typeof File>(Undici.File)
expectAssignable<typeof FileReader>(Undici.FileReader)
expectAssignable<Dispatcher.DispatcherComposeInterceptor>(Undici.interceptors.dump())
expectAssignable<Dispatcher.DispatcherComposeInterceptor>(Undici.interceptors.redirect())
expectAssignable<Dispatcher.DispatcherComposeInterceptor>(Undici.interceptors.retry())

const client = new Undici.Client('', {})
const handler: Dispatcher.DispatchHandlers =  {}

const redirectHandler = new Undici.RedirectHandler(client, 10, {
  path: '/', method: 'GET'
}, handler, false) as RedirectHandler;
expectAssignable<RedirectHandler>(redirectHandler);
