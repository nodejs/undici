import { request } from '../../'
import { interceptors } from '../../'

async function exampleCode () {
  const retry = interceptors.retry()
  const rd = interceptors.redirect()
  const dump = interceptors.dump()

  await request('http://localhost:3000/foo')
}
