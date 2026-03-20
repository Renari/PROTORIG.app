import { connect, type Database } from '@tursodatabase/database-wasm/bundle';
import type { EndfieldGachaCharacter, EndfieldGachaWeapon } from './api';

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
    CREATE TABLE IF NOT EXISTS poolType (
      id TEXT PRIMARY KEY,
      pity6 INTEGER NOT NULL,
      pity5 INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pools (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      poolName TEXT NOT NULL,
      featuredCharacter TEXT,
      guarantee INTEGER,
      FOREIGN KEY (type) REFERENCES poolType(id)
    );

    CREATE TABLE IF NOT EXISTS characters (
      seqId INTEGER PRIMARY KEY,
      poolId TEXT NOT NULL,
      rarity INTEGER NOT NULL,
      charId TEXT NOT NULL,
      charName TEXT NOT NULL,
      isFree INTEGER NOT NULL DEFAULT 0,
      isNew INTEGER NOT NULL DEFAULT 0,
      gachaTs INTEGER NOT NULL,
      pity INTEGER,
      FOREIGN KEY (poolId) REFERENCES pools(id)
    );

    CREATE TABLE IF NOT EXISTS weapons (
      seqId INTEGER PRIMARY KEY,
      poolId TEXT NOT NULL,
      rarity INTEGER NOT NULL,
      weaponId TEXT NOT NULL,
      weaponName TEXT NOT NULL,
      weaponType TEXT NOT NULL DEFAULT '',
      isNew INTEGER NOT NULL DEFAULT 0,
      gachaTs INTEGER NOT NULL,
      pity INTEGER,
      FOREIGN KEY (poolId) REFERENCES pools(id)
    );
  `);

  // Seed poolType (idempotent via INSERT OR IGNORE)
  const seedPoolType = db.prepare(
    'INSERT OR IGNORE INTO poolType (id, pity6, pity5) VALUES (?, ?, ?)'
  );
  await seedPoolType.run('E_CharacterGachaPoolType_Special', 36, 5);
  await seedPoolType.run('E_CharacterGachaPoolType_Standard', 39, 0);
  await seedPoolType.run('E_CharacterGachaPoolType_Beginner', 0, 1);

  // Seed pools (idempotent via INSERT OR IGNORE)
  const seedPool = db.prepare(
    'INSERT OR IGNORE INTO pools (id, type, poolName, featuredCharacter, guarantee) VALUES (?, ?, ?, ?, ?)'
  );
  await seedPool.run('special_1_1_1', 'E_CharacterGachaPoolType_Special', "River's Daughter", 'chr_0027_tangtang', 36);
  await seedPool.run('special_1_0_2', 'E_CharacterGachaPoolType_Special', 'Hues of Passion', 'chr_0017_yvonne', 30);
  await seedPool.run('special_1_0_3', 'E_CharacterGachaPoolType_Special', 'The Floaty Messenger', 'chr_0013_aglina', 23);
  await seedPool.run('special_1_0_1', 'E_CharacterGachaPoolType_Special', 'Scars of the Forge', 'chr_0016_laevat', 30);
  await seedPool.run('standard', 'E_CharacterGachaPoolType_Standard', 'Basic Headhunting', null, null);
  await seedPool.run('beginner', 'E_CharacterGachaPoolType_Beginner', 'New Horizons', null, null);
}

/**
 * Get the database instance. Throws if not initialized.
 */
export function getDb(): Database {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

/**
 * Insert character gacha records. Uses INSERT OR REPLACE for idempotent re-imports.
 */
export async function insertCharacters(chars: EndfieldGachaCharacter[]): Promise<void> {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO characters (seqId, poolId, rarity, charId, charName, isFree, isNew, gachaTs, pity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(async (items: EndfieldGachaCharacter[]) => {
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
 * Insert weapon gacha records. Uses INSERT OR REPLACE for idempotent re-imports.
 */
export async function insertWeapons(weapons: EndfieldGachaWeapon[]): Promise<void> {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO weapons (seqId, poolId, rarity, weaponId, weaponName, weaponType, isNew, gachaTs, pity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(async (items: EndfieldGachaWeapon[]) => {
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

/** Row shape returned by the bundle's .all(), all column names are lowercase. */
interface CharacterRow {
  seqid: number;
  poolid: string;
  rarity: number;
  charid: string;
  charname: string;
  isfree: number;
  isnew: number;
  gachats: number;
  pity: number | null;
  poolname: string | null;
}

interface WeaponRow {
  seqid: number;
  poolid: string;
  rarity: number;
  weaponid: string;
  weaponname: string;
  weapontype: string;
  isnew: number;
  gachats: number;
  pity: number | null;
  poolname: string | null;
}

/**
 * Get all character records sorted by gachaTs ascending.
 * Converts SQLite integer booleans back to JS booleans and gachaTs back to string.
 */
export async function getAllCharacters(): Promise<EndfieldGachaCharacter[]> {
  const rows: CharacterRow[] = await db!.prepare(`
    SELECT c.seqId, c.poolId, c.rarity, c.charId, c.charName, c.isFree, c.isNew, c.gachaTs, c.pity,
           p.poolName
    FROM characters c
    LEFT JOIN pools p ON c.poolId = p.id
    ORDER BY c.gachaTs ASC
  `).all();

  return rows.map((r) => ({
    seqId: String(r.seqid),
    poolId: r.poolid,
    poolName: r.poolname || r.poolid,
    rarity: r.rarity,
    charId: r.charid,
    charName: r.charname,
    isFree: r.isfree === 1,
    isNew: r.isnew === 1,
    gachaTs: String(r.gachats),
  }));
}

/**
 * Get all weapon records sorted by gachaTs ascending.
 * Converts SQLite integer booleans back to JS booleans and gachaTs back to string.
 */
export async function getAllWeapons(): Promise<EndfieldGachaWeapon[]> {
  const rows: WeaponRow[] = await db!.prepare(`
    SELECT w.seqId, w.poolId, w.rarity, w.weaponId, w.weaponName, w.weaponType, w.isNew, w.gachaTs, w.pity,
           p.poolName
    FROM weapons w
    LEFT JOIN pools p ON w.poolId = p.id
    ORDER BY w.gachaTs ASC
  `).all();

  return rows.map((r) => ({
    seqId: String(r.seqid),
    poolId: r.poolid,
    poolName: r.poolname || r.poolid,
    rarity: r.rarity,
    weaponId: r.weaponid,
    weaponName: r.weaponname,
    weaponType: r.weapontype,
    isNew: r.isnew === 1,
    gachaTs: String(r.gachats),
  }));
}

/**
 * Delete all character and weapon records (but keep poolType/pools seed data).
 */
export async function clearAllData(): Promise<void> {
  await db.exec('DELETE FROM characters; DELETE FROM weapons;');
}
