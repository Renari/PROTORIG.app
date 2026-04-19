import type { EndfieldGachaCharacter, EndfieldGachaWeapon, EndfieldGachaWeaponPool } from './api';
import { CHARACTER_GACHA_POOL_TYPES, KNOWN_BANNERS } from './banners';
import {
  allSql,
  cleanupSqliteWorkerIfIdle,
  closeSqliteConnection,
  execSql,
  getOpenSqliteConnection,
  getSql,
  openSqliteConnection,
  runTransactionBatch,
  type SqliteBatchStatement,
  type SqliteConnectionInfo,
} from './sqlite/sqlite-adapter';
import { normalizeSqliteError } from './sqlite/sqlite-errors';
import {
  buildPityMutationPlan,
  mapCharacterPullRow,
  mapWeaponPullRow,
  type CharacterPityRow,
  type CharacterPullRow,
  type MaxIdRow,
  type PoolRow,
  type PoolTypeRow,
  type WeaponPityRow,
  type WeaponPullRow,
} from './db-model';

const REQUIRED_SCHEMA_OBJECTS = [
  'pool_type',
  'pools',
  'characters',
  'weapons',
  'character_pulls',
  'weapon_pulls',
] as const;

let dbReady = false;

export type Database = SqliteConnectionInfo;

function ensureDbReady(): void {
  if (!dbReady) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
}

function normalizeInitError(error: unknown): Error {
  const normalized = normalizeSqliteError(error);
  if (
    /\bSQLITE_(?:CORRUPT|NOTADB)\b/i.test(normalized.message) ||
    /database disk image is malformed/i.test(normalized.message) ||
    /not a database/i.test(normalized.message) ||
    /integrity check failed/i.test(normalized.message)
  ) {
    return new Error(
      `The local OPFS database is unreadable or corrupt. Clear this site's browser storage to recover. Original error: ${normalized.message}`,
      { cause: normalized }
    );
  }

  return normalized;
}

async function verifyDatabaseIntegrity(): Promise<void> {
  const row = await getSql<{ quick_check: string }>('PRAGMA quick_check(1);');
  if (!row || row.quick_check !== 'ok') {
    throw new Error(`Database integrity check failed: ${row?.quick_check ?? 'unknown result'}`);
  }
}

async function getExistingSchemaObjects(): Promise<Set<string>> {
  const rows = await allSql<{ name: string }>(`
    SELECT name
    FROM sqlite_master
    WHERE name IN (${REQUIRED_SCHEMA_OBJECTS.map((name) => `'${name}'`).join(', ')})
    ORDER BY name ASC
  `);

  return new Set(rows.map((row) => row.name));
}

async function ensureSchema(): Promise<void> {
  await execSql(`
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

    DROP VIEW IF EXISTS character_pulls;
    CREATE VIEW character_pulls AS
    SELECT c.seq_id, c.pool_id, c.rarity, c.char_id, c.char_name, c.is_free, c.is_new, c.gacha_ts, c.pity,
           COALESCE(p.pool_name, c.pool_id) AS pool_name
    FROM characters c
    LEFT JOIN pools p ON c.pool_id = p.id;

    DROP VIEW IF EXISTS weapon_pulls;
    CREATE VIEW weapon_pulls AS
    SELECT w.seq_id, w.pool_id, w.rarity, w.weapon_id, w.weapon_name, w.weapon_type, w.is_new, w.gacha_ts, w.pity,
           COALESCE(p.pool_name, w.pool_id) AS pool_name
    FROM weapons w
    LEFT JOIN pools p ON w.pool_id = p.id;
  `);
}

async function verifySchemaObjects(): Promise<void> {
  const found = await getExistingSchemaObjects();
  const missing = REQUIRED_SCHEMA_OBJECTS.filter((name) => !found.has(name));
  if (missing.length > 0) {
    throw new Error(`Database schema sanity check failed. Missing objects: ${missing.join(', ')}`);
  }
}

async function seedStaticData(): Promise<void> {
  const statements: SqliteBatchStatement[] = [
    {
      sql: 'INSERT OR IGNORE INTO pool_type (id, pity_6, pity_5) VALUES (:id, :pity6, :pity5)',
      bind: { id: CHARACTER_GACHA_POOL_TYPES.SPECIAL, pity6: 0, pity5: 0 },
    },
    {
      sql: 'INSERT OR IGNORE INTO pool_type (id, pity_6, pity_5) VALUES (:id, :pity6, :pity5)',
      bind: { id: CHARACTER_GACHA_POOL_TYPES.STANDARD, pity6: 0, pity5: 0 },
    },
    {
      sql: 'INSERT OR IGNORE INTO pool_type (id, pity_6, pity_5) VALUES (:id, :pity6, :pity5)',
      bind: { id: CHARACTER_GACHA_POOL_TYPES.BEGINNER, pity6: 0, pity5: 0 },
    },
  ];

  for (const banner of KNOWN_BANNERS) {
    if (banner.poolType === 'weapon') {
      statements.push({
        sql: 'INSERT OR IGNORE INTO pool_type (id, pity_6, pity_5) VALUES (:id, :pity6, :pity5)',
        bind: { id: banner.id, pity6: 0, pity5: 0 },
      });
      statements.push({
        sql: `
          INSERT OR IGNORE INTO pools (id, type, pool_name, featured, guarantee)
          VALUES (:id, :type, :poolName, :featured, :guarantee)
        `,
        bind: {
          id: banner.id,
          type: banner.id,
          poolName: banner.poolName,
          featured: banner.featured ?? null,
          guarantee: 0,
        },
      });
    } else {
      statements.push({
        sql: `
          INSERT OR IGNORE INTO pools (id, type, pool_name, featured, guarantee)
          VALUES (:id, :type, :poolName, :featured, :guarantee)
        `,
        bind: {
          id: banner.id,
          type: banner.poolType,
          poolName: banner.poolName,
          featured: banner.featured ?? null,
          guarantee: 0,
        },
      });
    }
  }

  await runTransactionBatch(statements);
}

/**
 * Initialize the database. Creates/opens the OPFS-persisted SQLite database,
 * creates tables if they don't exist, and seeds static lookup data.
 */
export async function initDb(): Promise<void> {
  if (dbReady && getOpenSqliteConnection()) {
    return;
  }

  try {
    await openSqliteConnection();
    const existingObjects = await getExistingSchemaObjects();
    const missingObjects = REQUIRED_SCHEMA_OBJECTS.filter((name) => !existingObjects.has(name));

    if (existingObjects.size === 0 || missingObjects.length > 0) {
      await ensureSchema();
      await seedStaticData();
      await verifySchemaObjects();
    }

    await verifyDatabaseIntegrity();
    dbReady = true;
  } catch (error) {
    dbReady = false;
    throw normalizeInitError(error);
  }
}

export async function cleanupDbWorkerIfIdle(): Promise<boolean> {
  return cleanupSqliteWorkerIfIdle();
}

/**
 * Close the database and instantly surrender OPFS access handles.
 */
export async function closeDb(): Promise<void> {
  dbReady = false;
  await closeSqliteConnection();
}

/**
 * Get the database instance. Throws if not initialized.
 */
export function getDb(): Database {
  ensureDbReady();
  const connection = getOpenSqliteConnection();
  if (!connection) {
    throw new Error('Database not initialized. Call initDb() first.');
  }

  return connection;
}

/**
 * Insert character gacha records.
 */
export async function insertCharacters(chars: EndfieldGachaCharacter[]): Promise<void> {
  ensureDbReady();

  await runTransactionBatch(chars.map((character) => ({
    sql: `
      INSERT OR REPLACE INTO characters (
        seq_id,
        pool_id,
        rarity,
        char_id,
        char_name,
        is_free,
        is_new,
        gacha_ts,
        pity
      ) VALUES (
        :seqId,
        :poolId,
        :rarity,
        :charId,
        :charName,
        :isFree,
        :isNew,
        :gachaTs,
        :pity
      )
    `,
    bind: {
      seqId: Number(character.seqId),
      poolId: character.poolId,
      rarity: character.rarity,
      charId: character.charId,
      charName: character.charName,
      isFree: character.isFree ? 1 : 0,
      isNew: character.isNew ? 1 : 0,
      gachaTs: Number(character.gachaTs),
      pity: null,
    },
  })));
}

/**
 * Insert weapon pool metadata into the pools table.
 */
export async function insertWeaponPools(pools: EndfieldGachaWeaponPool[]): Promise<void> {
  ensureDbReady();

  const statements: SqliteBatchStatement[] = [];
  for (const pool of pools) {
    statements.push({
      sql: 'INSERT OR IGNORE INTO pool_type (id, pity_6, pity_5) VALUES (:id, :pity6, :pity5)',
      bind: {
        id: pool.poolId,
        pity6: 0,
        pity5: 0,
      },
    });
    statements.push({
      sql: 'INSERT OR IGNORE INTO pools (id, type, pool_name) VALUES (:id, :type, :poolName)',
      bind: {
        id: pool.poolId,
        type: pool.poolId,
        poolName: pool.poolName,
      },
    });
  }

  await runTransactionBatch(statements);
}

/**
 * Insert weapon gacha records.
 */
export async function insertWeapons(weapons: EndfieldGachaWeapon[]): Promise<void> {
  ensureDbReady();

  await runTransactionBatch(weapons.map((weapon) => ({
    sql: `
      INSERT OR REPLACE INTO weapons (
        seq_id,
        pool_id,
        rarity,
        weapon_id,
        weapon_name,
        weapon_type,
        is_new,
        gacha_ts,
        pity
      ) VALUES (
        :seqId,
        :poolId,
        :rarity,
        :weaponId,
        :weaponName,
        :weaponType,
        :isNew,
        :gachaTs,
        :pity
      )
    `,
    bind: {
      seqId: Number(weapon.seqId),
      poolId: weapon.poolId,
      rarity: weapon.rarity,
      weaponId: weapon.weaponId,
      weaponName: weapon.weaponName,
      weaponType: weapon.weaponType || '',
      isNew: weapon.isNew ? 1 : 0,
      gachaTs: Number(weapon.gachaTs),
      pity: null,
    },
  })));
}

/**
 * Get all character records sorted by gacha_ts ascending.
 */
export async function getAllCharacters(): Promise<EndfieldGachaCharacter[]> {
  ensureDbReady();
  const rows = await allSql<CharacterPullRow>(`
    SELECT * FROM character_pulls ORDER BY gacha_ts ASC
  `);
  return rows.map(mapCharacterPullRow);
}

/**
 * Get all weapon records sorted by gacha_ts ascending.
 */
export async function getAllWeapons(): Promise<EndfieldGachaWeapon[]> {
  ensureDbReady();
  const rows = await allSql<WeaponPullRow>(`
    SELECT * FROM weapon_pulls ORDER BY gacha_ts ASC
  `);
  return rows.map(mapWeaponPullRow);
}

/**
 * Get the highest seqId currently stored for characters.
 */
export async function getMaxCharacterSeqId(): Promise<number> {
  ensureDbReady();
  const row = await getSql<MaxIdRow>('SELECT MAX(seq_id) AS max_id FROM characters');
  return Number(row?.max_id ?? 0);
}

/**
 * Get the highest seqId currently stored for weapons.
 */
export async function getMaxWeaponSeqId(): Promise<number> {
  ensureDbReady();
  const row = await getSql<MaxIdRow>('SELECT MAX(seq_id) AS max_id FROM weapons');
  return Number(row?.max_id ?? 0);
}

/**
 * Delete all character and weapon records (but keep pool_type/pools seed data).
 */
export async function clearAllData(): Promise<void> {
  ensureDbReady();
  await execSql('DELETE FROM characters; DELETE FROM weapons;');
}

/**
 * Loops through all pulls chronologically per pool_type and back-calculates
 * running pity onto every pull, saving the final results into pool_type and pools.
 */
export async function recalculateAllPity(): Promise<void> {
  ensureDbReady();

  const characterPoolsByType: Record<string, PoolRow[]> = {};
  const characterPullsByType: Record<string, CharacterPityRow[]> = {};

  for (const poolType of Object.values(CHARACTER_GACHA_POOL_TYPES)) {
    characterPoolsByType[poolType] = await allSql<PoolRow>(
      'SELECT id, featured, guarantee FROM pools WHERE type = :poolType',
      { ':poolType': poolType }
    );
    characterPullsByType[poolType] = await allSql<CharacterPityRow>(
      `
        SELECT c.seq_id, c.pool_id, c.rarity, c.char_id, c.is_free, c.gacha_ts
        FROM characters c
        JOIN pools p ON p.id = c.pool_id
        WHERE p.type = :poolType
        ORDER BY c.seq_id ASC
      `,
      { ':poolType': poolType }
    );
  }

  const weaponPoolTypes = await allSql<PoolTypeRow>(
    `
      SELECT id, pity_6, pity_5
      FROM pool_type
      WHERE id NOT IN (:special, :standard, :beginner)
    `,
    {
      ':special': CHARACTER_GACHA_POOL_TYPES.SPECIAL,
      ':standard': CHARACTER_GACHA_POOL_TYPES.STANDARD,
      ':beginner': CHARACTER_GACHA_POOL_TYPES.BEGINNER,
    }
  );

  const weaponPullsByPoolType: Record<string, WeaponPityRow[]> = {};
  for (const poolType of weaponPoolTypes.map((row) => row.id)) {
    weaponPullsByPoolType[poolType] = await allSql<WeaponPityRow>(
      `
        SELECT w.seq_id, w.rarity, w.weapon_id
        FROM weapons w
        WHERE w.pool_id = :poolId
        ORDER BY w.seq_id ASC
      `,
      { ':poolId': poolType }
    );
  }

  const plan = buildPityMutationPlan({
    characterPoolsByType,
    characterPullsByType,
    weaponPoolTypeIds: weaponPoolTypes.map((row) => row.id),
    weaponPullsByPoolType,
  });

  const statements: SqliteBatchStatement[] = [
    { sql: 'UPDATE pool_type SET pity_6 = 0, pity_5 = 0' },
    { sql: 'UPDATE pools SET guarantee = 0' },
    { sql: 'UPDATE characters SET pity = NULL' },
    { sql: 'UPDATE weapons SET pity = NULL' },
  ];

  for (const update of plan.charUpdates) {
    statements.push({
      sql: 'UPDATE characters SET pity = :pity WHERE seq_id = :seqId',
      bind: {
        pity: update.pity,
        seqId: update.seq_id,
      },
    });
  }

  for (const update of plan.weaponUpdates) {
    statements.push({
      sql: 'UPDATE weapons SET pity = :pity WHERE seq_id = :seqId',
      bind: {
        pity: update.pity,
        seqId: update.seq_id,
      },
    });
  }

  for (const update of plan.poolTypeUpdates) {
    statements.push({
      sql: 'UPDATE pool_type SET pity_6 = :pity6, pity_5 = :pity5 WHERE id = :id',
      bind: {
        id: update.id,
        pity6: update.pity_6,
        pity5: update.pity_5,
      },
    });
  }

  for (const update of plan.poolUpdates) {
    statements.push({
      sql: 'UPDATE pools SET guarantee = :guarantee WHERE id = :id',
      bind: {
        id: update.id,
        guarantee: update.guarantee,
      },
    });
  }

  await runTransactionBatch(statements);
}

export interface PityStats {
  poolTypes: Record<string, { pity6: number; pity5: number }>;
  guarantees: Record<string, number>;
}

/**
 * Returns the current running totals of pity and guarantee across all pools and pool types.
 */
export async function getPityStats(): Promise<PityStats> {
  if (!dbReady) {
    return { poolTypes: {}, guarantees: {} };
  }

  const poolTypeRows = await allSql<PoolTypeRow>('SELECT id, pity_6, pity_5 FROM pool_type');
  const poolRows = await allSql<PoolRow>('SELECT id, guarantee FROM pools');

  const poolTypes: Record<string, { pity6: number; pity5: number }> = {};
  for (const row of poolTypeRows) {
    poolTypes[row.id] = { pity6: row.pity_6, pity5: row.pity_5 };
  }

  const guarantees: Record<string, number> = {};
  for (const row of poolRows) {
    guarantees[row.id] = row.guarantee || 0;
  }

  return { poolTypes, guarantees };
}
