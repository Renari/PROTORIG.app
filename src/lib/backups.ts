import type { EndfieldGachaCharacter, EndfieldGachaWeapon, EndfieldGachaWeaponPool } from './api';

const BACKUP_STORAGE_KEY = 'protorig_app_backups';
const BACKUP_SCHEMA_VERSION = 1;

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

function readBackups(): BackupRecord[] {
  if (!canUseStorage()) return [];

  const raw = window.localStorage.getItem(BACKUP_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is BackupRecord => !!item && typeof item === 'object' && typeof item.id === 'string')
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
    appVersion: 'v2.0.0',
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
