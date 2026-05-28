import { expectAssignable } from 'tsd'
import { setGlobalDispatcher, Dispatcher, getGlobalDispatcher } from '../..'

{
  expectAssignable<void>(setGlobalDispatcher(new Dispatcher()))
  class CustomDispatcher extends Dispatcher {}
  expectAssignable<void>(setGlobalDispatcher(new CustomDispatcher()))
}

expectAssignable<Dispatcher>(getGlobalDispatcher())
