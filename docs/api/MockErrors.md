# MockErrors

Undici exposes a variety of mock error objects that you can use to enhance your mock error handling.
You can find all the mock error objects inside the `mockErrors` key.

```js
const { mockErrors } = require('undici')
```

| Mock Error            | Mock Error Codes                | Description                                                |
| --------------------- | ------------------------------- | ---------------------------------------------------------- |
| `MockNotMatchedError` | `UND_MOCK_ERR_MOCK_NOT_MATCHED` | The request does not match any registered mock dispatches. |
