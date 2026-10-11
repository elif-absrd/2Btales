import type { MetaRecord, PhotoRecord } from './types';

const DB_NAME = 'little-seasons-photobook';
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('This browser does not support local photo storage. Try a current version of Chrome, Edge, Firefox, or Safari.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('photos')) {
        const photos = db.createObjectStore('photos', { keyPath: 'id' });
        photos.createIndex('order', 'order', { unique: false });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local photo storage.'));
  });
}

async function withStore<T>(storeName: 'photos' | 'meta', mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result: T | undefined;
    try {
      const request = action(store);
      if (request) {
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error ?? new Error('The storage request failed.'));
      }
    } catch (error) {
      reject(error);
    }
    transaction.oncomplete = () => { db.close(); resolve(result); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error('The storage transaction failed.')); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error('The storage transaction was cancelled.')); };
  });
}

export async function getAllPhotos(): Promise<PhotoRecord[]> {
  const records = await withStore<PhotoRecord[]>('photos', 'readonly', store => store.getAll());
  return (records ?? []).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

export async function putPhoto(photo: PhotoRecord): Promise<void> {
  await withStore<IDBValidKey>('photos', 'readwrite', store => store.put(photo));
}

export async function putPhotos(photos: PhotoRecord[]): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('photos', 'readwrite');
    const store = transaction.objectStore('photos');
    photos.forEach(photo => store.put(photo));
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error('Could not save the scrapbook.')); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? new Error('Saving the scrapbook was cancelled.')); };
  });
}

export async function removePhoto(id: string): Promise<void> {
  await withStore<undefined>('photos', 'readwrite', store => store.delete(id));
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const record = await withStore<MetaRecord<T>>('meta', 'readonly', store => store.get(key));
  return record?.value;
}

export async function putMeta<T>(key: string, value: T): Promise<void> {
  await withStore<IDBValidKey>('meta', 'readwrite', store => store.put({ key, value } satisfies MetaRecord<T>));
}
