/* Automatic replication cycles: pull, push, then pull conflict metadata.
   One cycle at a time. Offline mode cancels replication AND blocks HTTP fetches. */
(function (root) {
  'use strict';
  class MovieReplicator {
    constructor({PouchDB, db, url, parentId, mode, onState=()=>{}, onEvent=()=>{}, onCycle=()=>{}, onPull=()=>{}, onStart=()=>{}, interval=3000, browserOnline=()=>true}) {
      Object.assign(this, {PouchDB, db, url, parentId, mode, onState, onEvent, onCycle, onPull, onStart, interval, browserOnline});
      this.enabled = false; this.offline = false; this.generation = 0;
      this.jobs = new Set(); this.requests = new Set(); this.timer = null; this.running = false;
      this.states = {push:'Not connected', pull:'Not connected'};
    }
    allowed() { return this.enabled && !this.offline && this.browserOnline(); }
    state(direction, value) { this.states[direction] = value; this.onState({...this.states}); }
    setBoth(value) { this.states = {push:value, pull:value}; this.onState({...this.states}); }
    cancel() {
      this.generation++;
      clearTimeout(this.timer); this.timer = null;
      for (const job of this.jobs) job.cancel();
      for (const request of this.requests) request.abort();
    }
    disconnect() { this.enabled = false; this.cancel(); this.setBoth('Not connected'); }
    setOffline(value) {
      this.offline = value; this.cancel();
      if (value) this.setBoth('OFFLINE — replication stopped');
      else if (this.enabled) { this.setBoth('Reconnecting automatically…'); this.wake(); }
      else this.setBoth('Not connected');
    }
    networkChanged() {
      this.cancel();
      if (!this.browserOnline()) this.setBoth('OFFLINE — browser reports no network');
      else if (this.allowed()) { this.setBoth('Reconnecting automatically…'); this.wake(); }
    }
    connect(username, password) {
      this.cancel(); this.enabled = true;
      // Capture credentials for this session only. All requests go through the offline gate.
      this.remote = new this.PouchDB(this.url, {skip_setup:true, auth:{username,password},
        fetch:(url, options) => this.guardedFetch(url, options)});
      if (this.allowed()) { this.setBoth('Connecting…'); this.wake(); }
      else this.setBoth('OFFLINE — credentials ready; reconnect to synchronize');
    }
    async guardedFetch(url, options={}) {
      if (!this.allowed()) throw new Error('Offline mode: CouchDB request blocked.');
      const controller = new AbortController(); this.requests.add(controller);
      const abort = () => controller.abort();
      if (options.signal?.aborted) controller.abort();
      options.signal?.addEventListener('abort', abort, {once:true});
      const timeout = setTimeout(abort, 15000);
      try {
        return await this.PouchDB.fetch(url, {...options, signal:controller.signal});
      } finally {
        clearTimeout(timeout); this.requests.delete(controller);
        options.signal?.removeEventListener('abort', abort);
      }
    }
    wake() {
      if (!this.allowed()) return;
      if (this.running) { this.again = true; return; }
      clearTimeout(this.timer); this.timer = setTimeout(() => this.cycle(), 100);
    }
    async replicate(direction, generation) {
      if (!this.allowed() || generation !== this.generation) throw new Error('Replication interrupted.');
      this.state(direction, direction === 'push' ? 'Uploading…' : 'Downloading…');
      const options = {retry:false};
      if (this.mode === 'array') options.doc_ids = [this.parentId];
      const job = direction === 'push' ? this.db.replicate.to(this.remote, options) : this.db.replicate.from(this.remote, options);
      this.jobs.add(job);
      let denied = null;
      job.on('denied', error => { denied = error; });
      try {
        const result = await job;
        if (generation !== this.generation || !this.allowed() || result.status === 'cancelled') throw new Error('Replication interrupted.');
        if (denied || result.doc_write_failures || result.errors?.length) throw denied || result.errors?.[0] || new Error('Some documents were rejected.');
        this.state(direction, `OK — ${result.docs_written || 0} document revision(s) copied this pass`);
        if (result.docs_written) this.onEvent(`${direction === 'push' ? 'PUSH to' : 'PULL from'} ${this.url}: ${result.docs_written} document revision(s).`);
        return result;
      } finally { this.jobs.delete(job); }
    }
    async cycle() {
      if (this.running || !this.allowed()) return;
      this.running = true; this.again = false;
      const generation = this.generation;
      try {
        this.onStart();
        // A real request catches wrong database names, authentication failures and CORS failures.
        await this.remote.info();
        await this.replicate('pull', generation);
        await this.onPull();
        await this.replicate('push', generation);
        await this.replicate('pull', generation);
        await this.onPull();
        if (generation === this.generation && this.allowed()) { this.lastError = null; await this.onCycle(); }
      } catch(error) {
        if (generation === this.generation && this.allowed()) {
          const detail = error.status ? `${error.status}: ${error.message || error.reason}` : (error.message || String(error));
          this.setBoth(`NOT synchronized — ${detail}. Retrying automatically.`);
          if (this.lastError !== detail) { this.onEvent(`SYNC ERROR for ${this.url}: ${detail}. Check credentials, database name and CouchDB CORS.`); this.lastError = detail; }
        }
      } finally {
        this.running = false;
        if (this.allowed()) { clearTimeout(this.timer); this.timer = setTimeout(() => this.cycle(), this.again ? 100 : this.interval); }
      }
    }
  }
  root.MovieReplicator = MovieReplicator;
  if (typeof module !== 'undefined') module.exports = {MovieReplicator};
})(typeof window !== 'undefined' ? window : globalThis);
