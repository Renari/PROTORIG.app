/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  buildPityMutationPlan,
  mapCharacterPullRow,
  mapWeaponPullRow,
  type CharacterPullRow,
  type WeaponPullRow,
} from '../src/lib/db-model';
import { CHARACTER_GACHA_POOL_TYPES } from '../src/lib/banners';

describe('db-model row mapping', () => {
  it('maps character pull rows to the app-facing shape', () => {
    const row: CharacterPullRow = {
      seq_id: 42,
      pool_id: 'special-banner',
      rarity: 6,
      char_id: 'char_001',
      char_name: 'Aglina',
      is_free: 0,
      is_new: 1,
      gacha_ts: 1234567890,
      pity: 71,
      pool_name: 'Special Banner',
    };

    expect(mapCharacterPullRow(row)).toEqual({
      seqId: '42',
      poolId: 'special-banner',
      poolName: 'Special Banner',
      rarity: 6,
      charId: 'char_001',
      charName: 'Aglina',
      isFree: false,
      isNew: true,
      gachaTs: '1234567890',
      pity: 71,
    });
  });

  it('maps weapon pull rows to the app-facing shape', () => {
    const row: WeaponPullRow = {
      seq_id: 77,
      pool_id: 'weapon-banner',
      rarity: 5,
      weapon_id: 'weapon_001',
      weapon_name: 'Prototype Lance',
      weapon_type: 'lance',
      is_new: 0,
      gacha_ts: 2222222222,
      pity: 18,
      pool_name: 'Weapon Banner',
    };

    expect(mapWeaponPullRow(row)).toEqual({
      seqId: '77',
      poolId: 'weapon-banner',
      poolName: 'Weapon Banner',
      rarity: 5,
      weaponId: 'weapon_001',
      weaponName: 'Prototype Lance',
      weaponType: 'lance',
      isNew: false,
      gachaTs: '2222222222',
      pity: 18,
    });
  });
});

describe('buildPityMutationPlan', () => {
  it('keeps free character pulls out of pity while updating guarantees and resets on 5/6 star hits', () => {
    const plan = buildPityMutationPlan({
      characterPoolsByType: {
        [CHARACTER_GACHA_POOL_TYPES.SPECIAL]: [
          { id: 'special-a', featured: 'char_a', guarantee: 0 },
        ],
        [CHARACTER_GACHA_POOL_TYPES.STANDARD]: [],
        [CHARACTER_GACHA_POOL_TYPES.BEGINNER]: [],
      },
      characterPullsByType: {
        [CHARACTER_GACHA_POOL_TYPES.SPECIAL]: [
          { seq_id: 1, pool_id: 'special-a', rarity: 4, char_id: 'freebie', is_free: 1, gacha_ts: 1 },
          { seq_id: 2, pool_id: 'special-a', rarity: 4, char_id: 'char_b', is_free: 0, gacha_ts: 2 },
          { seq_id: 3, pool_id: 'special-a', rarity: 5, char_id: 'char_c', is_free: 0, gacha_ts: 3 },
          { seq_id: 4, pool_id: 'special-a', rarity: 6, char_id: 'char_d', is_free: 0, gacha_ts: 4 },
        ],
        [CHARACTER_GACHA_POOL_TYPES.STANDARD]: [],
        [CHARACTER_GACHA_POOL_TYPES.BEGINNER]: [],
      },
      weaponPoolTypeIds: [],
      weaponPullsByPoolType: {},
    });

    expect(plan.charUpdates).toEqual([
      { seq_id: 1, pity: null },
      { seq_id: 2, pity: null },
      { seq_id: 3, pity: 2 },
      { seq_id: 4, pity: 3 },
    ]);
    expect(plan.poolTypeUpdates).toContainEqual({
      id: CHARACTER_GACHA_POOL_TYPES.SPECIAL,
      pity_6: 0,
      pity_5: 0,
    });
    expect(plan.poolUpdates).toContainEqual({
      id: 'special-a',
      guarantee: 3,
    });
  });

  it('tracks weapon pity independently per pool', () => {
    const plan = buildPityMutationPlan({
      characterPoolsByType: {
        [CHARACTER_GACHA_POOL_TYPES.SPECIAL]: [],
        [CHARACTER_GACHA_POOL_TYPES.STANDARD]: [],
        [CHARACTER_GACHA_POOL_TYPES.BEGINNER]: [],
      },
      characterPullsByType: {
        [CHARACTER_GACHA_POOL_TYPES.SPECIAL]: [],
        [CHARACTER_GACHA_POOL_TYPES.STANDARD]: [],
        [CHARACTER_GACHA_POOL_TYPES.BEGINNER]: [],
      },
      weaponPoolTypeIds: ['weapon-a'],
      weaponPullsByPoolType: {
        'weapon-a': [
          { seq_id: 10, rarity: 4, weapon_id: 'wpn_1' },
          { seq_id: 11, rarity: 5, weapon_id: 'wpn_2' },
          { seq_id: 12, rarity: 4, weapon_id: 'wpn_3' },
        ],
      },
    });

    expect(plan.weaponUpdates).toEqual([
      { seq_id: 10, pity: null },
      { seq_id: 11, pity: 2 },
      { seq_id: 12, pity: null },
    ]);
    expect(plan.poolTypeUpdates).toContainEqual({
      id: 'weapon-a',
      pity_6: 3,
      pity_5: 1,
    });
    expect(plan.poolUpdates).toContainEqual({
      id: 'weapon-a',
      guarantee: 3,
    });
  });
});
