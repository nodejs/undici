import { expectAssignable } from 'tsd'
import { Dispatcher, request } from '../..'

// request
expectAssignable<Promise<Dispatcher.ResponseData>>(request(''))
expectAssignable<Promise<Dispatcher.ResponseData>>(request('', { }))
expectAssignable<Promise<Dispatcher.ResponseData>>(request('', { method: 'GET', reset: false }))
