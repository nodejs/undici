import { expectAssignable } from 'tsd'
import { Errors } from '../..'
import Client from '../../types/client'

expectAssignable<Client>(new Client('', {}))

expectAssignable<PromiseLike<Client.ResponseData>>(new Client('', {}).request({ path: '', method: '' }))
expectAssignable<void>(new Client('', {}).request({ path: '', method: '' }, (err, data) => {
	expectAssignable<Error | null>(err)
	expectAssignable<Client.ResponseData>(data)
}))


