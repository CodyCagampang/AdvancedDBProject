# Schema A Movies — replacement app

A rudimentary JavaScript/PouchDB application built for Q15: local CRUD, automatic CouchDB replication, explicit offline control, and manual conflict detection/resolution. Start with **START-HERE.txt** and use **DEMONSTRATION.md** for your five scenarios.

## Run

Extract the ZIP, open `movie-app-v2` in VS Code, and run:

```
node server.js
```

Open **http://localhost:8081**. Node.js is required; no dependency installation is necessary for normal use. The PouchDB 9.0.0 browser library and its licence are included locally. This app uses a different port and database names from the previous app. It does not delete or migrate that app's saved data.

## Choose the storage layout that matches your CouchDB database

| Mode | Local operations | CouchDB document updated |
|---|---|---|
| **Inside my existing document's docs array** (default for your screenshots) | Read the parent into PouchDB; create/update/delete movie entries inside its `docs` array | Your existing parent document, retaining its `_id` and revision history |
| **One separate document per movie** | Create/update/delete independent movie documents in PouchDB | The document with that movie's `_id` |

Your screenshots show parent ID `634e55a16de7150cece4878cd602394b` inside `movies-schema-a`. Those are prefilled, but check the actual current ID before connecting. The app's URL must be the database URL only; use the separate parent ID field for the array layout. Existing wrapper data must first be downloaded while connected. The app then supports local editing while disconnected. It will not create an empty replacement parent if you enter the wrong ID.

Both layouts retain movies with `title`, `actors` and `genres`, and preserve unrelated existing movie fields when editing. The brief describes Schema A as movie documents containing embedded actor/genre arrays; separate movie documents are the natural implementation of that description. Array mode additionally supports the specific all-movies-in-one-document layout shown in your existing coursework screenshots. Explain which layout you actually demonstrate.

Array mode deliberately replicates only the selected parent document (`doc_ids`). It does not modify unrelated documents, including separate movie documents left by the earlier application. In separate-document mode, the database replicates normally; the movie list excludes design documents and docs wrappers. Use a database dedicated to movies.

A workspace is bound to its target URL and layout. These settings are locked while open. Use **Change database settings** to switch; existing local work remains in its original workspace instead of being silently copied into a different remote database. Client A and client B also use independent local databases.

## CouchDB CORS configuration

Because the app uses port 8081 and CouchDB uses 5984, allow the app's exact origin. In Fauxton's CORS screen, enable CORS and add `http://localhost:8081` as a specific allowed origin. If using the configuration table on CouchDB 3.2+:

| Section | Key | Value |
|---|---|---|
| `chttpd` | `enable_cors` | `true` |
| `cors` | `origins` | `http://localhost:8081` |
| `cors` | `credentials` | `true` |
| `cors` | `methods` | `GET, PUT, POST, HEAD, DELETE` |
| `cors` | `headers` | `accept, authorization, content-type, origin, referer` |

If you need other existing origins, preserve them as a comma-separated list and add the new origin. CouchDB before 3.2 uses `httpd.enable_cors` instead. Use `localhost` consistently: `127.0.0.1` is a different origin. No database name or document ID belongs in the allowed origin.

The chosen database must exist and the supplied account must be permitted to read/write it. Credentials are kept in memory only. After a full page reload, local movies remain, but enter the password and connect again. Settings and the Work offline choice are retained.

## Offline and automatic reconnection

1. Every movie operation targets local PouchDB/IndexedDB.
2. After connecting, `MovieReplicator` performs a **pull → push → pull** replication cycle and repeats every three seconds. Local saves schedule an earlier cycle. The final pull retrieves any newly exposed conflicts.
3. These are actual PouchDB `replicate.from()` and `replicate.to()` operations with revision histories and replication checkpoints, not manual JSON copying or direct CRUD uploads.
4. The **Work offline** switch cancels active replication jobs and aborts in-flight fetches. An additional fetch guard rejects every new CouchDB request while offline. The app will not pretend to be synchronizing in that state.
5. Unchecking the switch automatically resumes synchronization if credentials have been entered in the same session. Browser `offline`/`online` events also stop/resume replication. Temporary HTTP failures are visible and automatically retried.
6. A request already accepted by CouchDB before you switched offline cannot be undone. Turn offline on **before** making demonstration edits.

Disconnecting Wi-Fi does not necessarily make a CouchDB server on the same computer unreachable. Use the clearly labelled offline simulation for a reproducible demo. To demonstrate a genuine server outage, stop the local CouchDB service, leave the web app running, edit locally, then restart CouchDB without clicking Connect again. Browser network state is only a hint; actual HTTP results determine synchronization success.

The UI shows separate upload/download states, the exact remote target, conflicts and activity. A completed cycle is not an atomic snapshot across every possible concurrent client. Use **Read from CouchDB** to verify the exact remote movie and revision. Remote checking is intentionally unavailable offline.

## Conflicts

A real replication conflict requires **two divergent edits to the same shared document revision**. Editing the local copy while the server copy is unchanged is just a normal offline update.

Client B opens the same UI with a separate local database. Connect both clients and wait for them to share the same initial content. Take A offline, edit the same movie differently in A and connected B, wait for B's upload, then reconnect A. See the detailed walkthrough.

The app checks `_conflicts` on initial reads, local change events and after replication. It displays a conflict banner above the form with an Inspect button. The viewer shows the revisions and their content. In array mode it highlights the movies that differ between parent versions, including removed entries. Choosing a version creates a new revision containing the selected content and deletes the observed losing leaf revisions. That resolution then replicates.

**Array mode resolves the entire parent document.** Choosing one version can discard unrelated changes present only in another version. The UI warns about this explicitly. This is a consequence of treating the entire movie collection as one conflict unit. There is no automatic field-level or movie-by-movie merge. Concurrent edits during resolution can create further conflicts; stale resolution snapshots are rejected and partial branch errors are reported.

A stale edit within a local database produces an immediate 409 rather than silently overwriting a newer revision. The form retains the entered values so they can be copied before reopening the movie. This is distinct from the divergent replication conflict demonstrated with clients A/B.

## Deletion

In separate-document mode, deletion uses `db.remove()` and creates a tombstone that replicates. In array mode, deleting a movie removes its entry from `docs` and writes a new parent revision. The parent document itself is not deleted. Explain the distinction in your demonstration.

## Source files and driver choices

| File | Role |
|---|---|
| `public/index.html` | Basic forms, paginated list, conflict panel and remote verification |
| `public/style.css` | Minimal readable styling |
| `public/database.js` | Local CRUD and conflict operations; used directly by the tests |
| `public/replication.js` | Offline gate, cancellation, HTTP requests, automatic cycles and error states |
| `public/app.js` | Connects UI events to the local store and replication controller |
| `public/sw.js` | Caches the UI assets for reopening offline after an initial online load |
| `public/vendor/pouchdb.min.js` | PouchDB 9.0.0, locally bundled for offline availability |
| `server.js` | Small Node static-file server; does not hold movies or proxy CouchDB |
| `tests/` | Reproducible automated checks of the same store, controller and UI scripts |

PouchDB is the database library. Its browser IndexedDB adapter stores local documents; its HTTP adapter communicates with CouchDB. The browser service worker caches application files, not database data. The included Node server only serves the UI. No framework, MongoDB driver or additional CouchDB driver is required.

## Testing and limits

See `VALIDATION.md` for checks actually run and their limits. To rerun automated tests with internet access for installing test dependencies:

```
npm install
npm test
```

The test backend is a disposable PouchDB server implementing the CouchDB replication API. It does not connect to or modify your coursework database. Automated UI tests use jsdom and IndexedDB emulation; they do not replace real-browser, service-worker and CORS checks against your own CouchDB instance.

This is a coursework demo: credentials are not persisted, there is no multi-user access-control UI, and browser storage is not a backup. Parent-array reads rewrite the whole document and are less efficient/conflict-granular than separate movie documents. The app paginates rendering but still reads the local movie list into memory. No attachment editing or comprehensive delete/update conflict workflow is provided.

## Assignment and AI use

ChatGPT generated this replacement implementation and tests. Keep the prompts and conversation for your AI declaration, explain the code, and report your own observed test results. The brief asks for your own discussion/evaluation; `DEMONSTRATION.md` provides prompts and expected behaviours, not a fabricated report or screenshots of your system.

## References

- PouchDB API: https://pouchdb.com/api.html
- PouchDB conflicts: https://pouchdb.com/guides/conflicts.html
- CouchDB CORS configuration: https://docs.couchdb.org/en/stable/config/http.html#cross-origin-resource-sharing
