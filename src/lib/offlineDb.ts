import { openDB, type DBSchema, type IDBPDatabase } from "idb";

interface OfflineAction {
  id: string;
  table: string;
  type: "insert";
  payload: Record<string, unknown>;
  createdAt: number;
  isSynced: boolean;
}

interface WonderAquaDB extends DBSchema {
  syncQueue: {
    key: string;
    value: OfflineAction;
    indexes: { "by-synced": boolean };
  };
}

let dbPromise: Promise<IDBPDatabase<WonderAquaDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<WonderAquaDB>("wonder-aqua-offline", 1, {
      upgrade(db) {
        const store = db.createObjectStore("syncQueue", { keyPath: "id" });
        store.createIndex("by-synced", "isSynced");
      },
    });
  }
  return dbPromise;
}

export async function queueOfflineAction(
  table: string,
  payload: Record<string, unknown>
): Promise<string> {
  const db = await getDb();
  const id = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.put("syncQueue", {
    id,
    table,
    type: "insert",
    payload: { ...payload, _offline_id: id },
    createdAt: Date.now(),
    isSynced: false,
  });
  return id;
}

export async function getUnsyncedActions(): Promise<OfflineAction[]> {
  const db = await getDb();
  return db.getAllFromIndex("syncQueue", "by-synced", false);
}

export async function markSynced(id: string): Promise<void> {
  const db = await getDb();
  const action = await db.get("syncQueue", id);
  if (action) {
    action.isSynced = true;
    await db.put("syncQueue", action);
  }
}

export async function getQueueCount(): Promise<number> {
  const db = await getDb();
  return db.countFromIndex("syncQueue", "by-synced", false);
}

export async function clearSyncedActions(): Promise<void> {
  const db = await getDb();
  const synced = await db.getAllFromIndex("syncQueue", "by-synced", true);
  const tx = db.transaction("syncQueue", "readwrite");
  for (const item of synced) {
    await tx.store.delete(item.id);
  }
  await tx.done;
}
