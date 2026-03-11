import riversDaughter from '../assets/rivers-daughter.jpg';
import huesOfPassion from '../assets/hues-of-passion.jpg';
import scarsOfTheForge from '../assets/scars-of-the-forge.jpg';
import theFloatyMessenger from '../assets/the-floaty-messenger.jpg';
import newHorizons from '../assets/new-horizons.png';
import type { GachaRecordItem } from './api';

export interface BannerInfo {
  id: string;
  poolType: string;
  label: string;
  image: string | null;
  /**
   * Optional ID of the featured character for this banner.
   * Must match `EndfieldGachaItem.charId` and is typically only set for
   * special/limited character banners used in guarantee reset logic.
   */
  featuredCharacter?: string;
}

/**
 * Maps known pool names (from the API `poolName` field) to banner metadata.
 * The `poolName` is used as the key for matching specific limited banners.
 * `poolType` corresponds to `E_CharacterGachaPoolType_*` from the API. 
 * This list must be sorted from the most recent banner to the least recent banner.
 */
export const KNOWN_BANNERS: BannerInfo[] = [
  {
    id: 'rivers-daughter',
    poolType: 'E_CharacterGachaPoolType_Special',
    label: 'River\'s Daughter',
    image: riversDaughter,
    featuredCharacter: '',
  },
  {
    id: 'hues-of-passion',
    poolType: 'E_CharacterGachaPoolType_Special',
    label: 'Hues of Passion',
    image: huesOfPassion,
    featuredCharacter: 'chr_0017_yvonne',
  },
  {
    id: 'the-floaty-messenger',
    poolType: 'E_CharacterGachaPoolType_Special',
    label: 'The Floaty Messenger',
    image: theFloatyMessenger,
    featuredCharacter: 'chr_0013_aglina',
  },
  {
    id: 'scars-of-the-forge',
    poolType: 'E_CharacterGachaPoolType_Special',
    label: 'Scars of the Forge',
    image: scarsOfTheForge,
    featuredCharacter: 'chr_0016_laevat',
  },
  {
    id: 'basic-headhunting',
    poolType: 'E_CharacterGachaPoolType_Standard',
    label: 'Basic Headhunting',
    image: null,
  },
  {
    id: 'new-horizons',
    poolType: 'E_CharacterGachaPoolType_Beginner',
    label: 'New Horizons',
    image: newHorizons,
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
  const itemPoolNameLower = (item.poolName || '').toLowerCase();
  const itemPoolIdLower = (item.poolId || '').toLowerCase();
  const bannerLabelLower = banner.label.toLowerCase();

  if (banner.poolType === 'E_CharacterGachaPoolType_Standard') {
    return itemPoolIdLower.includes('standard') || itemPoolNameLower.includes('standard') || itemPoolNameLower.includes('basic headhunting');
  }
  if (banner.poolType === 'E_CharacterGachaPoolType_Beginner') {
    return itemPoolIdLower.includes('beginner') || itemPoolNameLower.includes('beginner') || itemPoolNameLower.includes('new horizons');
  }

  // Special banners match by label
  return itemPoolNameLower.includes(bannerLabelLower) || itemPoolIdLower === banner.id.toLowerCase();
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
