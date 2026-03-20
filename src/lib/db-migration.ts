import type { EndfieldGachaCharacter, EndfieldGachaWeapon } from './api';
import { insertCharacters, insertWeaponPools, insertWeapons, recalculateAllPity } from './db';

const STORAGE_KEY = 'protorig_app_pulls';

/**
 * One-time migration from localStorage to the SQLite database.
 * Reads the existing `protorig_app_pulls` key, inserts records into the DB,
 * then removes the localStorage entry.
 *
 * Safe to call multiple times — it's a no-op if the key doesn't exist.
 */
export async function migrateFromLocalStorage(): Promise<void> {
  const cached = localStorage.getItem(STORAGE_KEY);
  if (!cached) return;

  try {
    const parsed = JSON.parse(cached);

    let characters: EndfieldGachaCharacter[] = [];
    let weapons: EndfieldGachaWeapon[] = [];

    if (Array.isArray(parsed)) {
      // Legacy array-based storage: only contains characters
      characters = parsed;
    } else {
      // New object-based storage
      characters = parsed.characters || [];
      weapons = parsed.weapons || [];
    }

    if (characters.length > 0) {
      await insertCharacters(characters);
    }
    if (weapons.length > 0) {
      // Extract unique weapon pools from individual records
      const poolMap = new Map<string, string>();
      for (const w of weapons) {
        if (w.poolId && w.poolName) {
          poolMap.set(w.poolId, w.poolName);
        }
      }
      const uniquePools = Array.from(poolMap, ([poolId, poolName]) => ({ poolId, poolName }));
      await insertWeaponPools(uniquePools);
      await insertWeapons(weapons);
    }
    
    await recalculateAllPity();

    // Migration successful — remove the localStorage entry
    localStorage.removeItem(STORAGE_KEY);
    console.log(`[db-migration] Migrated ${characters.length} characters and ${weapons.length} weapons from localStorage to SQLite.`);
  } catch (err) {
    console.error('[db-migration] Failed to migrate from localStorage:', err);
    // Don't remove the key if migration failed — user can retry
  }
}
