import { expectAssignable } from 'tsd'
import { Agent, Dispatcher, RedirectHandler } from '../..'

const dispatcher = new Agent()

expectAssignable<Dispatcher.Dispatch>(RedirectHandler.buildDispatch(dispatcher, 3))
