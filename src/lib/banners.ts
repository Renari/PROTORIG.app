import type { GachaRecordItem } from './api';

export interface BannerInfo {
  id: string;
  poolType: string;
  label: string;
  /**
   * Optional ID of the featured character or weapon for this banner.
   * Must match `EndfieldGachaCharacter.charId` or `EndfieldGachaWeapon.weaponId` and is typically only set for
   * special/limited character or weapon banners used in guarantee reset logic.
   */
  featured?: string;
}

/**
 * Character Gacha Pool Types
 * Corresponds to `E_CharacterGachaPoolType_*` from the API.
 */
export enum CHARACTER_GACHA_POOL_TYPES {
  SPECIAL = 'E_CharacterGachaPoolType_Special',
  STANDARD = 'E_CharacterGachaPoolType_Standard',
  BEGINNER = 'E_CharacterGachaPoolType_Beginner',
}

/**
 * Maps known pool names to banner metadata.
 * The `id` is used as the key for matching specific limited banners.
 * `poolType` corresponds to `E_CharacterGachaPoolType_*` from the API. 
 * This list must be sorted from the most recent banner to the least recent banner.
 */
export const KNOWN_BANNERS: BannerInfo[] = [
  {
    id: 'special_1_1_1',
    poolType: 'E_CharacterGachaPoolType_Special',
    label: 'River\'s Daughter',
    featured: 'chr_0027_tangtang',
  },
  {
    id: 'special_1_0_2',
    poolType: 'E_CharacterGachaPoolType_Special',
    label: 'Hues of Passion',
    featured: 'chr_0017_yvonne',
  },
  {
    id: 'special_1_0_3',
    poolType: 'E_CharacterGachaPoolType_Special',
    label: 'The Floaty Messenger',
    featured: 'chr_0013_aglina',
  },
  {
    id: 'special_1_0_1',
    poolType: 'E_CharacterGachaPoolType_Special',
    label: 'Scars of the Forge',
    featured: 'chr_0016_laevat',
  },
  {
    id: 'standard',
    poolType: 'E_CharacterGachaPoolType_Standard',
    label: 'Basic Headhunting',
  },
  {
    id: 'beginner',
    poolType: 'E_CharacterGachaPoolType_Beginner',
    label: 'New Horizons',
  },
];

/** Hard pity limit shared across all pool types. */
export const PITY_LIMIT = 80;
export const GUARANTEE_LIMIT = 120;
export const DUPLICATE_GUARANTEE_LIMIT = 240;

export const WEAPON_PITY_LIMIT = 40;
export const WEAPON_GUARANTEE_LIMIT = 80;
export const WEAPON_DUPLICATE_GUARANTEE_LIMIT = 100;

/**
 * Checks whether an item belongs to a specific banner
 */
export function itemMatchesBanner(item: GachaRecordItem, banner: BannerInfo): boolean {
  const itemPoolIdLower = (item.poolId || '').toLowerCase();
  const bannerIdLower = banner.id.toLowerCase();

  // Always use exact poolId match if available
  if (itemPoolIdLower && itemPoolIdLower === bannerIdLower) {
    return true;
  }

  // Fallback to poolName for older imports that might have an incorrect poolId
  const itemPoolNameLower = (item.poolName || '').toLowerCase();
  const bannerLabelLower = banner.label.toLowerCase();

  if (banner.poolType === CHARACTER_GACHA_POOL_TYPES.STANDARD) {
    return itemPoolIdLower.includes('standard') || itemPoolNameLower.includes('standard') || itemPoolNameLower.includes('basic headhunting');
  }
  if (banner.poolType === CHARACTER_GACHA_POOL_TYPES.BEGINNER) {
    return itemPoolIdLower.includes('beginner') || itemPoolNameLower.includes('beginner') || itemPoolNameLower.includes('new horizons');
  }

  // Try to match by label when poolId isn't an exact match
  return itemPoolNameLower.includes(bannerLabelLower);
}

/**
 * Determines the pool type for a given gacha item by checking it against
 * all known banners. Returns null if no match is found.
 */
export function getPoolTypeForItem(item: GachaRecordItem): string | null {
  for (const banner of KNOWN_BANNERS) {
    if (itemMatchesBanner(item, banner)) return banner.poolType;
  }
  return null;
}
