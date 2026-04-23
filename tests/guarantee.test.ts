/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import type { EndfieldGachaCharacter, EndfieldGachaWeapon } from '../src/lib/api';
import { KNOWN_BANNERS } from '../src/lib/banners';
import { buildGuaranteedPullLookup } from '../src/lib/guarantee';

const specialBanner = KNOWN_BANNERS.find((banner) => banner.poolType === 'E_CharacterGachaPoolType_Special' && banner.featured);
const weaponBanner = KNOWN_BANNERS.find((banner) => banner.poolType === 'weapon' && banner.featured);

if (!specialBanner?.featured || !weaponBanner?.featured) {
  throw new Error('Expected featured character and weapon banners in test fixtures.');
}

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
      makeCharacterPull(1, specialBanner.featured, { isFree: true }),
    ];

    for (let seqId = 2; seqId <= 120; seqId += 1) {
      items.push(makeCharacterPull(seqId, `off-banner-${seqId}`));
    }
    items.push(makeCharacterPull(121, specialBanner.featured));

    const guaranteed = buildGuaranteedPullLookup(items);

    expect(guaranteed['1']).toBe(false);
    expect(guaranteed['121']).toBe(true);
  });

  it('does not mark an early featured character pull as guaranteed', () => {
    const items: EndfieldGachaCharacter[] = [
      makeCharacterPull(1, 'off-banner-1'),
      makeCharacterPull(2, 'off-banner-2'),
      makeCharacterPull(3, specialBanner.featured),
    ];

    const guaranteed = buildGuaranteedPullLookup(items);

    expect(guaranteed['3']).toBe(false);
  });

  it('marks duplicate character guarantees and uses weapon thresholds independently', () => {
    const characterItems: EndfieldGachaCharacter[] = [];
    for (let seqId = 1; seqId <= 19; seqId += 1) {
      characterItems.push(makeCharacterPull(seqId, `off-banner-${seqId}`));
    }
    characterItems.push(makeCharacterPull(20, specialBanner.featured));
    for (let seqId = 21; seqId <= 239; seqId += 1) {
      characterItems.push(makeCharacterPull(seqId, `off-banner-${seqId}`));
    }
    characterItems.push(makeCharacterPull(240, specialBanner.featured));

    const weaponItems: EndfieldGachaWeapon[] = [];
    for (let seqId = 1; seqId <= 79; seqId += 1) {
      weaponItems.push(makeWeaponPull(seqId, `off-banner-${seqId}`));
    }
    weaponItems.push(makeWeaponPull(80, weaponBanner.featured));

    const characterGuaranteed = buildGuaranteedPullLookup(characterItems);
    const weaponGuaranteed = buildGuaranteedPullLookup(weaponItems);

    expect(characterGuaranteed['20']).toBe(false);
    expect(characterGuaranteed['240']).toBe(true);
    expect(weaponGuaranteed['80']).toBe(true);
  });
});
