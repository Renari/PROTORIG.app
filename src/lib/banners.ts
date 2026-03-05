import huesOfPassion from '../assets/hues-of-passion.jpg';
import scarsOfTheForge from '../assets/scars-of-the-forge.jpg';
import theFloatyMessenger from '../assets/the-floaty-messenger.jpg';
import newHorizons from '../assets/new-horizons.png';
import type { EndfieldGachaItem } from './api';

export interface BannerInfo {
  id: string;
  poolType: string;
  label: string;
  image: string | null;
}

/**
 * Maps known pool names (from the API `poolName` field) to banner metadata.
 * The `poolName` is used as the key for matching specific limited banners.
 * `poolType` corresponds to `E_CharacterGachaPoolType_*` from the API. 
 * This list must be sorted from the most recent banner to the least recent banner.
 */
export const KNOWN_BANNERS: BannerInfo[] = [
  {
    id: 'hues-of-passion',
    poolType: 'E_CharacterGachaPoolType_Special',
    label: 'Hues of Passion',
    image: huesOfPassion,
  },
  {
    id: 'the-floaty-messenger',
    poolType: 'E_CharacterGachaPoolType_Special',
    label: 'The Floaty Messenger',
    image: theFloatyMessenger,
  },
  {
    id: 'scars-of-the-forge',
    poolType: 'E_CharacterGachaPoolType_Special',
    label: 'Scars of the Forge',
    image: scarsOfTheForge,
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

/**
 * Checks whether an item belongs to a specific banner
 */
export function itemMatchesBanner(item: EndfieldGachaItem, banner: BannerInfo): boolean {
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
