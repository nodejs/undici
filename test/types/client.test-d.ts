import { Duplex, Readable, Writable } from 'stream'
import { expectAssignable } from 'tsd'
import { Client } from '../..'
import { URL } from 'url'

expectAssignable<Client>(new Client(''))
expectAssignable<Client>(new Client('', {}))
expectAssignable<Client>(new Client(new URL('http://localhost'), {}))

{
  const client = new Client('')

  // methods
  expectAssignable<number>(client.pipelining)
  expectAssignable<number>(client.pending)
  expectAssignable<number>(client.running)
  expectAssignable<number>(client.size)
  expectAssignable<boolean>(client.connected)
  expectAssignable<boolean>(client.busy)
  expectAssignable<boolean>(client.closed)
  expectAssignable<boolean>(client.destroyed)

  // request
  expectAssignable<PromiseLike<Client.ResponseData>>(client.request({ path: '', method: '' }))
  expectAssignable<void>(client.request({ path: '', method: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Client.ResponseData>(data)
  }))

  // stream
  expectAssignable<PromiseLike<Client.StreamData>>(client.stream({ path: '', method: '' }, data => {
    expectAssignable<Client.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<void>(client.stream(
    { path: '', method: '' },
    data => {
      expectAssignable<Client.StreamFactoryData>(data)
      return new Writable()
    },
    (err, data) => {
      expectAssignable<Error | null>(err)
      expectAssignable<Client.StreamData>(data)
    }
  ))

  // pipeline
  expectAssignable<Duplex>(client.pipeline({ path: '', method: '' }, data => {
    expectAssignable<Client.PipelineHandlerData>(data)
    return new Readable()
  }))

  // upgrade
  expectAssignable<PromiseLike<Client.UpgradeData>>(client.upgrade({ path: '' }))
  expectAssignable<void>(client.upgrade({ path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Client.UpgradeData>(data)
  }))

  // connect
  expectAssignable<PromiseLike<Client.ConnectData>>(client.connect({ path: '' }))
  expectAssignable<void>(client.connect({ path: '' }, (err, data) => {
    expectAssignable<Error | null>(err)
    expectAssignable<Client.ConnectData>(data)
  }))

  // dispatch
  expectAssignable<void>(client.dispatch({ path: '', method: '' }, {}))

  // close
  expectAssignable<PromiseLike<void>>(client.close())
  expectAssignable<void>(client.close(() => {}))

  // destroy
  expectAssignable<PromiseLike<void>>(client.destroy())
  expectAssignable<PromiseLike<void>>(client.destroy(new Error()))
  expectAssignable<void>(client.destroy(() => {}))
  expectAssignable<void>(client.destroy(new Error(), () => {}))
}
