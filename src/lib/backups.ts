import type { EndfieldGachaCharacter, EndfieldGachaWeapon, EndfieldGachaWeaponPool } from './api';

const BACKUP_STORAGE_KEY = 'protorig_app_backups';
const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_REASONS: BackupReason[] = ['before-import', 'before-restore', 'before-clear'];

export type BackupReason = 'before-import' | 'before-restore' | 'before-clear';

export interface BackupSnapshot {
  characters: EndfieldGachaCharacter[];
  weapons: EndfieldGachaWeapon[];
  weaponPools: EndfieldGachaWeaponPool[];
}

export interface BackupRecord {
  id: string;
  createdAt: string;
  reason: BackupReason;
  schemaVersion: number;
  appVersion: string;
  counts: {
    characters: number;
    weapons: number;
    weaponPools: number;
  };
  snapshot: BackupSnapshot;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidBackupReason(value: unknown): value is BackupReason {
  return typeof value === 'string' && BACKUP_REASONS.includes(value as BackupReason);
}

function parseDateString(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime()) ? value : null;
}

function parseCharacter(value: unknown): EndfieldGachaCharacter | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.poolId !== 'string' ||
    typeof value.poolName !== 'string' ||
    typeof value.charId !== 'string' ||
    typeof value.charName !== 'string' ||
    !isFiniteNumber(value.rarity) ||
    typeof value.isFree !== 'boolean' ||
    typeof value.isNew !== 'boolean' ||
    typeof value.gachaTs !== 'string' ||
    typeof value.seqId !== 'string'
  ) {
    return null;
  }

  if (value.pity !== undefined && value.pity !== null && !isFiniteNumber(value.pity)) {
    return null;
  }

  return {
    poolId: value.poolId,
    poolName: value.poolName,
    charId: value.charId,
    charName: value.charName,
    rarity: value.rarity,
    isFree: value.isFree,
    isNew: value.isNew,
    gachaTs: value.gachaTs,
    seqId: value.seqId,
    pity: value.pity,
  };
}

function parseWeapon(value: unknown): EndfieldGachaWeapon | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.poolId !== 'string' ||
    typeof value.poolName !== 'string' ||
    typeof value.weaponId !== 'string' ||
    typeof value.weaponName !== 'string' ||
    typeof value.weaponType !== 'string' ||
    !isFiniteNumber(value.rarity) ||
    typeof value.isNew !== 'boolean' ||
    typeof value.gachaTs !== 'string' ||
    typeof value.seqId !== 'string'
  ) {
    return null;
  }

  if (value.pity !== undefined && value.pity !== null && !isFiniteNumber(value.pity)) {
    return null;
  }

  return {
    poolId: value.poolId,
    poolName: value.poolName,
    weaponId: value.weaponId,
    weaponName: value.weaponName,
    weaponType: value.weaponType,
    rarity: value.rarity,
    isNew: value.isNew,
    gachaTs: value.gachaTs,
    seqId: value.seqId,
    pity: value.pity,
  };
}

function parseWeaponPool(value: unknown): EndfieldGachaWeaponPool | null {
  if (!isRecord(value)) return null;
  if (typeof value.poolId !== 'string' || typeof value.poolName !== 'string') {
    return null;
  }

  return {
    poolId: value.poolId,
    poolName: value.poolName,
  };
}

function parseSnapshotArray<T>(value: unknown, parseItem: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;

  const parsed: T[] = [];
  for (const item of value) {
    const parsedItem = parseItem(item);
    if (!parsedItem) {
      return null;
    }
    parsed.push(parsedItem);
  }
  return parsed;
}

function parseSnapshot(value: unknown): BackupSnapshot | null {
  if (!isRecord(value)) return null;

  const characters = parseSnapshotArray(value.characters, parseCharacter);
  const weapons = parseSnapshotArray(value.weapons, parseWeapon);
  const weaponPools = parseSnapshotArray(value.weaponPools, parseWeaponPool);

  if (!characters || !weapons || !weaponPools) {
    return null;
  }

  return {
    characters,
    weapons,
    weaponPools,
  };
}

function deriveCounts(snapshot: BackupSnapshot): BackupRecord['counts'] {
  return {
    characters: snapshot.characters.length,
    weapons: snapshot.weapons.length,
    weaponPools: snapshot.weaponPools.length,
  };
}

function parseCounts(value: unknown, snapshot: BackupSnapshot): BackupRecord['counts'] {
  if (!isRecord(value)) {
    return deriveCounts(snapshot);
  }

  if (
    isFiniteNumber(value.characters) &&
    isFiniteNumber(value.weapons) &&
    isFiniteNumber(value.weaponPools)
  ) {
    return {
      characters: value.characters,
      weapons: value.weapons,
      weaponPools: value.weaponPools,
    };
  }

  return deriveCounts(snapshot);
}

function parseBackupRecord(value: unknown): BackupRecord | null {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null;
  }

  const createdAt = parseDateString(value.createdAt);
  const snapshot = parseSnapshot(value.snapshot);
  if (!createdAt || !snapshot || !isValidBackupReason(value.reason)) {
    return null;
  }

  return {
    id: value.id,
    createdAt,
    reason: value.reason,
    schemaVersion: isFiniteNumber(value.schemaVersion) ? value.schemaVersion : BACKUP_SCHEMA_VERSION,
    appVersion: typeof value.appVersion === 'string' ? value.appVersion : 'unknown',
    counts: parseCounts(value.counts, snapshot),
    snapshot,
  };
}

function readBackups(): BackupRecord[] {
  if (!canUseStorage()) return [];

  const raw = window.localStorage.getItem(BACKUP_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(parseBackupRecord)
      .filter((item): item is BackupRecord => item !== null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.error('[backups] Failed to parse backups from localStorage:', error);
    return [];
  }
}

function writeBackups(backups: BackupRecord[]): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(backups));
}

export function listBackups(): BackupRecord[] {
  return readBackups();
}

export function getBackup(id: string): BackupRecord | null {
  return readBackups().find((backup) => backup.id === id) ?? null;
}

export function createBackup(
  snapshot: BackupSnapshot,
  reason: BackupReason,
  limit: number = 10,
): BackupRecord {
  const record: BackupRecord = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    reason,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: import.meta.env.APP_VERSION,
    counts: {
      characters: snapshot.characters.length,
      weapons: snapshot.weapons.length,
      weaponPools: snapshot.weaponPools.length,
    },
    snapshot,
  };

  const backups = [record, ...readBackups()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);

  writeBackups(backups);
  return record;
}

export function deleteBackup(id: string): void {
  const backups = readBackups().filter((backup) => backup.id !== id);
  writeBackups(backups);
}

export function clearBackups(): void {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(BACKUP_STORAGE_KEY);
}
