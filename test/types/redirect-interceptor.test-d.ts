import { expectAssignable, expectNotAssignable } from 'tsd'
import Interceptors from '../../types/interceptors'

expectAssignable<Interceptors.RedirectInterceptorOpts>({})
expectAssignable<Interceptors.RedirectInterceptorOpts>({ maxRedirections: 3 })
expectAssignable<Interceptors.RedirectInterceptorOpts>({ throwOnMaxRedirect: true })
expectAssignable<Interceptors.RedirectInterceptorOpts>({ maxRedirections: 3, throwOnMaxRedirect: true })
expectAssignable<Interceptors.RedirectInterceptorOpts>({ stripHeadersOnRedirect: ['x-custom'] })
expectAssignable<Interceptors.RedirectInterceptorOpts>({ maxRedirections: 3, stripHeadersOnRedirect: ['x-custom'] })
expectAssignable<Interceptors.RedirectInterceptorOpts>({ stripHeadersOnCrossOriginRedirect: ['x-custom'] })
expectAssignable<Interceptors.RedirectInterceptorOpts>({ maxRedirections: 3, stripHeadersOnCrossOriginRedirect: ['x-custom'] })

expectNotAssignable<Interceptors.RedirectInterceptorOpts>({ maxRedirections: 'INVALID' })
expectNotAssignable<Interceptors.RedirectInterceptorOpts>({ throwOnMaxRedirect: 'INVALID' })
expectNotAssignable<Interceptors.RedirectInterceptorOpts>({ stripHeadersOnRedirect: 'INVALID' })
expectNotAssignable<Interceptors.RedirectInterceptorOpts>({ stripHeadersOnRedirect: [1] })
expectNotAssignable<Interceptors.RedirectInterceptorOpts>({ stripHeadersOnCrossOriginRedirect: 'INVALID' })
expectNotAssignable<Interceptors.RedirectInterceptorOpts>({ stripHeadersOnCrossOriginRedirect: [1] })
