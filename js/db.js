// Küçük IndexedDB yardımcıları
const DB_NAME = 'memo-fr', VER = 1;
let dbp = null;
const STORES = ['decks', 'words', 'cards', 'texts', 'days', 'meta'];

export function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('decks', { keyPath: 'id', autoIncrement: true });
      d.createObjectStore('words', { keyPath: 'id', autoIncrement: true });
      d.createObjectStore('cards', { keyPath: 'id', autoIncrement: true });
      d.createObjectStore('texts', { keyPath: 'id', autoIncrement: true });
      d.createObjectStore('days', { keyPath: 'date' });
      d.createObjectStore('meta', { keyPath: 'key' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

const done = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export async function getAll(store) {
  const d = await openDB();
  return done(d.transaction(store).objectStore(store).getAll());
}

export async function put(store, val) {
  const d = await openDB();
  const tx = d.transaction(store, 'readwrite');
  const key = await done(tx.objectStore(store).put(val));
  if (val && typeof val === 'object' && val.id == null && store !== 'days' && store !== 'meta') val.id = key;
  return key;
}

export async function del(store, key) {
  const d = await openDB();
  return done(d.transaction(store, 'readwrite').objectStore(store).delete(key));
}

// Çok kayıt ekle/güncelle; otomatik id'leri nesnelere yazar
export async function bulkPut(store, items) {
  if (!items.length) return;
  const d = await openDB();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    for (const it of items) {
      const rq = os.put(it);
      rq.onsuccess = () => { if (it.id == null && store !== 'days' && store !== 'meta') it.id = rq.result; };
    }
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}

export async function bulkDel(store, keys) {
  if (!keys.length) return;
  const d = await openDB();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    keys.forEach(k => os.delete(k));
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function clearAll() {
  const d = await openDB();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORES, 'readwrite');
    STORES.forEach(s => tx.objectStore(s).clear());
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
