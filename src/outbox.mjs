// Only ciphertext and non-financial queue identifiers reach IndexedDB.
export function indexedOutbox() {
  let database;
  const db = () => database ??= new Promise((resolve,reject) => {
    const request = indexedDB.open("pdt-encrypted-outbox",1);
    request.onupgradeneeded = () => request.result.createObjectStore("operations",{keyPath:"key"});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Cannot open encrypted offline storage."));
  });
  async function act(mode, callback) {
    const database = await db();
    return new Promise((resolve,reject) => {
      const tx = database.transaction("operations",mode);
      const result = callback(tx.objectStore("operations"));
      tx.oncomplete = () => resolve(result.result);
      tx.onerror = tx.onabort = () => reject(new Error("Encrypted offline storage failed. Your change was not saved."));
    });
  }
  return {
    put: entry => act("readwrite",store=>store.put(entry)),
    remove: key => act("readwrite",store=>store.delete(key)),
    list: async namespace => (await act("readonly",store=>store.getAll())).filter(row=>row.namespace===namespace).sort((a,b)=>a.order-b.order||a.key.localeCompare(b.key)),
  };
}

export function memoryOutbox() {
  const rows = new Map();
  return {put:async row=>rows.set(row.key,structuredClone(row)),remove:async key=>rows.delete(key),list:async ns=>[...rows.values()].filter(row=>row.namespace===ns).sort((a,b)=>a.order-b.order)};
}
