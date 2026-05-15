/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import type { EndfieldGachaCharacter, EndfieldGachaWeapon } from '../src/lib/api';
import { CHARACTER_GACHA_POOL_TYPES, KNOWN_BANNERS } from '../src/lib/banners';
import { buildGuaranteedPullLookup } from '../src/lib/guarantee';

const specialBanner = KNOWN_BANNERS.find((banner) => banner.poolType === CHARACTER_GACHA_POOL_TYPES.SPECIAL && typeof banner.featured === 'string');
const weaponBanner = KNOWN_BANNERS.find((banner) => banner.poolType === 'weapon' && typeof banner.featured === 'string');
const jointBanner = KNOWN_BANNERS.find((banner) => banner.poolType === CHARACTER_GACHA_POOL_TYPES.JOINT && Array.isArray(banner.featured));

if (!specialBanner?.featured || typeof specialBanner.featured !== 'string' || !weaponBanner?.featured || typeof weaponBanner.featured !== 'string' || !jointBanner?.featured || !Array.isArray(jointBanner.featured)) {
  throw new Error('Expected featured character, joint, and weapon banners in test fixtures.');
}

const specialFeatured = specialBanner.featured;
const weaponFeatured = weaponBanner.featured;
const jointFeatured = jointBanner.featured;

function makeCharacterPull(
  seqId: number,
  charId: string,
  options: Partial<Pick<EndfieldGachaCharacter, 'isFree' | 'rarity'>> = {},
): EndfieldGachaCharacter {
  return {
    seqId: String(seqId),
    poolId: specialBanner.id,
    poolName: specialBanner.poolName,
    charId,
    charName: charId,
    rarity: options.rarity ?? 6,
    isFree: options.isFree ?? false,
    isNew: false,
    gachaTs: String(seqId),
    pity: null,
  };
}

function makeJointPull(
  seqId: number,
  charId: string,
  options: Partial<Pick<EndfieldGachaCharacter, 'isFree' | 'rarity'>> = {},
): EndfieldGachaCharacter {
  return {
    seqId: String(seqId),
    poolId: jointBanner.id,
    poolName: jointBanner.poolName,
    charId,
    charName: charId,
    rarity: options.rarity ?? 6,
    isFree: options.isFree ?? false,
    isNew: false,
    gachaTs: String(seqId),
    pity: null,
  };
}

function makeWeaponPull(
  seqId: number,
  weaponId: string,
  options: Partial<Pick<EndfieldGachaWeapon, 'rarity'>> = {},
): EndfieldGachaWeapon {
  return {
    seqId: String(seqId),
    poolId: weaponBanner.id,
    poolName: weaponBanner.poolName,
    weaponId,
    weaponName: weaponId,
    weaponType: 'test',
    rarity: options.rarity ?? 6,
    isNew: false,
    gachaTs: String(seqId),
    pity: null,
  };
}

describe('buildGuaranteedPullLookup', () => {
  it('marks the first guaranteed featured character pull and ignores free pulls', () => {
    const items: EndfieldGachaCharacter[] = [
      makeCharacterPull(1, specialFeatured, { isFree: true }),
    ];

    for (let seqId = 2; seqId <= 120; seqId += 1) {
      items.push(makeCharacterPull(seqId, `off-banner-${seqId}`));
    }
    items.push(makeCharacterPull(121, specialFeatured));

    const guaranteed = buildGuaranteedPullLookup(items);

    expect(guaranteed['1']).toBe(false);
    expect(guaranteed['121']).toBe(true);
  });

  it('does not mark an early featured character pull as guaranteed', () => {
    const items: EndfieldGachaCharacter[] = [
      makeCharacterPull(1, 'off-banner-1'),
      makeCharacterPull(2, 'off-banner-2'),
      makeCharacterPull(3, specialFeatured),
    ];

    const guaranteed = buildGuaranteedPullLookup(items);

    expect(guaranteed['3']).toBe(false);
  });

  it('marks duplicate character guarantees and uses weapon thresholds independently', () => {
    const characterItems: EndfieldGachaCharacter[] = [];
    for (let seqId = 1; seqId <= 19; seqId += 1) {
      characterItems.push(makeCharacterPull(seqId, `off-banner-${seqId}`));
    }
    characterItems.push(makeCharacterPull(20, specialFeatured));
    for (let seqId = 21; seqId <= 239; seqId += 1) {
      characterItems.push(makeCharacterPull(seqId, `off-banner-${seqId}`));
    }
    characterItems.push(makeCharacterPull(240, specialFeatured));

    const weaponItems: EndfieldGachaWeapon[] = [];
    for (let seqId = 1; seqId <= 79; seqId += 1) {
      weaponItems.push(makeWeaponPull(seqId, `off-banner-${seqId}`));
    }
    weaponItems.push(makeWeaponPull(80, weaponFeatured));

    const characterGuaranteed = buildGuaranteedPullLookup(characterItems);
    const weaponGuaranteed = buildGuaranteedPullLookup(weaponItems);

    expect(characterGuaranteed['20']).toBe(false);
    expect(characterGuaranteed['240']).toBe(true);
    expect(weaponGuaranteed['80']).toBe(true);
  });

  it('does not let early joint featured pulls consume the 120 selection guarantee', () => {
    const items: EndfieldGachaCharacter[] = [
      makeJointPull(1, jointFeatured[0]),
    ];

    for (let seqId = 2; seqId <= 119; seqId += 1) {
      items.push(makeJointPull(seqId, `off-banner-${seqId}`));
    }
    items.push(makeJointPull(120, jointFeatured[1]));

    const guaranteed = buildGuaranteedPullLookup(items);

    expect(guaranteed['1']).toBe(false);
    expect(guaranteed['120']).toBe(true);
  });

  it('keeps free joint pulls out of guarantee progress', () => {
    const items: EndfieldGachaCharacter[] = [
      makeJointPull(1, jointFeatured[0], { isFree: true }),
    ];

    for (let seqId = 2; seqId <= 120; seqId += 1) {
      items.push(makeJointPull(seqId, `off-banner-${seqId}`));
    }
    items.push(makeJointPull(121, jointFeatured[2]));

    const guaranteed = buildGuaranteedPullLookup(items);

    expect(guaranteed['1']).toBe(false);
    expect(guaranteed['121']).toBe(true);
  });
});
