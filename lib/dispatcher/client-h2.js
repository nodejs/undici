diff a/lib/dispatcher/client-h2.js b/lib/dispatcher/client-h2.js	(rejected hunks)
@@ -391,6 +391,18 @@ function writeH2 (client, request) {
     const { [HTTP2_HEADER_STATUS]: statusCode, ...realHeaders } = headers
     request.onResponseStarted()
 
+    // Due to the stream nature, it is possible we face a race condition
+    // where the stream has been assigned, but the request has been aborted
+    // the request remains in-flight and headers hasn't been received yet
+    // for those scenarios, best effort is to destroy the stream immediately
+    // as there's no value to keep it open.
+    if (request.aborted || request.completed) {
+      const err = new RequestAbortedError()
+      errorRequest(client, request, err)
+      util.destroy(stream, err)
+      return
+    }
+
     if (request.onHeaders(Number(statusCode), realHeaders, stream.resume.bind(stream), '') === false) {
       stream.pause()
     }
