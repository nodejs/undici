import { expectAssignable } from 'tsd'
import { setGlobalDispatcher, Dispatcher, Dispatcher1Wrapper, getGlobalDispatcher } from '../..'

{
  expectAssignable<void>(setGlobalDispatcher(new Dispatcher()))
  class CustomDispatcher extends Dispatcher {}
  expectAssignable<void>(setGlobalDispatcher(new CustomDispatcher()))
}

expectAssignable<Dispatcher>(getGlobalDispatcher())
expectAssignable<Dispatcher>(new Dispatcher1Wrapper(new Dispatcher()))
