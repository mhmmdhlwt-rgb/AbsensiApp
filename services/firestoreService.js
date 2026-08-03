// services/firestoreService.js — Service layer untuk Firestore (FASE 3 AUDIT FIX)
// ═══════════════════════════════════════════════════════════════
// Wrapper terpusat untuk semua akses Firestore. Tujuan:
//   1. Single source of truth untuk path collection (tenants/{ns}/{store})
//   2. Konsisten retry + audit-trail timestamp
//   3. Konsisten strip _ts/_etag/_srvTs dari data yang dibaca
//   4. Type-safe-ish (parameter validation minimal)
//   5. Mudah di-mock untuk unit test
//
// Kompatibel dengan _fbFetch, _fbPatch, _fbFetchFiltered, _fbFetchPaginated
// yang sudah ada di index.html. Fungsi-fungsi existing tetap dipertahankan
// sebagai thin wrapper ke service ini — supaya tidak break kode existing.
//
// Pemakaian:
//   <script src="services/firestoreService.js"></script>
//   const svc = FirestoreService.getInstance();
//   const doc = await svc.get('santri', 'snt_001');
//   await svc.set('santri', 'snt_001', { nama: 'Aisyah', ... });
//   await svc.delete('absensi', 'abs_ses1_snt001');
//   const items = await svc.query('absensi', [
//     { field: 'sesiId', op: '==', val: 'ses1' }
//   ], { orderBy: 'updatedAt', orderDir: 'desc', limit: 50 });

(function FirestoreServiceSetup() {
  'use strict';
  if (typeof window === 'undefined') return;

  class FirestoreService {
    constructor(db, namespaceFn) {
      if (!db) throw new Error('FirestoreService: db (firebase.firestore()) required');
      this._db = db;
      this._nsFn = namespaceFn || (() => localStorage.getItem('tenant_ns') || 'default');
      // Audit-trail stores — write _srvTs (serverTimestamp) di set/patch
      this._AUDIT_TRAIL_STORES = new Set([
        'absensi','auditLog','pelanggaran','perizinan','catatanSakit','uzur'
      ]);
      this._MAX_BATCH = 450; // Firestore batch limit is 500, leave buffer
    }

    static _instance = null;
    static getInstance(db, nsFn) {
      if (!FirestoreService._instance) {
        FirestoreService._instance = new FirestoreService(db, nsFn);
      }
      return FirestoreService._instance;
    }

    _col(store) {
      return this._db.collection('tenants').doc(this._nsFn()).collection(store);
    }

    _clean(obj) {
      // Strip undefined + audit-trail fields yang harus di-set terpisah
      const cleaned = JSON.parse(JSON.stringify(obj));
      delete cleaned._ts; delete cleaned._etag; delete cleaned._srvTs;
      return cleaned;
    }

    async _retry(fn, label='fs', maxRetries=3) {
      let lastErr;
      for (let i = 0; i < maxRetries; i++) {
        try { return await fn(); }
        catch (e) {
          lastErr = e;
          if (e.code === 'invalid-argument' || e.code === 'permission-denied') throw e;
          const delay = 300 * Math.pow(3, i);
          await new Promise(r => setTimeout(r, delay));
        }
      }
      console.warn('[FirestoreService] ' + label + ' failed after ' + maxRetries + ' retries:', lastErr?.message);
      throw lastErr;
    }

    // ── Single-doc operations ──
    async get(store, id) {
      const snap = await this._retry(
        () => this._col(store).doc(id).get(),
        'get(' + store + '/' + id + ')'
      );
      if (!snap.exists) return null;
      const data = snap.data();
      delete data._ts; delete data._etag; delete data._srvTs;
      return data;
    }

    async set(store, id, data, opts={}) {
      const cleaned = this._clean(data);
      // Add audit-trail server timestamp for critical stores
      if (this._AUDIT_TRAIL_STORES.has(store)) {
        cleaned._srvTs = firebase.firestore.FieldValue.serverTimestamp();
      }
      const merge = opts.merge !== false; // default true
      await this._retry(
        () => this._col(store).doc(id).set(cleaned, { merge }),
        'set(' + store + '/' + id + ')'
      );
      return data;
    }

    async delete(store, id) {
      // Untuk store yang support tombstone (absensi, kegiatan, dll), gunakan
      // tombstone (set deleted:true) alih-alih hard delete. Caller harus
      // tentukan sendiri apakah mau tombstone atau hard delete.
      await this._retry(
        () => this._col(store).doc(id).delete(),
        'delete(' + store + '/' + id + ')'
      );
      return null;
    }

    async writeTombstone(store, id, extraFields={}) {
      const tomb = Object.assign({
        id, deleted: true, updatedAt: Date.now()
      }, extraFields);
      if (this._AUDIT_TRAIL_STORES.has(store)) {
        tomb._srvTs = firebase.firestore.FieldValue.serverTimestamp();
      }
      await this._retry(
        () => this._col(store).doc(id).set(tomb, { merge: true }),
        'tombstone(' + store + '/' + id + ')'
      );
      return tomb;
    }

    // ── Collection operations ──
    async getAll(store) {
      const snap = await this._retry(
        () => this._col(store).get(),
        'getAll(' + store + ')'
      );
      const out = [];
      snap.forEach(d => {
        const data = d.data();
        if (data && data.id) {
          delete data._ts; delete data._etag; delete data._srvTs;
          out.push(data);
        }
      });
      return out;
    }

    async query(store, filters=[], opts={}) {
      let q = this._col(store);
      if (Array.isArray(filters)) {
        filters.forEach(f => { q = q.where(f.field, f.op, f.val); });
      }
      if (opts.orderBy) {
        q = q.orderBy(opts.orderBy, opts.orderDir || 'asc');
      }
      if (opts.limit) q = q.limit(opts.limit);
      if (opts.startAfter) q = q.startAfter(opts.startAfter);
      const snap = await this._retry(
        () => q.get(),
        'query(' + store + ')'
      );
      const items = [];
      snap.forEach(d => {
        const data = d.data();
        if (data && data.id) {
          delete data._ts; delete data._etag; delete data._srvTs;
          items.push(data);
        }
      });
      const lastVisible = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
      return {
        items,
        lastVisible,
        hasMore: opts.limit ? snap.docs.length === opts.limit : false
      };
    }

    // ── Batch operations ──
    async batchSet(store, items, merge=true) {
      let batch = this._db.batch();
      let count = 0;
      for (const item of items) {
        if (!item.id) continue;
        const cleaned = this._clean(item);
        const ref = this._col(store).doc(item.id);
        batch.set(ref, cleaned, { merge });
        if (++count >= this._MAX_BATCH) {
          await this._retry(() => batch.commit(), 'batchSet(' + store + ')');
          batch = this._db.batch();
          count = 0;
        }
      }
      if (count > 0) {
        await this._retry(() => batch.commit(), 'batchSet(' + store + ')');
      }
      return items.length;
    }

    async batchDelete(store, ids) {
      let batch = this._db.batch();
      let count = 0;
      for (const id of ids) {
        batch.delete(this._col(store).doc(id));
        if (++count >= this._MAX_BATCH) {
          await this._retry(() => batch.commit(), 'batchDelete(' + store + ')');
          batch = this._db.batch();
          count = 0;
        }
      }
      if (count > 0) {
        await this._retry(() => batch.commit(), 'batchDelete(' + store + ')');
      }
      return ids.length;
    }

    // ── Realtime listener ──
    // Returns unsubscribe function. Caller WAJIB call unsubscribe di cleanup.
    onSnapshot(store, opts, callback, errCallback) {
      // Normalize args: support (store, callback, errCallback) atau (store, opts, callback, errCallback)
      if (typeof opts === 'function') {
        errCallback = callback;
        callback = opts;
        opts = {};
      }
      const unsubscribe = this._col(store).onSnapshot(
        { includeMetadataChanges: opts.includeMetadataChanges || false },
        (snap) => {
          const changes = snap.docChanges().map(c => ({
            type: c.type,
            id: c.doc.id,
            data: c.doc.exists ? c.doc.data() : null
          }));
          callback({
            changes,
            docs: snap.docs.map(d => {
              const data = d.data();
              delete data._ts; delete data._etag; delete data._srvTs;
              return { id: d.id, data };
            }),
            size: snap.size,
            empty: snap.empty
          });
        },
        (err) => {
          console.warn('[FirestoreService] onSnapshot error on', store, err);
          if (errCallback) errCallback(err);
        }
      );
      return unsubscribe;
    }
  }

  // Expose ke window
  window.FirestoreService = FirestoreService;
  console.log('[FirestoreService] Loaded. Use FirestoreService.getInstance(db, nsFn)');
})();
