/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { clearBackups, createBackup, deleteBackup, getBackup, listBackups, type BackupSnapshot } from '../src/lib/backups';

function makeSnapshot(seed: number): BackupSnapshot {
  return {
    characters: [
      {
        poolId: `char-pool-${seed}`,
        poolName: `Character Pool ${seed}`,
        charId: `char-${seed}`,
        charName: `Character ${seed}`,
        rarity: 6,
        isFree: false,
        isNew: true,
        gachaTs: String(1000 + seed),
        seqId: String(seed),
      },
    ],
    weapons: [
      {
        poolId: `weapon-pool-${seed}`,
        poolName: `Weapon Pool ${seed}`,
        weaponId: `weapon-${seed}`,
        weaponName: `Weapon ${seed}`,
        weaponType: 'sword',
        rarity: 5,
        isNew: false,
        gachaTs: String(2000 + seed),
        seqId: String(seed),
      },
    ],
    weaponPools: [
      {
        poolId: `weapon-pool-${seed}`,
        poolName: `Weapon Pool ${seed}`,
      },
    ],
  };
}

describe('backup storage', () => {
  beforeEach(() => {
    localStorage.clear();
    clearBackups();
  });

  it('stores and retrieves backups newest first', () => {
    const first = createBackup(makeSnapshot(1), 'before-import');
    const second = createBackup(makeSnapshot(2), 'before-clear');

    const backups = listBackups();
    expect(backups).toHaveLength(2);
    expect(backups[0].id).toBe(second.id);
    expect(backups[1].id).toBe(first.id);
    expect(getBackup(first.id)?.reason).toBe('before-import');
  });

  it('prunes backups to the requested retention limit', () => {
    for (let i = 1; i <= 12; i++) {
      createBackup(makeSnapshot(i), 'before-import', 10);
    }

    const backups = listBackups();
    expect(backups).toHaveLength(10);
    expect(backups.some((backup) => backup.snapshot.characters[0]?.seqId === '1')).toBe(false);
    expect(backups.some((backup) => backup.snapshot.characters[0]?.seqId === '12')).toBe(true);
  });

  it('deletes backups by id', () => {
    const record = createBackup(makeSnapshot(3), 'before-restore');
    deleteBackup(record.id);

    expect(listBackups()).toHaveLength(0);
    expect(getBackup(record.id)).toBeNull();
  });
});
