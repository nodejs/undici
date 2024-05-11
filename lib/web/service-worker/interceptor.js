import { BatchInterceptor } from '@mswjs/interceptors'
import { ClientRequestInterceptor } from '@mswjs/interceptors/ClientRequest'
import { FetchInterceptor } from '@mswjs/interceptors/fetch'
import { XMLHttpRequestInterceptor } from '@mswjs/interceptors/XMLHttpRequest'

export const interceptor = new BatchInterceptor({
  name: 'node-service-worker',
  interceptors: [
    new ClientRequestInterceptor(),
    new FetchInterceptor(),
    new XMLHttpRequestInterceptor()
  ]
})
