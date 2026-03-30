/// <reference types="vite-plugin-jsonx/client" />
import type { GachaRecordItem } from './api';

export interface BannerInfo {
  id: string;
  poolType: string;
  poolName: string;
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
import bannersData from './banners.jsonc';

export const KNOWN_BANNERS: BannerInfo[] = bannersData as unknown as BannerInfo[];

/** Hard pity limit shared across all pool types. */
export const PITY_LIMIT = 80;
export const GUARANTEE_LIMIT = 120;
export const DUPLICATE_GUARANTEE_LIMIT = 240;

export const WEAPON_PITY_LIMIT = 40;
export const WEAPON_GUARANTEE_LIMIT = 80;
export const WEAPON_DUPLICATE_GUARANTEE_LIMIT = 180;

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
  const bannerLabelLower = banner.poolName.toLowerCase();

  if (banner.poolType === CHARACTER_GACHA_POOL_TYPES.STANDARD) {
    return itemPoolIdLower.includes('standard') || itemPoolNameLower.includes('standard') || itemPoolNameLower.includes('basic headhunting');
  }
  if (banner.poolType === CHARACTER_GACHA_POOL_TYPES.BEGINNER) {
    return itemPoolIdLower.includes('beginner') || itemPoolNameLower.includes('beginner') || itemPoolNameLower.includes('new horizons');
  }

  // Try to match by label when poolId isn't an exact match
  return itemPoolNameLower.includes(bannerLabelLower);
}
