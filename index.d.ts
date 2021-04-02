import Dispatcher from './types/dispatcher'
import Pool from './types/pool'
import Client from './types/client'
import errors from './types/errors'
import { Agent, setGlobalAgent, request, stream, pipeline } from './types/agent'
import MockClient from './types/mock-client'
import MockPool from './types/mock-pool'
import MockAgent from './types/mock-agent'

export { Dispatcher, Pool, Client, errors, Agent, setGlobalAgent, request, stream, pipeline, MockClient, MockPool, MockAgent }
export default Undici

declare function Undici(url: string, opts: Pool.Options): Pool

declare namespace Undici {
  var Dispatcher: typeof import('./types/dispatcher')
  var Pool: typeof import('./types/pool');
  var Client: typeof import('./types/client');
  var errors: typeof import('./types/errors');
  var Agent: typeof import('./types/agent').Agent;
  var setGlobalAgent: typeof import('./types/agent').setGlobalAgent;
  var request: typeof import('./types/agent').request;
  var stream: typeof import('./types/agent').stream;
  var pipeline: typeof import('./types/agent').pipeline;
  var MockClient: typeof import('./types/mock-client');
  var MockPool: typeof import('./types/mock-pool');
  var MockAgent: typeof import('./types/mock-agent');
}
