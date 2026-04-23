import type { EndfieldGachaWeapon, GachaRecordItem } from './api';
import {
  CHARACTER_GACHA_POOL_TYPES,
  DUPLICATE_GUARANTEE_LIMIT,
  GUARANTEE_LIMIT,
  KNOWN_BANNERS,
  WEAPON_DUPLICATE_GUARANTEE_LIMIT,
  WEAPON_GUARANTEE_LIMIT,
  itemMatchesBanner,
  type BannerInfo,
} from './banners';

interface GuaranteeState {
  featuredPulls: number;
  nonFreePulls: number;
}

function isWeaponItem(item: GachaRecordItem): item is EndfieldGachaWeapon {
  return 'weaponId' in item;
}

function isFeaturedPull(item: GachaRecordItem, banner: BannerInfo): boolean {
  if (!banner.featured) {
    return false;
  }

  if ('isFree' in item && item.isFree) {
    return false;
  }

  if (isWeaponItem(item)) {
    return item.weaponId === banner.featured;
  }

  return item.charId === banner.featured;
}

function resolveGuaranteeBanner(item: GachaRecordItem): BannerInfo | null {
  const exactMatch = KNOWN_BANNERS.find((banner) => banner.id === item.poolId);
  if (exactMatch?.featured) {
    return exactMatch;
  }

  return KNOWN_BANNERS.find((banner) => {
    if (!banner.featured) {
      return false;
    }

    if (isWeaponItem(item)) {
      return banner.poolType === 'weapon' && itemMatchesBanner(item, banner);
    }

    return banner.poolType === CHARACTER_GACHA_POOL_TYPES.SPECIAL && itemMatchesBanner(item, banner);
  }) ?? null;
}

function isGuaranteedPull(
  item: GachaRecordItem,
  banner: BannerInfo,
  state: GuaranteeState,
): boolean {
  if (!isFeaturedPull(item, banner)) {
    return false;
  }

  const nextPullNumber = state.nonFreePulls + 1;
  const firstLimit = isWeaponItem(item) ? WEAPON_GUARANTEE_LIMIT : GUARANTEE_LIMIT;
  const duplicateLimit = isWeaponItem(item) ? WEAPON_DUPLICATE_GUARANTEE_LIMIT : DUPLICATE_GUARANTEE_LIMIT;

  if (state.featuredPulls < 1) {
    return nextPullNumber === firstLimit;
  }

  return nextPullNumber % duplicateLimit === 0;
}

export function buildGuaranteedPullLookup(items: GachaRecordItem[]): Record<string, boolean> {
  const guaranteedBySeqId: Record<string, boolean> = {};
  const guaranteeStateByBannerId = new Map<string, GuaranteeState>();
  const chronologicalItems = [...items].sort((a, b) => Number(a.seqId) - Number(b.seqId));

  for (const item of chronologicalItems) {
    const banner = resolveGuaranteeBanner(item);
    if (!banner?.featured) {
      guaranteedBySeqId[item.seqId] = false;
      continue;
    }

    const state = guaranteeStateByBannerId.get(banner.id) ?? { featuredPulls: 0, nonFreePulls: 0 };
    const isFree = 'isFree' in item && item.isFree;

    guaranteedBySeqId[item.seqId] = !isFree && isGuaranteedPull(item, banner, state);

    if (isFree) {
      continue;
    }

    state.nonFreePulls += 1;
    if (isFeaturedPull(item, banner)) {
      state.featuredPulls += 1;
    }
    guaranteeStateByBannerId.set(banner.id, state);
  }

  return guaranteedBySeqId;
}
