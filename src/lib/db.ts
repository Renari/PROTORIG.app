import { connect, type Database } from '@tursodatabase/database-wasm/bundle';
import type { EndfieldGachaCharacter, EndfieldGachaWeapon, EndfieldGachaWeaponPool } from './api';
import { CHARACTER_GACHA_POOL_TYPES, KNOWN_BANNERS } from './banners';

// Row types for SQLite query results (Turso types all rows as `any`)
interface MaxIdRow { max_id: number | null }
interface CharacterPullRow {
  seq_id: number; pool_id: string; rarity: number; char_id: string;
  char_name: string; is_free: number; is_new: number; gacha_ts: number;
  pity: number | null; pool_name: string;
}
interface WeaponPullRow {
  seq_id: number; pool_id: string; rarity: number; weapon_id: string;
  weapon_name: string; weapon_type: string; is_new: number; gacha_ts: number;
  pity: number | null; pool_name: string;
}
interface PoolRow { id: string; featured: string | null; guarantee: number }
interface PoolTypeRow { id: string; pity_6: number; pity_5: number }
interface CharacterPityRow {
  seq_id: number; pool_id: string; rarity: number; char_id: string;
  is_free: number; gacha_ts: number;
}
interface WeaponPityRow { seq_id: number; rarity: number; weapon_id: string }

let db: Database | null = null;

/**
 * Initialize the database. Creates/opens the OPFS-persisted SQLite database,
 * creates tables if they don't exist, and seeds static lookup data.
 */
export async function initDb(): Promise<void> {
  if (db) return;

  db = await connect('protorig.db');

  // Use DELETE journal mode instead of WAL to avoid OPFS WAL corruption.
  // WAL files can end up in an inconsistent state when the OPFS access handle
  // is released and re-acquired between open/close cycles, causing:
  //   "short read on WAL frame ... expected 4096 bytes, got 4294967295"
  // DELETE mode removes the journal after each transaction, sidestepping this.
  // Also checkpoint any existing WAL from prior sessions before switching.
  await db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  await db.exec("PRAGMA journal_mode='delete'");

  // Create tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS pool_type (
      id TEXT PRIMARY KEY,
      pity_6 INTEGER NOT NULL,
      pity_5 INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pools (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      pool_name TEXT NOT NULL,
      featured TEXT,
      guarantee INTEGER,
      FOREIGN KEY (type) REFERENCES pool_type(id)
    );

    CREATE TABLE IF NOT EXISTS characters (
      seq_id INTEGER PRIMARY KEY,
      pool_id TEXT NOT NULL,
      rarity INTEGER NOT NULL,
      char_id TEXT NOT NULL,
      char_name TEXT NOT NULL,
      is_free INTEGER NOT NULL DEFAULT 0,
      is_new INTEGER NOT NULL DEFAULT 0,
      gacha_ts INTEGER NOT NULL,
      pity INTEGER,
      FOREIGN KEY (pool_id) REFERENCES pools(id)
    );

    CREATE TABLE IF NOT EXISTS weapons (
      seq_id INTEGER PRIMARY KEY,
      pool_id TEXT NOT NULL,
      rarity INTEGER NOT NULL,
      weapon_id TEXT NOT NULL,
      weapon_name TEXT NOT NULL,
      weapon_type TEXT NOT NULL DEFAULT '',
      is_new INTEGER NOT NULL DEFAULT 0,
      gacha_ts INTEGER NOT NULL,
      pity INTEGER,
      FOREIGN KEY (pool_id) REFERENCES pools(id)
    );
  `);

  // Create/recreate views for convenient querying using snake_case
  await db.exec(`DROP VIEW IF EXISTS character_pulls`);
  await db.exec(`
    CREATE VIEW character_pulls AS
    SELECT c.seq_id, c.pool_id, c.rarity, c.char_id, c.char_name, c.is_free, c.is_new, c.gacha_ts, c.pity,
           COALESCE(p.pool_name, c.pool_id) AS pool_name
    FROM characters c
    LEFT JOIN pools p ON c.pool_id = p.id
  `);

  await db.exec(`DROP VIEW IF EXISTS weapon_pulls`);
  await db.exec(`
    CREATE VIEW weapon_pulls AS
    SELECT w.seq_id, w.pool_id, w.rarity, w.weapon_id, w.weapon_name, w.weapon_type, w.is_new, w.gacha_ts, w.pity,
           COALESCE(p.pool_name, w.pool_id) AS pool_name
    FROM weapons w
    LEFT JOIN pools p ON w.pool_id = p.id
  `);

  // Seed pool_type (idempotent via INSERT OR IGNORE)
  const seedPoolType = db.prepare(
    'INSERT OR IGNORE INTO pool_type (id, pity_6, pity_5) VALUES (?, ?, ?)'
  );
  await seedPoolType.run(CHARACTER_GACHA_POOL_TYPES.SPECIAL, 0, 0);
  await seedPoolType.run(CHARACTER_GACHA_POOL_TYPES.STANDARD, 0, 0);
  await seedPoolType.run(CHARACTER_GACHA_POOL_TYPES.BEGINNER, 0, 0);

  // Seed pools dynamically from JSON config (idempotent via INSERT OR IGNORE)
  const seedPool = db.prepare(
    'INSERT OR IGNORE INTO pools (id, type, pool_name, featured, guarantee) VALUES (?, ?, ?, ?, ?)'
  );
  for (const banner of KNOWN_BANNERS) {
    if (banner.poolType === "weapon") {
      await seedPoolType.run(banner.id, 0, 0);
      await seedPool.run(banner.id, banner.id, banner.poolName, banner.featured, 0);
    } else {
      await seedPool.run(banner.id, banner.poolType, banner.poolName, banner.featured || null, 0);
    }
  }
}

/**
 * Close the database and instantly surrender OPFS access handles.
 */
export async function closeDb(): Promise<void> {
  if (db) {
    try {
      // Flush any pending WAL data before releasing the OPFS access handle.
      // This prevents "short read on WAL frame" errors on the next open.
      await db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch (_) {
      // Best-effort; may fail if already in DELETE mode or db is broken
    }
    try {
      db.close();
    } catch (err) {
      // Ignored
    }
    db = null;
  }
}

/**
 * Get the database instance. Throws if not initialized.
 */
export function getDb(): Database {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

/**
 * Insert character gacha records.
 */
export async function insertCharacters(chars: EndfieldGachaCharacter[]): Promise<void> {
  const insert = db!.prepare(`
    INSERT OR REPLACE INTO characters (seq_id, pool_id, rarity, char_id, char_name, is_free, is_new, gacha_ts, pity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db!.transaction(async (items: EndfieldGachaCharacter[]) => {
    for (const c of items) {
      await insert.run(
        Number(c.seqId),
        c.poolId,
        c.rarity,
        c.charId,
        c.charName,
        c.isFree ? 1 : 0,
        c.isNew ? 1 : 0,
        Number(c.gachaTs),
        null
      );
    }
  });

  await tx(chars);
}

/**
 * Insert weapon pool metadata into the pools table.
 */
export async function insertWeaponPools(pools: EndfieldGachaWeaponPool[]): Promise<void> {
  const insertPoolType = db!.prepare(
    'INSERT OR IGNORE INTO pool_type (id, pity_6, pity_5) VALUES (?, ?, ?)'
  );
  const insertPool = db!.prepare(
    'INSERT OR IGNORE INTO pools (id, type, pool_name) VALUES (?, ?, ?)'
  );
  
  for (const pool of pools) {
    // Weapons get a bespoke pool_type entry per-pool for independent pity tracking
    await insertPoolType.run(pool.poolId, 0, 0);
    await insertPool.run(pool.poolId, pool.poolId, pool.poolName);
  }
}

/**
 * Insert weapon gacha records.
 */
export async function insertWeapons(weapons: EndfieldGachaWeapon[]): Promise<void> {
  const insert = db!.prepare(`
    INSERT OR REPLACE INTO weapons (seq_id, pool_id, rarity, weapon_id, weapon_name, weapon_type, is_new, gacha_ts, pity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db!.transaction(async (items: EndfieldGachaWeapon[]) => {
    for (const w of items) {
      await insert.run(
        Number(w.seqId),
        w.poolId,
        w.rarity,
        w.weaponId,
        w.weaponName,
        w.weaponType || '',
        w.isNew ? 1 : 0,
        Number(w.gachaTs),
        null
      );
    }
  });

  await tx(weapons);
}

/**
 * Get all character records sorted by gacha_ts ascending.
 */
export async function getAllCharacters(): Promise<EndfieldGachaCharacter[]> {
  const rows = await db!.prepare(`
    SELECT * FROM character_pulls ORDER BY gacha_ts ASC
  `).all();

  return (rows as CharacterPullRow[]).map((r) => ({
    seqId: String(r.seq_id),
    poolId: r.pool_id,
    poolName: r.pool_name,
    rarity: r.rarity,
    charId: r.char_id,
    charName: r.char_name,
    isFree: r.is_free === 1,
    isNew: r.is_new === 1,
    gachaTs: String(r.gacha_ts),
    pity: r.pity,
  }));
}

/**
 * Get all weapon records sorted by gacha_ts ascending.
 */
export async function getAllWeapons(): Promise<EndfieldGachaWeapon[]> {
  const rows = await db!.prepare(`
    SELECT * FROM weapon_pulls ORDER BY gacha_ts ASC
  `).all();

  return (rows as WeaponPullRow[]).map((r) => ({
    seqId: String(r.seq_id),
    poolId: r.pool_id,
    poolName: r.pool_name,
    rarity: r.rarity,
    weaponId: r.weapon_id,
    weaponName: r.weapon_name,
    weaponType: r.weapon_type,
    isNew: r.is_new === 1,
    gachaTs: String(r.gacha_ts),
    pity: r.pity,
  }));
}

/**
 * Get the highest seqId currently stored for characters.
 */
export async function getMaxCharacterSeqId(): Promise<number> {
  const row = await db!.prepare('SELECT MAX(seq_id) as max_id FROM characters').get() as MaxIdRow | undefined;
  return Number(row?.max_id ?? 0);
}

/**
 * Get the highest seqId currently stored for weapons.
 */
export async function getMaxWeaponSeqId(): Promise<number> {
  const row = await db!.prepare('SELECT MAX(seq_id) as max_id FROM weapons').get() as MaxIdRow | undefined;
  return Number(row?.max_id ?? 0);
}

/**
 * Delete all character and weapon records (but keep pool_type/pools seed data).
 */
export async function clearAllData(): Promise<void> {
  await db!.exec('DELETE FROM characters; DELETE FROM weapons;');
}

/**
 * Loops through all pulls chronologically per pool_type and back-calculates
 * running pity onto every pull, saving the final results into pool_type and pools.
 */
export async function recalculateAllPity(): Promise<void> {
  const charUpdates: { seq_id: number; pity: number | null }[] = [];
  const weaponUpdates: { seq_id: number; pity: number | null }[] = [];
  const poolTypeUpdates: { id: string; pity_6: number; pity_5: number }[] = [];
  const poolUpdates: { id: string; guarantee: number }[] = [];

  // --- 1. Calculate Character Pity ---
  // Characters share pity across their pool_type (e.g. SPECIAL, STANDARD)
  for (const poolType of Object.values(CHARACTER_GACHA_POOL_TYPES)) {
    const poolsForType = await db!.prepare('SELECT id, featured FROM pools WHERE type = ?').all(poolType) as PoolRow[];
    const guaranteeCounts: Record<string, number> = {};
    for (const p of poolsForType) {
      guaranteeCounts[p.id] = 0;
    }

    let pity6 = 0;
    let pity5 = 0;

    const pulls = await db!.prepare(`
      SELECT c.seq_id, c.pool_id, c.rarity, c.char_id, c.is_free, c.gacha_ts
      FROM characters c
      JOIN pools p ON p.id = c.pool_id
      WHERE p.type = ?
      ORDER BY c.seq_id ASC
    `).all(poolType) as CharacterPityRow[];

    for (const pull of pulls) {
      const isFree = pull.is_free === 1;
      const rarity = pull.rarity;
      const poolId = pull.pool_id;

      if (isFree) {
        charUpdates.push({ seq_id: pull.seq_id, pity: null });
        continue;
      }

      pity6++;
      pity5++;
      guaranteeCounts[poolId] = (guaranteeCounts[poolId] || 0) + 1;

      let assignedPity: number | null = null;
      if (rarity === 6) assignedPity = pity6;
      else if (rarity === 5) assignedPity = pity5;

      charUpdates.push({ seq_id: pull.seq_id, pity: assignedPity });

      if (rarity === 6) {
        pity6 = 0;
        pity5 = 0;
      }
      if (rarity === 5) pity5 = 0;

    }

    poolTypeUpdates.push({ id: poolType, pity_6: pity6, pity_5: pity5 });
    for (const [poolId, guarantee] of Object.entries(guaranteeCounts)) {
      poolUpdates.push({ id: poolId, guarantee });
    }
  }

  // --- 2. Calculate Weapon Pity ---
  // Weapons have 1:1 pool_type and pool_id, so they do not share pity across banners.
  const weaponTypeQuery = `
    SELECT id FROM pool_type 
    WHERE id NOT IN (${Object.values(CHARACTER_GACHA_POOL_TYPES).map(() => '?').join(', ')})
  `;
  const weaponPoolTypes = await db!.prepare(weaponTypeQuery).all(...Object.values(CHARACTER_GACHA_POOL_TYPES)) as PoolTypeRow[];

  for (const ptRow of weaponPoolTypes) {
    const poolType = ptRow.id;
    const poolId = poolType; // For weapons, they are identical
    let pity6 = 0;
    let pity5 = 0;
    let guarantee = 0;

    const pulls = await db!.prepare(`
      SELECT w.seq_id, w.rarity, w.weapon_id
      FROM weapons w
      WHERE w.pool_id = ?
      ORDER BY w.seq_id ASC
    `).all(poolId) as WeaponPityRow[];

    for (const pull of pulls) {
      const rarity = pull.rarity;

      pity6++;
      pity5++;
      guarantee++;

      let assignedPity: number | null = null;
      if (rarity === 6) assignedPity = pity6;
      else if (rarity === 5) assignedPity = pity5;

      weaponUpdates.push({ seq_id: pull.seq_id, pity: assignedPity });

      if (rarity === 6) {
        pity6 = 0;
        pity5 = 0;
      }
      if (rarity === 5) pity5 = 0;
    }

    poolTypeUpdates.push({ id: poolType, pity_6: pity6, pity_5: pity5 });
    poolUpdates.push({ id: poolId, guarantee });
  }

  // Bulk update inside a transaction for performance
  const tx = db!.transaction(async () => {
    // Reset defaults
    await db!.exec('UPDATE pool_type SET pity_6 = 0, pity_5 = 0');
    await db!.exec('UPDATE pools SET guarantee = 0');
    await db!.exec('UPDATE characters SET pity = NULL');
    await db!.exec('UPDATE weapons SET pity = NULL');

    const updChar = db!.prepare('UPDATE characters SET pity = ? WHERE seq_id = ?');
    for (const u of charUpdates) await updChar.run(u.pity, u.seq_id);

    const updWeapon = db!.prepare('UPDATE weapons SET pity = ? WHERE seq_id = ?');
    for (const u of weaponUpdates) await updWeapon.run(u.pity, u.seq_id);

    const updPoolType = db!.prepare('UPDATE pool_type SET pity_6 = ?, pity_5 = ? WHERE id = ?');
    for (const u of poolTypeUpdates) await updPoolType.run(u.pity_6, u.pity_5, u.id);

    const updPool = db!.prepare('UPDATE pools SET guarantee = ? WHERE id = ?');
    for (const u of poolUpdates) await updPool.run(u.guarantee, u.id);
  });

  await tx();
}

export interface PityStats {
  poolTypes: Record<string, { pity6: number; pity5: number }>;
  guarantees: Record<string, number>;
}

/**
 * Returns the current running totals of pity and guarantee across all pools and pool types.
 */
export async function getPityStats(): Promise<PityStats> {
  if (!db) return { poolTypes: {}, guarantees: {} };

  const poolTypeRows = await db.prepare('SELECT id, pity_6, pity_5 FROM pool_type').all() as PoolTypeRow[];
  const poolRows = await db.prepare('SELECT id, guarantee FROM pools').all() as PoolRow[];

  const poolTypes: Record<string, { pity6: number; pity5: number }> = {};
  for (const r of poolTypeRows) {
    poolTypes[r.id] = { pity6: r.pity_6, pity5: r.pity_5 };
  }

  const guarantees: Record<string, number> = {};
  for (const r of poolRows) {
    guarantees[r.id] = r.guarantee || 0;
  }

  return { poolTypes, guarantees };
}
