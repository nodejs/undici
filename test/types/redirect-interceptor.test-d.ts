import { expectAssignable, expectNotAssignable } from 'tsd'
import Interceptors from '../../types/interceptors'

expectAssignable<Interceptors.RedirectInterceptorOpts>({})
expectAssignable<Interceptors.RedirectInterceptorOpts>({ maxRedirections: 3 })
expectAssignable<Interceptors.RedirectInterceptorOpts>({ throwOnMaxRedirect: true })
expectAssignable<Interceptors.RedirectInterceptorOpts>({ maxRedirections: 3, throwOnMaxRedirect: true })

expectNotAssignable<Interceptors.RedirectInterceptorOpts>({ maxRedirections: 'INVALID' })
expectNotAssignable<Interceptors.RedirectInterceptorOpts>({ throwOnMaxRedirect: 'INVALID' })
