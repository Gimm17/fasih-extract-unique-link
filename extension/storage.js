/* Local storage and durable outbox run only in the extension's origin. */
(function (root) {
  'use strict';
  let opening;
  function open() {
    if (!opening) opening = new Promise((resolve, reject) => {
      const req = indexedDB.open('fasih-cawi-v1', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('jobs', { keyPath: 'id' });
        db.createObjectStore('rows', { keyPath: ['jobId', 'key'] }).createIndex('jobId', 'jobId');
        db.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { opening = null; reject(req.error); };
    });
    return opening;
  }
  async function txn(stores, mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let value;
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaksi penyimpanan dibatalkan.'));
      action(tx, v => { value = v; });
    });
  }
  const request = (req, set) => { req.onsuccess = () => set(req.result); };
  const getJob = id => txn(['jobs'], 'readonly', (t, s) => request(t.objectStore('jobs').get(id), s));
  const getRows = id => txn(['rows'], 'readonly', (t, s) => request(t.objectStore('rows').index('jobId').getAll(id), s));
  const latest = scope => txn(['meta'], 'readonly', (t, s) => request(t.objectStore('meta').get(scope), s));
  const settings = () => txn(['meta'], 'readonly', (t,s)=>request(t.objectStore('meta').get('settings'),s));
  const metaGet = key => txn(['meta'],'readonly',(t,s)=>request(t.objectStore('meta').get(key),s));
  const metaPut = (key,value) => txn(['meta'],'readwrite',(t,s)=>{t.objectStore('meta').put(value,key);s(value);});
  const metaDelete = key => txn(['meta'],'readwrite',(t,s)=>{t.objectStore('meta').delete(key);s(true);});
  const outbox = () => txn(['meta'],'readonly',(t,s)=>{
    const values=[],req=t.objectStore('meta').openCursor();req.onsuccess=()=>{const c=req.result;if(!c){s(values);return;}if(String(c.key).startsWith('outbox:'))values.push({id:c.key,...c.value});c.continue();};
  });
  const setSettings = value => txn(['meta'],'readwrite',(t,s)=>{t.objectStore('meta').put(value,'settings');s(value);});
  const allJobs = () => txn(['jobs'],'readonly',(t,s)=>request(t.objectStore('jobs').getAll(),s));
  const reset = () => txn(['jobs','rows','meta'],'readwrite',(t,s)=>{for(const name of ['jobs','rows','meta'])t.objectStore(name).clear();s(true);});
  async function create(job) {
    return txn(['jobs', 'meta'], 'readwrite', (t, set) => {
      t.objectStore('jobs').add(job); t.objectStore('meta').put(job.id, job.context.scope); set(job);
    });
  }
  async function patchJob(id, patch) {
    return txn(['jobs'], 'readwrite', (t, set) => {
      const store = t.objectStore('jobs'), req = store.get(id);
      req.onsuccess = () => {
        if (!req.result) { t.abort(); return; }
        const job = { ...req.result, ...patch, id, updatedAt: new Date().toISOString() };
        store.put(job); set(job);
      };
    });
  }
  async function putRows(jobId, rows) {
    return txn(['rows'], 'readwrite', (t, set) => {
      for (const row of rows) t.objectStore('rows').put({ ...row, jobId });
      set(true);
    });
  }
  async function checkpoint(jobId, patch, rows) {
    return txn(['jobs','rows'],'readwrite',(t,set)=> {
      const store=t.objectStore('jobs'), req=store.get(jobId);
      req.onsuccess=()=> {
        if(!req.result){t.abort();return;}
        const job={...req.result,...patch,id:jobId,updatedAt:new Date().toISOString()};
        store.put(job);
        for(const row of rows)t.objectStore('rows').put({...row,jobId});
        set(job);
      };
    });
  }
  root.FasihStore = { open, getJob, getRows, latest, create, patchJob, putRows, checkpoint, settings, setSettings, allJobs, reset, metaGet, metaPut, metaDelete, outbox };
  if (typeof module !== 'undefined') module.exports = root.FasihStore;
})(globalThis);
