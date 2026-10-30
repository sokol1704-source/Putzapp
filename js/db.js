// Kleiner Wrapper um IndexedDB. Alle Daten bleiben lokal auf dem Gerät.
const DB = (() => {
  const NAME = 'toths-reinigung';
  const VERSION = 4;
  // Tabelle → Indizes. Fotos gehören über "visitId" zu einem Einsatz, Mangel oder Winterdienst-Eintrag.
  const STORES = {
    customers: [],
    objects: ['kundeId'],
    visits: ['kundeId', 'objektId'],
    photos: ['visitId'],
    appointments: ['kundeId', 'objektId'],
    invoices: ['kundeId'],
    settings: [],
    maengel: ['objektId'],
    winter: ['objektId'],
    angebote: [],
    ausgaben: [],
    fahrten: [],
    unterschriften: [],
    material: [],
  };
  let dbPromise;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const [name, indexes] of Object.entries(STORES)) {
          const store = db.objectStoreNames.contains(name)
            ? req.transaction.objectStore(name)
            : db.createObjectStore(name, { keyPath: 'id' });
          indexes.filter((i) => !store.indexNames.contains(i)).forEach((i) => store.createIndex(i, i));
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function tx(store, mode, fn) {
    const db = await open();
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    await new Promise((resolve, reject) => {
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
    return result instanceof IDBRequest ? result.result : result;
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  return {
    stores: Object.keys(STORES),
    uid,
    all: (store) => tx(store, 'readonly', (s) => s.getAll()),
    get: (store, id) => tx(store, 'readonly', (s) => s.get(id)),
    put: async (store, obj) => {
      if (!obj.id) obj.id = uid();
      await tx(store, 'readwrite', (s) => s.put(obj));
      return obj;
    },
    del: (store, id) => tx(store, 'readwrite', (s) => s.delete(id)),
    by: (store, index, value) => tx(store, 'readonly', (s) => s.index(index).getAll(value)),
    clear: (store) => tx(store, 'readwrite', (s) => s.clear()),
  };
})();
