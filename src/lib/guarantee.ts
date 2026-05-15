import type { EndfieldGachaWeapon, GachaRecordItem } from './api';
import {
  CHARACTER_GACHA_POOL_TYPES,
  DUPLICATE_GUARANTEE_LIMIT,
  GUARANTEE_LIMIT,
  KNOWN_BANNERS,
  WEAPON_DUPLICATE_GUARANTEE_LIMIT,
  WEAPON_GUARANTEE_LIMIT,
  isJointBanner,
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

  const featuredIds = Array.isArray(banner.featured) ? banner.featured : [banner.featured];

  if (isWeaponItem(item)) {
    return featuredIds.includes(item.weaponId);
  }

  return featuredIds.includes(item.charId);
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

    return (
      (banner.poolType === CHARACTER_GACHA_POOL_TYPES.SPECIAL || isJointBanner(banner)) &&
      itemMatchesBanner(item, banner)
    );
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

  if (isJointBanner(banner)) {
    if (nextPullNumber < firstLimit) {
      return false;
    }

    return nextPullNumber === firstLimit || nextPullNumber % duplicateLimit === 0;
  }

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
