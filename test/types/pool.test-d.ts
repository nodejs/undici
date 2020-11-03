import { expectAssignable } from 'tsd'
import { Client, Pool, Errors } from '../..'

expectAssignable<Pool>(new Pool('', {}))

expectAssignable<PromiseLike<Client.ResponseData>>(new Pool('', {}).request({ path: '', method: '' }))
expectAssignable<void>(new Pool('', {}).request({ path: '', method: '' }, (err, data) => {
	expectAssignable<Error | null>(err)
	expectAssignable<Client.ResponseData>(data)
}))
