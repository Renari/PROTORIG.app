import { connect, type Database } from '@tursodatabase/database-wasm/bundle';
import type { EndfieldGachaCharacter, EndfieldGachaWeapon, EndfieldGachaWeaponPool } from './api';
import { GACHA_POOL_TYPES } from './banners';

let db: Database | null = null;

/**
 * Initialize the database. Creates/opens the OPFS-persisted SQLite database,
 * creates tables if they don't exist, and seeds static lookup data.
 */
export async function initDb(): Promise<void> {
  if (db) return;

  db = await connect('protorig.db');

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
  await seedPoolType.run(GACHA_POOL_TYPES.SPECIAL, 36, 5);
  await seedPoolType.run(GACHA_POOL_TYPES.STANDARD, 39, 0);
  await seedPoolType.run(GACHA_POOL_TYPES.BEGINNER, 0, 1);
  await seedPoolType.run('Weapon', 40, 0);

  // Seed pools (idempotent via INSERT OR IGNORE)
  const seedPool = db.prepare(
    'INSERT OR IGNORE INTO pools (id, type, pool_name, featured, guarantee) VALUES (?, ?, ?, ?, ?)'
  );
  await seedPool.run('special_1_1_1', GACHA_POOL_TYPES.SPECIAL, "River's Daughter", 'chr_0027_tangtang', 36);
  await seedPool.run('special_1_0_2', GACHA_POOL_TYPES.SPECIAL, 'Hues of Passion', 'chr_0017_yvonne', 30);
  await seedPool.run('special_1_0_3', GACHA_POOL_TYPES.SPECIAL, 'The Floaty Messenger', 'chr_0013_aglina', 23);
  await seedPool.run('special_1_0_1', GACHA_POOL_TYPES.SPECIAL, 'Scars of the Forge', 'chr_0016_laevat', 30);
  await seedPool.run('standard', GACHA_POOL_TYPES.STANDARD, 'Basic Headhunting', null, null);
  await seedPool.run('beginner', GACHA_POOL_TYPES.BEGINNER, 'New Horizons', null, null);
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
  const insert = db!.prepare(
    'INSERT OR IGNORE INTO pools (id, type, pool_name) VALUES (?, ?, ?)'
  );
  for (const pool of pools) {
    await insert.run(pool.poolId, GACHA_POOL_TYPES.WEAPON, pool.poolName);
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

  return rows.map((r: any) => ({
    seqId: String(r.seq_id),
    poolId: r.pool_id,
    poolName: r.pool_name,
    rarity: r.rarity,
    charId: r.char_id,
    charName: r.char_name,
    isFree: r.is_free === 1,
    isNew: r.is_new === 1,
    gachaTs: String(r.gacha_ts),
  }));
}

/**
 * Get all weapon records sorted by gacha_ts ascending.
 */
export async function getAllWeapons(): Promise<EndfieldGachaWeapon[]> {
  const rows = await db!.prepare(`
    SELECT * FROM weapon_pulls ORDER BY gacha_ts ASC
  `).all();

  return rows.map((r: any) => ({
    seqId: String(r.seq_id),
    poolId: r.pool_id,
    poolName: r.pool_name,
    rarity: r.rarity,
    weaponId: r.weapon_id,
    weaponName: r.weapon_name,
    weaponType: r.weapon_type,
    isNew: r.is_new === 1,
    gachaTs: String(r.gacha_ts),
  }));
}

/**
 * Delete all character and weapon records (but keep pool_type/pools seed data).
 */
export async function clearAllData(): Promise<void> {
  await db!.exec('DELETE FROM characters; DELETE FROM weapons;');
}
