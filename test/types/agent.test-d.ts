import { expectAssignable } from 'tsd'
import { Pool, Agent, setGlobalAgent, request, stream, pipeline, Client, RedirectPool } from '../..'
import { Writable, Readable, Duplex } from 'stream'

expectAssignable<Agent>(new Agent())
expectAssignable<Agent>(new Agent({}))

{
  const agent = new Agent()

  expectAssignable<Pool>(agent.get(''))
}

{
  expectAssignable<void>(setGlobalAgent(new Agent()))
  expectAssignable<void>(setGlobalAgent(new Agent({ poolClass: RedirectPool })))
  expectAssignable<void>(setGlobalAgent({ get: origin => new Pool(origin) }))
}

{
  expectAssignable<PromiseLike<Client.ResponseData>>(request('', { maxRedirections: 1 }))
  expectAssignable<PromiseLike<Client.StreamData>>(stream('', { method: '', maxRedirections: 1 }, data => {
    expectAssignable<Client.StreamFactoryData>(data)
    return new Writable()
  }))
  expectAssignable<PromiseLike<Client.ResponseData>>(request(''))
}

{
  expectAssignable<Duplex>(pipeline('', { method: '', maxRedirections: 1 }, data => {
    expectAssignable<Client.PipelineHandlerData>(data)
    return new Readable()
  }))
}
