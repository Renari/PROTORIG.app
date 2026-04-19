import type { EndfieldGachaCharacter, EndfieldGachaWeapon } from './api';
import { CHARACTER_GACHA_POOL_TYPES } from './banners';

export interface MaxIdRow {
  max_id: number | null;
}

export interface CharacterPullRow {
  seq_id: number;
  pool_id: string;
  rarity: number;
  char_id: string;
  char_name: string;
  is_free: number;
  is_new: number;
  gacha_ts: number;
  pity: number | null;
  pool_name: string;
}

export interface WeaponPullRow {
  seq_id: number;
  pool_id: string;
  rarity: number;
  weapon_id: string;
  weapon_name: string;
  weapon_type: string;
  is_new: number;
  gacha_ts: number;
  pity: number | null;
  pool_name: string;
}

export interface PoolRow {
  id: string;
  featured: string | null;
  guarantee: number;
}

export interface PoolTypeRow {
  id: string;
  pity_6: number;
  pity_5: number;
}

export interface CharacterPityRow {
  seq_id: number;
  pool_id: string;
  rarity: number;
  char_id: string;
  is_free: number;
  gacha_ts: number;
}

export interface WeaponPityRow {
  seq_id: number;
  rarity: number;
  weapon_id: string;
}

export interface PityUpdate {
  seq_id: number;
  pity: number | null;
}

export interface PoolTypeUpdate {
  id: string;
  pity_6: number;
  pity_5: number;
}

export interface PoolUpdate {
  id: string;
  guarantee: number;
}

export interface PityMutationPlan {
  charUpdates: PityUpdate[];
  weaponUpdates: PityUpdate[];
  poolTypeUpdates: PoolTypeUpdate[];
  poolUpdates: PoolUpdate[];
}

export interface PityComputationInput {
  characterPoolsByType: Record<string, PoolRow[]>;
  characterPullsByType: Record<string, CharacterPityRow[]>;
  weaponPoolTypeIds: string[];
  weaponPullsByPoolType: Record<string, WeaponPityRow[]>;
}

export function mapCharacterPullRow(row: CharacterPullRow): EndfieldGachaCharacter {
  return {
    seqId: String(row.seq_id),
    poolId: row.pool_id,
    poolName: row.pool_name,
    rarity: row.rarity,
    charId: row.char_id,
    charName: row.char_name,
    isFree: row.is_free === 1,
    isNew: row.is_new === 1,
    gachaTs: String(row.gacha_ts),
    pity: row.pity,
  };
}

export function mapWeaponPullRow(row: WeaponPullRow): EndfieldGachaWeapon {
  return {
    seqId: String(row.seq_id),
    poolId: row.pool_id,
    poolName: row.pool_name,
    rarity: row.rarity,
    weaponId: row.weapon_id,
    weaponName: row.weapon_name,
    weaponType: row.weapon_type,
    isNew: row.is_new === 1,
    gachaTs: String(row.gacha_ts),
    pity: row.pity,
  };
}

export function buildPityMutationPlan(input: PityComputationInput): PityMutationPlan {
  const charUpdates: PityUpdate[] = [];
  const weaponUpdates: PityUpdate[] = [];
  const poolTypeUpdates: PoolTypeUpdate[] = [];
  const poolUpdates: PoolUpdate[] = [];

  for (const poolType of Object.values(CHARACTER_GACHA_POOL_TYPES)) {
    const poolsForType = input.characterPoolsByType[poolType] ?? [];
    const pulls = input.characterPullsByType[poolType] ?? [];
    const guaranteeCounts: Record<string, number> = {};
    for (const pool of poolsForType) {
      guaranteeCounts[pool.id] = 0;
    }

    let pity6 = 0;
    let pity5 = 0;

    for (const pull of pulls) {
      if (pull.is_free === 1) {
        charUpdates.push({ seq_id: pull.seq_id, pity: null });
        continue;
      }

      pity6 += 1;
      pity5 += 1;
      guaranteeCounts[pull.pool_id] = (guaranteeCounts[pull.pool_id] || 0) + 1;

      let assignedPity: number | null = null;
      if (pull.rarity === 6) {
        assignedPity = pity6;
      } else if (pull.rarity === 5) {
        assignedPity = pity5;
      }

      charUpdates.push({ seq_id: pull.seq_id, pity: assignedPity });

      if (pull.rarity === 6) {
        pity6 = 0;
        pity5 = 0;
      } else if (pull.rarity === 5) {
        pity5 = 0;
      }
    }

    poolTypeUpdates.push({ id: poolType, pity_6: pity6, pity_5: pity5 });
    for (const [poolId, guarantee] of Object.entries(guaranteeCounts)) {
      poolUpdates.push({ id: poolId, guarantee });
    }
  }

  for (const poolType of input.weaponPoolTypeIds) {
    const pulls = input.weaponPullsByPoolType[poolType] ?? [];
    let pity6 = 0;
    let pity5 = 0;
    let guarantee = 0;

    for (const pull of pulls) {
      pity6 += 1;
      pity5 += 1;
      guarantee += 1;

      let assignedPity: number | null = null;
      if (pull.rarity === 6) {
        assignedPity = pity6;
      } else if (pull.rarity === 5) {
        assignedPity = pity5;
      }

      weaponUpdates.push({ seq_id: pull.seq_id, pity: assignedPity });

      if (pull.rarity === 6) {
        pity6 = 0;
        pity5 = 0;
      } else if (pull.rarity === 5) {
        pity5 = 0;
      }
    }

    poolTypeUpdates.push({ id: poolType, pity_6: pity6, pity_5: pity5 });
    poolUpdates.push({ id: poolType, guarantee });
  }

  return {
    charUpdates,
    weaponUpdates,
    poolTypeUpdates,
    poolUpdates,
  };
}
