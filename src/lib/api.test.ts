/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import he from 'he';
import { config } from 'dotenv';
config();

const VITE_API_URL = 'https://ef-webview.gryphline.com/api/record/char';

describe('Endfield API Fetching via Native Node Fetch (Diagnostics)', () => {
  it('Should successfully fetch pulls', async () => {
    const rawToken = process.env.U8_TOKEN;
    if (!rawToken) {
      console.warn('Skipping API test: U8_TOKEN not found in .env');
      return;
    }

    const token = decodeURIComponent(he.decode(rawToken));
    console.log('Starting fetch with token:', token.substring(0, 10) + '...');
    
    let totalPulls = 0;
    
    try {
      const pools = ['E_CharacterGachaPoolType_Special', 'E_CharacterGachaPoolType_Standard'];

      for (const poolType of pools) {
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

          const requestUrl = `${VITE_API_URL}?${params.toString()}`;
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
          totalPulls += items.length;
          poolCount += items.length;
          console.log(`[Diagnostic] Pool: ${poolType} | Items retrieved this pool: ${poolCount} | Total overall: ${totalPulls}`);

          if (items.length > 0) {
            seqId = items[items.length - 1].seqId;
          }

          hasMore = data.data.hasMore && items.length > 0;
        }
      }

      console.log('Diagnostic fetch completed successfully!');
      console.log(`Total items retrieved diagnostic: ${totalPulls}`);
      
    } catch (err: any) {
      console.error('API Fetch failed with error:', err.message);
      throw err;
    }
  }, 60000); // 60s timeout
});
