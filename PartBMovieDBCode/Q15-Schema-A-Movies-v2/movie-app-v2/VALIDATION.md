# Validation performed on 6 October 2026

All four automated suites passed against the delivered source files:

| Suite | Checks passed |
|---|---|
| Parent-array store | Offline create/update/delete, unchanged remote copy while disconnected, reconnection, divergent update conflict, selected-version resolution, rejection of a stale local edit |
| Separate-document store | The same scenarios, including replication of deletion tombstones |
| HTTP replication controller | Initial download, zero HTTP requests while Work offline is enabled, fetch guard rejection, automatic upload after unchecking offline, browser offline/online handling, deletion replication, visible simulated HTTP 503 outage and automatic retry |
| UI integration | Actual index.html/app.js/database.js/replication.js scripts, independent A/B clients, offline CRUD, zero requests during offline UI operation, automatic upload, conflict banner, both versions displayed, selected content replicated, remote read verification, persistence when reopening the same IndexedDB |

JavaScript syntax checks also passed for the application, service worker and static server.

## What these tests used

- PouchDB 9.0.0 with in-memory replicas for the data-layer tests.
- Express-PouchDB as a disposable HTTP server implementing the CouchDB replication API.
- jsdom with fake-indexeddb for the UI integration test, loading the actual bundled browser PouchDB library.

## What has NOT been verified here

- Your own CouchDB installation, credentials, permissions or CORS configuration.
- Real Chrome/Edge rendering and service-worker offline page reopening.
- CouchDB-specific configuration/validation behaviour beyond the compatible test endpoint.

Use DEMONSTRATION.md to verify all five scenarios on your computer and capture your own evidence. Automated passes are not screenshots or results from your coursework database.

## Reproduce

In the project folder, run `npm install` then `npm test`. Installing the test dependencies needs internet access. Running the app itself only needs `node server.js`; its browser library is already included.
