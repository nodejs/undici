import Dispatcher from './types/dispatcher'
import { setGlobalDispatcher, getGlobalDispatcher } from './types/global-dispatcher'
import Pool from './types/pool'
import Client from './types/client'
import buildConnector from './types/connector'
import errors from './types/errors'
import Agent from './types/agent'
import MockClient from './types/mock-client'
import MockPool from './types/mock-pool'
import MockAgent from './types/mock-agent'
import mockErrors from './types/mock-errors'
import { request, pipeline, stream, connect, upgrade } from './types/api'

export * from './types/fetch'
export * from './types/file'
export * from './types/formdata'

export { Dispatcher, Pool, Client, buildConnector, errors, Agent, request, stream, pipeline, connect, upgrade, setGlobalDispatcher, getGlobalDispatcher, MockClient, MockPool, MockAgent, mockErrors }
export default Undici

declare function Undici(url: string, opts: Pool.Options): Pool

declare namespace Undici {
  var Dispatcher: typeof import('./types/dispatcher')
  var Pool: typeof import('./types/pool');
  var Client: typeof import('./types/client');
  var buildConnector: typeof import('./types/connector');
  var errors: typeof import('./types/errors');
  var Agent: typeof import('./types/agent');
  var setGlobalDispatcher: typeof import('./types/global-dispatcher').setGlobalDispatcher;
  var getGlobalDispatcher: typeof import('./types/global-dispatcher').getGlobalDispatcher;
  var request: typeof import('./types/api').request;
  var stream: typeof import('./types/api').stream;
  var pipeline: typeof import('./types/api').pipeline;
  var connect: typeof import('./types/api').connect;
  var upgrade: typeof import('./types/api').upgrade;
  var MockClient: typeof import('./types/mock-client');
  var MockPool: typeof import('./types/mock-pool');
  var MockAgent: typeof import('./types/mock-agent');
  var mockErrors: typeof import('./types/mock-errors');
}
