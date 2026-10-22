# Q15: demonstrate the five scenarios

Use disposable movies and take screenshots of your actual results. These are test instructions and expected outcomes, not claims that your computer has passed them.

## Preparation

1. Start the new app on http://localhost:8081. Set up CORS, choose the correct storage layout and connect.
2. In array mode wait until the existing parent downloads; movies should appear. In separate-document mode the database may start empty.
3. While connected, create movies with IDs `q15-update`, `q15-delete` and `q15-conflict`. Any title/actors/genres will do.
4. Wait for a completed replication cycle. Use **Read from CouchDB** for each ID to prove it has reached the server. Save a screenshot of the connection target, storage mode and remote result.

## 1. Create while offline

- Tick **Work offline**. Check that both replication directions say OFFLINE.
- Create ID `q15-create` with title `Created while offline`.
- Capture the offline switch, local row and local save log.
- Check CouchDB independently in Fauxton or Postman: the new movie should not be there yet. Do not create it manually in CouchDB.
- Expected: a local save succeeds even though replication is blocked.

## 2. Update while offline

- Keep Work offline checked.
- Edit `q15-update`, change its title to `Updated while offline`, and save.
- Capture the changed local row and local revision log.
- Check the server independently: it should still show the original value.
- Expected: local content advances while the remote copy remains unchanged.

## 3. Delete while offline

- Keep Work offline checked.
- Delete the already synchronized `q15-delete`.
- Capture the local deletion log and search showing it absent locally.
- Check the server independently: it should still contain that movie.
- Expected: a local delete succeeds. Separate-document mode uses a tombstone; array mode writes a parent revision with that movie removed.

## 4. Synchronize after reconnecting

- Uncheck **Work offline**. Do not press Connect again if you have remained on the same page with credentials in memory.
- Wait for the automatic cycle to complete. Capture the PUSH/PULL log and the two direction statuses.
- Use **Read from CouchDB** to check each ID:
  - `q15-create`: present.
  - `q15-update`: the offline title is present.
  - `q15-delete`: absent.
- Capture Fauxton/Postman as additional independent evidence.
- Expected: the remote data catches up without manually re-entering each change.

For a genuine service failure in addition to the offline simulation, repeat using Windows Services to stop CouchDB and later restart it. Leave Work offline unchecked for this variation, so the app shows connection errors and retries automatically. Disabling Wi-Fi alone is not a reliable disconnection from localhost.

## 5. Conflict update

1. In connected client A, verify `q15-conflict` is on CouchDB.
2. Open **independent client B** with the link. Its address ends in `?client=B`; it uses a different PouchDB database even in the same browser.
3. Check that B's target URL, mode and parent ID match A, enter credentials, connect and wait for a completed replication cycle.
4. Check that the starting movie content is the same in both clients. To avoid ambiguity, finish all other edits before this test.
5. Tick Work offline in A. Edit `q15-conflict` in A to title `LOCAL VERSION`, then save.
6. Keep B connected. Edit the same movie in B to `REMOTE VERSION`, save, and use B's remote check to verify its server upload.
7. Uncheck Work offline in A. Let automatic replication run.
8. Capture the **Conflicts detected** banner. Click **Inspect** and capture both revisions and both titles.
9. Choose a version and confirm. In array mode this selects the entire parent document version, so review all displayed movie differences first.
10. Wait for a completed cycle, then read the movie from CouchDB. Capture the selected title and `Conflicting branches: 0`. Check that both clients converge.

Expected: replication preserves both independently edited branches until resolution. A database winner is chosen deterministically and is not necessarily the latest or correct real-world version. The UI does not label revisions as local/remote solely from their revision hashes; the test titles let you identify their origin.

## Correct Postman checks

Use GET and your normal Basic Auth credentials.

**Array mode (your existing parent layout):**

```
http://localhost:5984/movies-schema-a/634e55a16de7150cece4878cd602394b?conflicts=true
```

Find the movie inside `docs`. Replace the parent ID if yours differs. In this mode `/movies-schema-a/q15-create` does not retrieve a nested movie.

**Separate-document mode:**

```
http://localhost:5984/movies-schema-a/q15-create?conflicts=true
```

Use the exact database name currently displayed by the app. Do not switch between `/movies` and `/movies-schema-a` unintentionally.

## Write your own evaluation

For each scenario, record: action, observed local result, observed server result, replication state, screenshot reference and conclusion. Explain any failed attempt and what you changed. Evaluate whether local responsiveness, eventual synchronization and manual conflict handling were adequate for this small app. Discuss the whole-parent conflict limitation if you used array mode.

For coding tools/drivers, explain your actual use of VS Code, Node, JavaScript, ChatGPT and PouchDB. Mention one strength and one observed limitation of the code. Do not claim successful tests solely because an expected-outcome table says they should work.
