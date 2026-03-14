/**
 * @vitest-environment node
 */
import { describe, it } from 'vitest';
// @ts-ignore
import he from 'he';
import { config } from 'dotenv';
config();

const VITE_API_CHAR_URL = 'https://ef-webview.gryphline.com/api/record/char';
const VITE_API_WEAPON_POOL_URL = 'https://ef-webview.gryphline.com/api/record/weapon/pool';
const VITE_API_WEAPON_URL = 'https://ef-webview.gryphline.com/api/record/weapon';

describe.skipIf(!process.env.U8_TOKEN)('Endfield API Fetching via Native Node Fetch (Diagnostics)', () => {
  it('Should successfully fetch pulls', async () => {
    const rawToken = process.env.U8_TOKEN!;

    const token = decodeURIComponent(he.decode(rawToken));
    console.log('Starting fetch with token:', token.substring(0, 10) + '...');
    
    let totalCharPulls = 0;
    
    try {
      const charPools = ['E_CharacterGachaPoolType_Special', 'E_CharacterGachaPoolType_Standard'];

      for (const poolType of charPools) {
        let seqId = '';
        let hasMore = true;
        let poolCount = 0;

        while (hasMore) {
          const params = new URLSearchParams();
          params.append('lang', 'en-us');
          if (seqId) params.append('seq_id', seqId);
          params.append('pool_type', poolType);
          params.append('token', token);
          params.append('server_id', '3'); // from HAR

          const requestUrl = `${VITE_API_CHAR_URL}?${params.toString()}`;
          console.log(`[Diagnostic] Fetching ${requestUrl}...`);
          
          const response = await fetch(requestUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Connection': 'keep-alive',
              'Origin': 'https://ef-webview.gryphline.com',
              'Referer': `https://ef-webview.gryphline.com/gacha?u8_token=${encodeURIComponent(token)}`
            }
          });

          if (!response.ok) {
             const errorBody = await response.text();
             throw new Error(`HTTP Error: ${response.status} ${response.statusText} - Body: ${errorBody}`);
          }

          const data: any = await response.json();
          
          if (data.code !== 0) {
            throw new Error(`API Error: ${data.code} - ${data.msg}`);
          }

          const items = data.data.list || [];
          totalCharPulls += items.length;
          poolCount += items.length;
          console.log(`[Diagnostic Character] Pool: ${poolType} | Items retrieved this pool: ${poolCount} | Total overall: ${totalCharPulls}`);

          if (items.length > 0) {
            seqId = items[items.length - 1].seqId;
          }

          hasMore = data.data.hasMore && items.length > 0;
        }
      }

      console.log('Diagnostic character fetch completed successfully!');
      console.log(`Total character items retrieved diagnostic: ${totalCharPulls}`);
      
      // Fetch Weapon Pools First
      console.log('Starting weapon diagnostic fetch...');
      const weaponPoolParams = new URLSearchParams();
      weaponPoolParams.append('lang', 'en-us');
      weaponPoolParams.append('token', token);
      weaponPoolParams.append('server_id', '3');

      const weaponPoolsResponse = await fetch(`${VITE_API_WEAPON_POOL_URL}?${weaponPoolParams.toString()}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Connection': 'keep-alive',
          'Origin': 'https://ef-webview.gryphline.com',
          'Referer': `https://ef-webview.gryphline.com/gacha?u8_token=${encodeURIComponent(token)}`
        }
      });

      if (!weaponPoolsResponse.ok) {
         throw new Error(`HTTP Error: ${weaponPoolsResponse.status}`);
      }
      const poolData: any = await weaponPoolsResponse.json();
      
      if (poolData.code !== 0) {
        throw new Error(`API Error: ${poolData.code} - ${poolData.msg}`);
      }

      const weaponPools = poolData.data || [];
      console.log(`[Diagnostic Weapon] Found ${weaponPools.length} weapon pools`);

      let totalWeaponPulls = 0;

      for (const pool of weaponPools) {
        let seqIdWeapon = '';
        let hasMoreWeapon = true;
        let weaponPoolCount = 0;

        while (hasMoreWeapon) {
          const wParams = new URLSearchParams();
          wParams.append('lang', 'en-us');
          if (seqIdWeapon) wParams.append('seq_id', seqIdWeapon);
          wParams.append('pool_id', pool.poolId);
          wParams.append('token', token);
          wParams.append('server_id', '3'); // from HAR

          const requestUrl = `${VITE_API_WEAPON_URL}?${wParams.toString()}`;
          console.log(`[Diagnostic Weapon] Fetching ${requestUrl}...`);
          
          const response = await fetch(requestUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Connection': 'keep-alive',
              'Origin': 'https://ef-webview.gryphline.com',
              'Referer': `https://ef-webview.gryphline.com/gacha?u8_token=${encodeURIComponent(token)}`
            }
          });

          if (!response.ok) {
             const errorBody = await response.text();
             throw new Error(`HTTP Error: ${response.status} ${response.statusText} - Body: ${errorBody}`);
          }

          const wpData: any = await response.json();
          
          if (wpData.code !== 0) {
            throw new Error(`API Error: ${wpData.code} - ${wpData.msg}`);
          }

          const wpItems = wpData.data.list || [];
          totalWeaponPulls += wpItems.length;
          weaponPoolCount += wpItems.length;
          console.log(`[Diagnostic Weapon] Pool: ${pool.poolName} | Items retrieved this pool: ${weaponPoolCount} | Total overall: ${totalWeaponPulls}`);

          if (wpItems.length > 0) {
            seqIdWeapon = wpItems[wpItems.length - 1].seqId;
          }

          hasMoreWeapon = wpData.data.hasMore && wpItems.length > 0;
        }
      }

      console.log('Diagnostic weapon fetch completed successfully!');
      console.log(`Total weapon items retrieved diagnostic: ${totalWeaponPulls}`);
      
    } catch (err: any) {
      console.error('API Fetch failed with error:', err.message);
      throw err;
    }
  }, 60000); // 60s timeout
});
