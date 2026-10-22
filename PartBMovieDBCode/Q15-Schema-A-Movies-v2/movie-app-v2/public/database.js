/* Shared by the browser and the automated tests. No network calls here. */
(function (root) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const isMovie = d => d && typeof d._id === 'string' && typeof d.title === 'string' && Array.isArray(d.actors) && Array.isArray(d.genres);
  function clean(doc) {
    const copy = clone(doc);
    for (const key of ['_conflicts', '_deleted_conflicts', '_revisions', '_revs_info']) delete copy[key];
    return copy;
  }
  class MovieStore {
    constructor(db, mode, parentId) { this.db = db; this.mode = mode; this.parentId = parentId; }
    async parent() {
      const doc = await this.db.get(this.parentId, {conflicts:true});
      if (!Array.isArray(doc.docs)) throw new Error('The selected parent document has no docs array. Check the parent document ID.');
      return doc;
    }
    async read() {
      if (this.mode === 'array') {
        let doc;
        try { doc = await this.parent(); } catch (e) { if (e.status === 404) return {movies:[], ready:false, conflicts:[]}; throw e; }
        return {movies:doc.docs.filter(isMovie), ready:true, conflicts:doc._conflicts?.length ? [doc] : []};
      }
      const rows = (await this.db.allDocs({include_docs:true, conflicts:true})).rows;
      return {movies:rows.map(r => r.doc).filter(isMovie), ready:true,
        conflicts:rows.map(r => r.doc).filter(d => isMovie(d) && d._conflicts?.length),
        hasWrapper:rows.some(r => Array.isArray(r.doc.docs))};
    }
    async snapshot(id) {
      const document = this.mode === 'array' ? await this.parent() : await this.db.get(id, {conflicts:true});
      if (document._conflicts?.length) throw new Error('Resolve the document conflict before editing or deleting.');
      const movie = this.mode === 'array' ? document.docs.find(d => d._id === id) : document;
      if (!movie) throw new Error('Movie no longer exists. Refresh the list.');
      return {document:clean(document), movie:clone(movie)};
    }
    validate(movie) {
      if (!isMovie(movie) || !movie._id.trim() || movie._id.startsWith('_') || !movie.title.trim() || !movie.actors.every(x => typeof x === 'string') || !movie.genres.every(x => typeof x === 'string')) throw new Error('Enter a movie ID, a title, and valid actor/genre lists. IDs cannot start with _.');
    }
    async create(movie) {
      this.validate(movie);
      if (this.mode === 'array') {
        const parent = await this.parent();
        if (parent._conflicts?.length) throw new Error('Resolve the parent document conflict first.');
        if (parent.docs.some(d => d._id === movie._id)) throw new Error('That movie ID already exists.');
        return this.db.put({...clean(parent), docs:[...parent.docs, clone(movie)]});
      }
      return this.db.put(clone(movie));
    }
    async update(snapshot, fields) {
      const movie = {...snapshot.movie, ...fields, _id:snapshot.movie._id}; this.validate(movie);
      // Use the revision captured when Edit was clicked, preventing stale overwrites.
      if (this.mode === 'array') return this.db.put({...snapshot.document, docs:snapshot.document.docs.map(d => d._id === movie._id ? movie : d)});
      return this.db.put({...snapshot.document, ...movie, _rev:snapshot.document._rev});
    }
    async remove(snapshot) {
      if (this.mode === 'array') return this.db.put({...snapshot.document, docs:snapshot.document.docs.filter(d => d._id !== snapshot.movie._id)});
      return this.db.remove(snapshot.document);
    }
    async versions(id) {
      const winner = await this.db.get(id, {conflicts:true});
      const revs = [winner._rev, ...(winner._conflicts || [])];
      const documents = await Promise.all(revs.map(rev => this.db.get(id, {rev, attachments:true})));
      return {id, winner:winner._rev, revs, documents};
    }
    async resolve(snapshot, chosenRevision) {
      const current = await this.versions(snapshot.id);
      if (current.winner !== snapshot.winner || JSON.stringify([...current.revs].sort()) !== JSON.stringify([...snapshot.revs].sort())) throw new Error('Revisions changed. Refresh the conflict panel before resolving.');
      if (current.revs.length < 2) throw new Error('This conflict has already been resolved.');
      const chosen = current.documents.find(d => d._rev === chosenRevision);
      if (!chosen) throw new Error('The selected revision no longer exists.');
      // Preserve the chosen content as a new winning revision, then tombstone observed losing leaves.
      await this.db.put({...clean(chosen), _rev:current.winner});
      const results = await this.db.bulkDocs(current.revs.filter(rev => rev !== current.winner).map(rev => ({_id:current.id, _rev:rev, _deleted:true})));
      if (results.some(r => r.error)) throw new Error('Some conflicting branches changed during resolution. Inspect conflicts again.');
      const after = await this.db.get(current.id, {conflicts:true});
      return {remaining:after._conflicts?.length || 0};
    }
  }
  root.MovieStore = MovieStore;
  if (typeof module !== 'undefined') module.exports = {MovieStore, isMovie};
})(typeof window !== 'undefined' ? window : globalThis);
