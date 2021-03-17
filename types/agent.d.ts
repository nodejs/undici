import { Duplex } from 'stream'
import { URL, UrlObject } from 'url'
import Client from './client'
import Pool from './pool'

export {
  Agent,
  setGlobalAgent,
  request,
  stream,
  pipeline,
}


interface ClientConstructor {
  new(url: string | URL, options?: Client.Options): Client;
}

interface PoolConstructor {
  new(url: string | URL, options?: Pool.Options): Pool;
}

declare class Agent {
  constructor(opts?: Pool.Options & { clientClass?: ClientConstructor, poolClass?: PoolConstructor })
  get(origin: string): Pool;
}

declare function setGlobalAgent<AgentImplementation extends Agent>(agent: AgentImplementation): void;

declare function request(
  url: string | URL | UrlObject,
  opts?: { agent?: Agent, maxRedirections?: boolean | number } & Omit<Partial<Client.RequestOptions>, 'path'>,
): PromiseLike<Client.ResponseData>;

declare function stream(
  url: string | URL | UrlObject,
  opts: { agent?: Agent, maxRedirections?: boolean | number } & Omit<Partial<Client.RequestOptions>, 'path'>,
  factory: Client.StreamFactory
): PromiseLike<Client.StreamData>;

declare function pipeline(
  url: string | URL | UrlObject,
  opts: { agent?: Agent, maxRedirections?: boolean | number } & Omit<Partial<Client.PipelineOptions>, 'path'>,
  handler: Client.PipelineHandler
): Duplex;
