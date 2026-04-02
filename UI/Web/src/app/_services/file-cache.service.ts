import {Injectable} from '@angular/core';

interface CachedFileEntry {
  key: string;
  size: number;
  mimeType: string;
  cachedAt: string;
  lastAccessedAt: string;
  blob: Blob;
}

@Injectable({ providedIn: 'root' })
export class FileCacheService {
  private readonly DB_NAME = 'kavita-file-cache';
  private readonly STORE = 'cached-files';
  private readonly MAX_CACHE_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB
  private db: IDBDatabase | null = null;
  private _dbPromise: Promise<IDBDatabase> | null = null;

  private ensureDb(): Promise<IDBDatabase> {
    if (this._dbPromise) return this._dbPromise;
    this._dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, 1);
      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.STORE)) {
          db.createObjectStore(this.STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve(this.db);
      };
      req.onerror = () => {
        this._dbPromise = null;
        reject(req.error);
      };
    });
    return this._dbPromise;
  }

  async get(key: string): Promise<Blob | null> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readwrite');
      const store = tx.objectStore(this.STORE);
      const getReq = store.get(key);
      getReq.onsuccess = () => {
        const entry = getReq.result as CachedFileEntry | undefined;
        if (!entry) {
          resolve(null);
          return;
        }
        // Update lastAccessedAt
        entry.lastAccessedAt = new Date().toISOString();
        store.put(entry);
        resolve(entry.blob);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  async put(key: string, blob: Blob, mimeType: string): Promise<void> {
    const db = await this.ensureDb();
    const now = new Date().toISOString();
    const entry: CachedFileEntry = {
      key,
      blob,
      size: blob.size,
      mimeType,
      cachedAt: now,
      lastAccessedAt: now,
    };

    await this.storeEntry(db, entry);
    await this.evictIfNeeded(db);
  }

  async delete(key: string): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readwrite');
      const req = tx.objectStore(this.STORE).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async clear(): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readwrite');
      const req = tx.objectStore(this.STORE).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getTotalSize(): Promise<number> {
    const entries = await this.getAllEntries();
    return entries.reduce((sum, e) => sum + e.size, 0);
  }

  private storeEntry(db: IDBDatabase, entry: CachedFileEntry): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readwrite');
      const req = tx.objectStore(this.STORE).put(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private async evictIfNeeded(db: IDBDatabase): Promise<void> {
    const entries = await this.getAllEntries();
    let totalSize = entries.reduce((sum, e) => sum + e.size, 0);

    if (totalSize <= this.MAX_CACHE_SIZE_BYTES) return;

    // Sort by lastAccessedAt ascending (oldest first)
    entries.sort((a, b) => a.lastAccessedAt.localeCompare(b.lastAccessedAt));

    for (const entry of entries) {
      if (totalSize <= this.MAX_CACHE_SIZE_BYTES) break;
      await this.deleteEntry(db, entry.key);
      totalSize -= entry.size;
    }
  }

  private getAllEntries(): Promise<CachedFileEntry[]> {
    return new Promise(async (resolve, reject) => {
      const db = await this.ensureDb();
      const tx = db.transaction(this.STORE, 'readonly');
      const req = tx.objectStore(this.STORE).getAll();
      req.onsuccess = () => resolve(req.result as CachedFileEntry[]);
      req.onerror = () => reject(req.error);
    });
  }

  private deleteEntry(db: IDBDatabase, key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, 'readwrite');
      const req = tx.objectStore(this.STORE).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}
