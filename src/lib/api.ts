import { libcurl } from 'libcurl.js/bundled';

let isInitialized = false;

// We use a public wisp server to proxy our raw Libcurl TCP connections.
// Since Libcurl handles TLS, the proxy cannot see the token or the response data.
export async function initLibcurl(wispServerUrl: string = import.meta.env.VITE_WISP_URL) {
  if (isInitialized) return;
  await libcurl.load_wasm();
  libcurl.set_websocket(wispServerUrl);
  isInitialized = true;
}

export interface EndfieldGachaItem {
  poolId: string;
  poolName: string;
  charId: string;
  charName: string;
  rarity: number;
  isFree: boolean;
  isNew: boolean;
  gachaTs: string;
  seqId: string;
}

export interface EndfieldGachaResponse {
  code: number;
  data: {
    list: EndfieldGachaItem[];
    hasMore: boolean;
  };
  msg: string;
}

export async function fetchAllPulls(
  token: string,
  onProgress: (pool: string, count: number) => void
): Promise<EndfieldGachaItem[]> {
  await initLibcurl();

  const pools = ['E_CharacterGachaPoolType_Special', 'E_CharacterGachaPoolType_Standard', "E_CharacterGachaPoolType_Beginner"];
  let allItems: EndfieldGachaItem[] = [];

  for (const poolType of pools) {
    let seqId = '';
    let hasMore = true;
    let poolCount = 0;

    while (hasMore) {
      const url = new URL('https://ef-webview.gryphline.com/api/record/char');
      url.searchParams.append('lang', 'en-us');
      if (seqId) url.searchParams.append('seq_id', seqId);
      url.searchParams.append('pool_type', poolType);
      url.searchParams.append('token', token);
      url.searchParams.append('server_id', '3'); // from HAR

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
        allItems.push(...list);
        poolCount += list.length;
        // seqId points to the last item fetched to tell the server where to resume
        seqId = list[list.length - 1].seqId;
      }

      hasMore = json.data.hasMore && list.length > 0;
      onProgress(poolType.replace('E_CharacterGachaPoolType_', ''), allItems.length);
    }
  }

  // Sort by timestamp ascending (oldest first) so it matches UIGF conventions visually later
  allItems.sort((a, b) => Number(a.gachaTs) - Number(b.gachaTs));

  return allItems;
}
