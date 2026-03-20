import { libcurl } from 'libcurl.js/bundled';
import { CHARACTER_GACHA_POOL_TYPES } from './banners';

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

export interface EndfieldGachaResponse {
  code: number;
  data: {
    list: EndfieldGachaCharacter[];
    hasMore: boolean;
  };
  msg: string;
}

export async function fetchAllCharacters(
  token: string,
  serverId: string,
  lang: string,
  onProgress: (pool: string, count: number) => void
): Promise<EndfieldGachaCharacter[]> {
  await initLibcurl();

  let allCharacters: EndfieldGachaCharacter[] = [];

  for (const poolType of Object.values(CHARACTER_GACHA_POOL_TYPES)) {
    let seqId = '';
    let hasMore = true;
    let poolCount = 0;

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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
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
      if (list.length > 0) {
        allCharacters.push(...list);
        poolCount += list.length;
        // seqId points to the last item fetched to tell the server where to resume
        seqId = list[list.length - 1].seqId;
      }

      hasMore = json.data.hasMore && list.length > 0;
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

export interface EndfieldGachaWeaponPoolResponse {
  code: number;
  data: EndfieldGachaWeaponPool[];
  msg: string;
}

export interface EndfieldGachaWeaponResponse {
  code: number;
  data: {
    list: EndfieldGachaWeapon[];
    hasMore: boolean;
  };
  msg: string;
}

export async function fetchWeaponPools(
  token: string,
  serverId: string,
  lang: string
): Promise<EndfieldGachaWeaponPool[]> {
  await initLibcurl();
  const url = new URL('https://ef-webview.gryphline.com/api/record/weapon/pool');
  url.searchParams.append('lang', lang);
  url.searchParams.append('token', token);
  url.searchParams.append('server_id', serverId);

  const response = await libcurl.fetch(url.toString(), {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`API returned an error: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  let json: EndfieldGachaWeaponPoolResponse;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error('Failed to parse JSON response from Endfield API.');
  }

  if (json.code !== 0) {
    throw new Error(`Error from API (Code ${json.code}): ${json.msg || 'Unknown or expired token error'}`);
  }

  return json.data || [];
}

export async function fetchAllWeapons(
  token: string,
  serverId: string,
  lang: string,
  pools: EndfieldGachaWeaponPool[],
  onProgress: (poolName: string, count: number) => void
): Promise<EndfieldGachaWeapon[]> {
  await initLibcurl();
  let allWeapons: EndfieldGachaWeapon[] = [];

  for (const pool of pools) {
    let seqId = '';
    let hasMore = true;
    let poolCount = 0;

    while (hasMore) {
      const url = new URL('https://ef-webview.gryphline.com/api/record/weapon');
      url.searchParams.append('lang', lang);
      if (seqId) url.searchParams.append('seq_id', seqId);
      url.searchParams.append('pool_id', pool.poolId);
      url.searchParams.append('token', token);
      url.searchParams.append('server_id', serverId);

      const response = await libcurl.fetch(url.toString(), {
        method: 'GET',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
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
      if (list.length > 0) {
        allWeapons.push(...list);
        poolCount += list.length;
        seqId = list[list.length - 1].seqId;
      }

      hasMore = json.data.hasMore && list.length > 0;
      onProgress(pool.poolName, allWeapons.length);
    }
  }

  allWeapons.sort((a, b) => Number(a.gachaTs) - Number(b.gachaTs));

  return allWeapons;
}
