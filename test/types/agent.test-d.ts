import { expectAssignable } from 'tsd'
import { Pool, Agent, setGlobalAgent, request, stream, pipeline, Client } from '../..'
import { Writable, Readable, Duplex } from 'stream'

expectAssignable<Agent>(new Agent())
expectAssignable<Agent>(new Agent({}))

{
  const agent = new Agent()

  expectAssignable<Pool>(agent.get(''))
}

{
  expectAssignable<void>(setGlobalAgent(new Agent()))
  expectAssignable<void>(setGlobalAgent({ get: origin => new Pool(origin) }))
}

{
  expectAssignable<PromiseLike<Client.ResponseData>>(request(''))
  expectAssignable<PromiseLike<Client.StreamData>>(stream('', { path: '', method: '' }, data => {
    expectAssignable<Client.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<PromiseLike<Client.ResponseData>>(request(''))
}

{
  expectAssignable<Duplex>(pipeline('', { path: '', method: '' }, data => {
    expectAssignable<Client.PipelineHandlerData>(data)
    return new Readable()
  }))
}