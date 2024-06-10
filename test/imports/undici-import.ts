import { request } from '../../'
import { interceptors } from '../../'

async function exampleCode() {
  const ri = interceptors.createRedirectInterceptor({})
  await request('http://localhost:3000/foo')
}
