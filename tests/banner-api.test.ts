/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('libcurl.js/bundled', () => ({
  libcurl: {
    load_wasm: vi.fn(),
    set_websocket: vi.fn(),
    fetch: vi.fn(),
  },
}));

import { libcurl } from 'libcurl.js/bundled';
import { CHARACTER_FETCH_POOL_TYPES, fetchAllCharacters, getAssociatedWeaponPoolId, getMissingBannerCandidates, inferBannerPoolType, inferCharacterPoolType, mapContentToBanner, type BannerCandidate } from '../src/lib/api';
import { CHARACTER_GACHA_POOL_TYPES, KNOWN_BANNERS } from '../src/lib/banners';

describe('banner and API metadata', () => {
  it('includes Joint in character API imports', () => {
    expect(CHARACTER_FETCH_POOL_TYPES).toEqual([
      CHARACTER_GACHA_POOL_TYPES.SPECIAL,
      CHARACTER_GACHA_POOL_TYPES.STANDARD,
      CHARACTER_GACHA_POOL_TYPES.BEGINNER,
      CHARACTER_GACHA_POOL_TYPES.JOINT,
    ]);
  });

  it('supports joint banner featured arrays', () => {
    const jointBanner = KNOWN_BANNERS.find((banner) => banner.id === 'joint_1_2_2');

    expect(jointBanner?.poolType).toBe(CHARACTER_GACHA_POOL_TYPES.JOINT);
    expect(jointBanner?.featured).toEqual([
      'chr_0029_pograni',
      'chr_0013_aglina',
      'chr_0016_laevat',
      'chr_0025_ardelia',
    ]);
  });

  it('maps live content metadata to database-ready banner metadata', () => {
    const banner = mapContentToBanner(
      { id: 'special_9_9_9', poolName: 'special_9_9_9', poolType: CHARACTER_GACHA_POOL_TYPES.SPECIAL },
      {
        pool_gacha_type: 'char',
        pool_name: 'Future Banner',
        pool_type: 'special',
        up6_name: 'Future Operator',
        all: [
          { id: 'chr_future', name: 'Future Operator', rarity: 6 },
          { id: 'chr_other', name: 'Other Operator', rarity: 6 },
        ],
      },
    );

    expect(banner).toEqual({
      id: 'special_9_9_9',
      poolName: 'Future Banner',
      poolType: CHARACTER_GACHA_POOL_TYPES.SPECIAL,
      featured: 'chr_future',
    });
  });

  it('classifies the observed pool ID formats', () => {
    expect(inferCharacterPoolType('joint_9_9_9')).toBe(CHARACTER_GACHA_POOL_TYPES.JOINT);
    expect(inferCharacterPoolType('beginner')).toBe(CHARACTER_GACHA_POOL_TYPES.BEGINNER);
    expect(inferCharacterPoolType('special_beginner_event')).toBe(CHARACTER_GACHA_POOL_TYPES.SPECIAL);
    expect(inferCharacterPoolType('special_standard_event')).toBe(CHARACTER_GACHA_POOL_TYPES.SPECIAL);
    expect(inferBannerPoolType('weponbox_9_9_9')).toBe('weapon');
    expect(inferBannerPoolType('weaponbox_constant_9')).toBe('weapon');
    expect(getAssociatedWeaponPoolId('special_1_4_1')).toBe('weponbox_1_4_1');
  });

  it('returns only pool IDs observed in the import that are missing from the database', () => {
    const known = [{
      id: 'special_1_3_2',
      poolName: 'Expunger of Sin',
      poolType: CHARACTER_GACHA_POOL_TYPES.SPECIAL,
    }];
    expect(getMissingBannerCandidates([
      known[0],
      {
        id: 'special_1_4_1',
        poolName: 'North Yearns the Rift Vigile',
        poolType: CHARACTER_GACHA_POOL_TYPES.SPECIAL,
      },
    ], known)).toEqual([{
      id: 'special_1_4_1',
      poolName: 'North Yearns the Rift Vigile',
      poolType: CHARACTER_GACHA_POOL_TYPES.SPECIAL,
    }]);
  });

  it('observes pool IDs returned by the API even when their pulls already exist', async () => {
    vi.mocked(libcurl.fetch).mockImplementation(async (url) => {
      const poolType = new URL(String(url)).searchParams.get('pool_type');
      const list = poolType === CHARACTER_GACHA_POOL_TYPES.SPECIAL ? [{
        poolId: 'special_1_4_1', poolName: 'North Yearns the Rift Vigile', charId: 'chr_new', charName: 'New',
        rarity: 4, isFree: false, isNew: false, gachaTs: '200', seqId: '2',
      }] : [];
      return {
        ok: true,
        text: async () => JSON.stringify({ code: 0, data: { list, hasMore: false }, msg: '' }),
      } as any;
    });
    const observed: BannerCandidate[] = [];

    const pulls = await fetchAllCharacters('token', '3', 'en-us', () => {}, 2, (pool) => observed.push(pool));

    expect(pulls).toEqual([]);
    expect(observed).toContainEqual({
      id: 'special_1_4_1',
      poolName: 'North Yearns the Rift Vigile',
      poolType: CHARACTER_GACHA_POOL_TYPES.SPECIAL,
    });
  });

  it('reports identifying fields when a character record has no rarity', async () => {
    vi.mocked(libcurl.fetch).mockImplementation(async (url) => {
      const poolType = new URL(String(url)).searchParams.get('pool_type');
      const list = poolType === CHARACTER_GACHA_POOL_TYPES.SPECIAL ? [{
        poolId: 'special_1_4_1', poolName: 'North Yearns the Rift Vigile', charId: 'chr_invalid', charName: 'Invalid',
        isFree: false, isNew: false, gachaTs: '200', seqId: '2',
      }] : [];
      return {
        ok: true,
        text: async () => JSON.stringify({ code: 0, data: { list, hasMore: false }, msg: '' }),
      } as any;
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(fetchAllCharacters('token', '3', 'en-us', () => {}, 0)).rejects.toThrow(
      'Character record has invalid rarity: pool=special_1_4_1, character=chr_invalid, seq=2, rarity=undefined, fields=poolId,poolName,charId,charName,isFree,isNew,gachaTs,seqId',
    );
    expect(consoleError).toHaveBeenCalledWith(
      '[Endfield API] Character record has invalid rarity: pool=special_1_4_1, character=chr_invalid, seq=2, rarity=undefined, fields=poolId,poolName,charId,charName,isFree,isNew,gachaTs,seqId',
    );

    consoleError.mockRestore();
  });

  it('skips gift_intel_book records without skipping character pulls', async () => {
    vi.mocked(libcurl.fetch).mockImplementation(async (url) => {
      const poolType = new URL(String(url)).searchParams.get('pool_type');
      const list = poolType === CHARACTER_GACHA_POOL_TYPES.SPECIAL ? [
        {
          kind: 'gift_intel_book', poolId: 'special_1_4_1', poolName: 'North Yearns the Rift Vigile',
          nameText: 'Localized dossier name', gachaTs: '201', seqId: '3',
        },
        {
          poolId: 'special_1_4_1', poolName: 'North Yearns the Rift Vigile', charId: 'chr_valid', charName: 'Valid',
          rarity: 4, isFree: false, isNew: false, gachaTs: '200', seqId: '2',
        },
      ] : [];
      return {
        ok: true,
        text: async () => JSON.stringify({ code: 0, data: { list, hasMore: false }, msg: '' }),
      } as any;
    });

    const pulls = await fetchAllCharacters('token', '3', 'en-us', () => {}, 0);

    expect(pulls).toHaveLength(1);
    expect(pulls[0].charId).toBe('chr_valid');
  });
});
