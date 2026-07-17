import { libcurl } from 'libcurl.js/bundled';
import {
  CHARACTER_GACHA_POOL_TYPES,
  type BannerInfo,
} from './banners';

export const ENDFIELD_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

let isInitialized = false;

export async function initLibcurl(wispServerUrl: string = import.meta.env.VITE_WISP_URL) {
  if (isInitialized) return;
  await libcurl.load_wasm();
  libcurl.set_websocket(wispServerUrl);
  isInitialized = true;
}

export interface EndfieldGachaCharacter {
  poolId: string;
  poolName: string;
  charId: string;
  charName: string;
  rarity: number;
  isFree: boolean;
  isNew: boolean;
  gachaTs: string;
  seqId: string;
  pity?: number | null;
}

interface EndfieldGachaDossierRecord {
  kind: 'gift_intel_book';
  poolId: string;
  poolName: string;
  nameText: string;
  gachaTs: string;
  seqId: string;
}

type EndfieldGachaCharacterRecord = EndfieldGachaCharacter | EndfieldGachaDossierRecord;

function isHeadhuntingDossier(
  record: EndfieldGachaCharacterRecord,
): record is EndfieldGachaDossierRecord {
  return 'kind' in record && record.kind === 'gift_intel_book';
}

export interface EndfieldGachaWeapon {
  poolId: string;
  poolName: string;
  weaponId: string;
  weaponName: string;
  weaponType: string;
  rarity: number;
  isNew: boolean;
  gachaTs: string;
  seqId: string;
  pity?: number | null;
}

export type GachaRecordItem = EndfieldGachaCharacter | EndfieldGachaWeapon;

export interface BannerCandidate {
  id: string;
  poolName: string;
  poolType: string;
}

interface EndfieldContentItem {
  id: string;
  name: string;
  rarity: number;
}

interface EndfieldContentPool {
  all?: EndfieldContentItem[];
  pool_gacha_type?: 'char' | 'weapon';
  pool_name?: string;
  pool_type?: 'special' | 'normal' | 'newbie' | 'extra';
  up6_name?: string;
}

interface EndfieldContentResponse {
  code: number;
  data?: { pool?: EndfieldContentPool };
  msg: string;
}

const CONTENT_POOL_TYPES: Record<string, string> = {
  special: CHARACTER_GACHA_POOL_TYPES.SPECIAL,
  normal: CHARACTER_GACHA_POOL_TYPES.STANDARD,
  newbie: CHARACTER_GACHA_POOL_TYPES.BEGINNER,
  extra: CHARACTER_GACHA_POOL_TYPES.JOINT,
};

export function inferCharacterPoolType(poolId: string): string {
  const normalized = poolId.toLowerCase();
  if (normalized === 'standard') {
    return CHARACTER_GACHA_POOL_TYPES.STANDARD;
  }
  if (normalized === 'beginner') {
    return CHARACTER_GACHA_POOL_TYPES.BEGINNER;
  }
  if (normalized.startsWith('joint_')) {
    return CHARACTER_GACHA_POOL_TYPES.JOINT;
  }
  return CHARACTER_GACHA_POOL_TYPES.SPECIAL;
}

export function inferBannerPoolType(poolId: string): string {
  const normalized = poolId.toLowerCase();
  if (normalized.startsWith('weponbox_') || normalized.startsWith('weaponbox_')) {
    return 'weapon';
  }
  return inferCharacterPoolType(poolId);
}

/** Special character and weapon banners use the same version suffix. */
export function getAssociatedWeaponPoolId(poolId: string): string | undefined {
  const match = /^special_(.+)$/i.exec(poolId);
  return match ? `weponbox_${match[1]}` : undefined;
}

export function getMissingBannerCandidates(
  candidates: BannerCandidate[],
  knownBanners: BannerInfo[],
): BannerCandidate[] {
  const knownIds = new Set(knownBanners.map((banner) => banner.id));
  const seenIds = new Set<string>();
  const missingCandidates: BannerCandidate[] = [];

  for (const candidate of candidates) {
    if (knownIds.has(candidate.id) || seenIds.has(candidate.id)) continue;

    seenIds.add(candidate.id);
    missingCandidates.push(candidate);
  }

  return missingCandidates;
}

function getFeaturedId(pool: EndfieldContentPool): string | undefined {
  if (!pool.up6_name) return undefined;

  return pool.all?.find((item) => (
    item.rarity === 6 && item.name === pool.up6_name
  ))?.id;
}

export function mapContentToBanner(candidate: BannerCandidate, pool?: EndfieldContentPool): BannerInfo {
  if (!pool) return candidate;

  const poolType = pool.pool_gacha_type === 'weapon'
    ? 'weapon'
    : CONTENT_POOL_TYPES[pool.pool_type ?? ''] ?? candidate.poolType;

  return {
    id: candidate.id,
    poolName: pool.pool_name || candidate.poolName,
    poolType,
    featured: getFeaturedId(pool),
  };
}

/**
 * Fetch metadata only for pools that the content endpoint currently confirms.
 * Expired or otherwise unavailable pools are omitted; record-derived metadata is handled separately.
 */
export async function fetchBannerMetadata(
  candidates: BannerCandidate[],
  serverId: string,
  lang: string,
): Promise<BannerInfo[]> {
  await initLibcurl();
  const uniqueCandidates = Array.from(new Map(candidates.map((candidate) => [candidate.id, candidate])).values());

  const banners = await Promise.all(uniqueCandidates.map(async (candidate): Promise<BannerInfo | null> => {
    const url = new URL('https://ef-webview.gryphline.com/api/content');
    url.searchParams.set('lang', lang);
    url.searchParams.set('pool_id', candidate.id);
    url.searchParams.set('server_id', serverId);

    try {
      const response = await libcurl.fetch(url.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': ENDFIELD_USER_AGENT,
        },
      });
      if (!response.ok) return null;

      const json = JSON.parse(await response.text()) as EndfieldContentResponse;
      if (json.code !== 0) return null;
      return mapContentToBanner(candidate, json.data?.pool);
    } catch {
      // Banner metadata should not prevent pull history from importing.
      return null;
    }
  }));

  return banners.filter((banner): banner is BannerInfo => banner !== null);
}

export interface EndfieldGachaResponse {
  code: number;
  data: {
    list: EndfieldGachaCharacterRecord[];
    hasMore: boolean;
  };
  msg: string;
}

export const CHARACTER_FETCH_POOL_TYPES = [
  CHARACTER_GACHA_POOL_TYPES.SPECIAL,
  CHARACTER_GACHA_POOL_TYPES.STANDARD,
  CHARACTER_GACHA_POOL_TYPES.BEGINNER,
  CHARACTER_GACHA_POOL_TYPES.JOINT,
];

export async function fetchAllCharacters(
  token: string,
  serverId: string,
  lang: string,
  onProgress: (pool: string, count: number) => void,
  maxExistingSeqId: number,
  onPoolObserved?: (candidate: BannerCandidate) => void,
): Promise<EndfieldGachaCharacter[]> {
  await initLibcurl();

  let allCharacters: EndfieldGachaCharacter[] = [];

  for (const poolType of CHARACTER_FETCH_POOL_TYPES) {
    let seqId = '';
    let hasMore = true;

    while (hasMore) {
      const url = new URL('https://ef-webview.gryphline.com/api/record/char');
      url.searchParams.append('lang', lang);
      if (seqId) url.searchParams.append('seq_id', seqId);
      url.searchParams.append('pool_type', poolType);
      url.searchParams.append('token', token);
      url.searchParams.append('server_id', serverId);

      const response = await libcurl.fetch(url.toString(), {
        method: 'GET',
        headers: {
            'User-Agent': ENDFIELD_USER_AGENT,
        }
      });

      if (!response.ok) {
        throw new Error(`API returned an error: ${response.status} ${response.statusText}`);
      }

      const text = await response.text();
      let json: EndfieldGachaResponse;
      try {
        json = JSON.parse(text);
      } catch (err) {
        throw new Error('Failed to parse JSON response from Endfield API.');
      }

      if (json.code !== 0) {
        throw new Error(`Error from API (Code ${json.code}): ${json.msg || 'Unknown or expired token error'}`);
      }

      const list = json.data.list || [];
      const characters = list.filter(
        (item): item is EndfieldGachaCharacter => !isHeadhuntingDossier(item),
      );
      const invalidCharacter = characters.find((item) => !Number.isFinite(item.rarity));
      if (invalidCharacter) {
        const diagnostic = [
          `pool=${invalidCharacter.poolId}`,
          `character=${invalidCharacter.charId}`,
          `seq=${invalidCharacter.seqId}`,
          `rarity=${String(invalidCharacter.rarity)}`,
          `fields=${Object.keys(invalidCharacter).join(',')}`,
        ].join(', ');

        console.error(`[Endfield API] Character record has invalid rarity: ${diagnostic}`);
        throw new Error(`Character record has invalid rarity: ${diagnostic}`);
      }

      for (const item of list) {
        if (item.poolId) {
          onPoolObserved?.({ id: item.poolId, poolName: item.poolName, poolType });
        }
      }
      let reachedExisting = false;
      for (const item of list) {
        if (Number(item.seqId) <= maxExistingSeqId) {
          reachedExisting = true;
          break;
        }
        if (!isHeadhuntingDossier(item)) {
          allCharacters.push(item);
        }
      }

      if (list.length > 0 && !reachedExisting) {
        seqId = list[list.length - 1].seqId;
      }

      hasMore = !reachedExisting && json.data.hasMore && list.length > 0;
      onProgress(poolType.replace('E_CharacterGachaPoolType_', ''), allCharacters.length);
    }
  }

  allCharacters.sort((a, b) => Number(a.gachaTs) - Number(b.gachaTs));

  return allCharacters;
}

export interface EndfieldGachaWeaponPool {
  poolId: string;
  poolName: string;
}

export interface EndfieldGachaWeaponResponse {
  code: number;
  data: {
    list: EndfieldGachaWeapon[];
    hasMore: boolean;
  };
  msg: string;
}

export async function fetchAllWeapons(
  token: string,
  serverId: string,
  lang: string,
  onProgress: (count: number) => void,
  maxExistingSeqId: number,
  onPoolObserved?: (candidate: BannerCandidate) => void,
): Promise<EndfieldGachaWeapon[]> {
  await initLibcurl();
  let allWeapons: EndfieldGachaWeapon[] = [];
  let seqId = '';
  let hasMore = true;

  while (hasMore) {
    const url = new URL('https://ef-webview.gryphline.com/api/record/weapon');
    url.searchParams.append('lang', lang);
    if (seqId) url.searchParams.append('seq_id', seqId);
    url.searchParams.append('token', token);
    url.searchParams.append('server_id', serverId);

    const response = await libcurl.fetch(url.toString(), {
      method: 'GET',
      headers: {
          'User-Agent': ENDFIELD_USER_AGENT,
      }
    });

    if (!response.ok) {
      throw new Error(`API returned an error: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    let json: EndfieldGachaWeaponResponse;
    try {
      json = JSON.parse(text);
    } catch (err) {
      throw new Error('Failed to parse JSON response from Endfield API.');
    }

    if (json.code !== 0) {
      throw new Error(`Error from API (Code ${json.code}): ${json.msg || 'Unknown or expired token error'}`);
    }

    const list = json.data.list || [];
    for (const item of list) {
      if (item.poolId) {
        onPoolObserved?.({ id: item.poolId, poolName: item.poolName, poolType: 'weapon' });
      }
    }
    let reachedExisting = false;
    for (const item of list) {
      if (Number(item.seqId) <= maxExistingSeqId) {
        reachedExisting = true;
        break;
      }
      allWeapons.push(item);
    }

    if (list.length > 0 && !reachedExisting) {
      seqId = list[list.length - 1].seqId;
    }

    hasMore = !reachedExisting && json.data.hasMore && list.length > 0;
    onProgress(allWeapons.length);
  }

  allWeapons.sort((a, b) => Number(a.gachaTs) - Number(b.gachaTs));

  return allWeapons;
}
