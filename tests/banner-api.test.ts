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
import { CHARACTER_FETCH_POOL_TYPES, fetchAllCharacters, fetchAllWeapons, fetchBannerMetadata, getAssociatedWeaponPoolId, getMissingBannerCandidates, inferBannerPoolType, inferCharacterPoolType, mapContentToBanner, type BannerCandidate } from '../src/lib/api';
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
    expect(getAssociatedWeaponPoolId('standard')).toBeUndefined();
  });

  it.each([
    ['special_1_5_1', 'weponbox_1_5_1'],
    ['special_1_6_1', 'weaponbox_1_6_1'],
    ['special_1_6_2', 'weaponbox_1_6_2'],
    ['special_1_10_1', 'weaponbox_1_10_1'],
    ['special_2_0_1', 'weaponbox_2_0_1'],
    ['special_event', undefined],
  ])('selects the weapon pool for %s by version', (id, expected) => {
    expect(getAssociatedWeaponPoolId(id)).toBe(expected);
  });

  it('discovers weapon metadata when only the corrected weaponbox spelling exists', async () => {
    vi.mocked(libcurl.fetch).mockImplementation(async (url) => {
      const id = new URL(String(url)).searchParams.get('pool_id');
      return {
        ok: true,
        text: async () => JSON.stringify(id === 'weaponbox_1_6_1' ? {
          code: 0,
          data: { pool: {
            pool_gacha_type: 'weapon', pool_type: 'normal', pool_name: 'Seal of Jade Issue',
            up6_name: 'Jade Vessel', all: [{ id: 'wpn_claym_0018', name: 'Jade Vessel', rarity: 6 }],
          } },
        } : { code: 40402, msg: 'Pool not found' }),
      } as any;
    });

    const id = getAssociatedWeaponPoolId('special_1_6_1')!;
    const candidates = [{ id, poolName: id, poolType: 'weapon' }];
    expect(await fetchBannerMetadata(candidates, '3', 'en-us')).toEqual([{
      id: 'weaponbox_1_6_1', poolType: 'weapon', poolName: 'Seal of Jade Issue', featured: 'wpn_claym_0018',
    }]);
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
        kind: 'draw', poolId: 'special_1_4_1', poolName: 'North Yearns the Rift Vigile', charId: 'chr_new', charName: 'New',
        poolVersion: null, nameText: 'New',
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

  it.each(['gift_intel_book', 'gift_operator_token', 'future_reward', undefined, null, ''])('skips character records with kind %s without skipping draws', async (kind) => {
    vi.mocked(libcurl.fetch).mockImplementation(async (url) => {
      const poolType = new URL(String(url)).searchParams.get('pool_type');
      const list = poolType === CHARACTER_GACHA_POOL_TYPES.SPECIAL ? [
        {
          kind, poolId: 'special_1_6_1', poolName: 'Rejuvenation', poolVersion: null,
          nameText: "Si's Token", gachaTs: '1792121621485', seqId: '1532',
        },
        {
          kind: 'draw', poolId: 'special_1_4_1', poolName: 'North Yearns the Rift Vigile', charId: 'chr_valid', charName: 'Valid',
          poolVersion: null, nameText: 'Valid',
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

  it.each(['gift_weapon', 'gift_operator_token', 'future_reward', undefined, null, ''])('skips weapon records with kind %s without skipping draws', async (kind) => {
    vi.mocked(libcurl.fetch).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        code: 0,
        data: {
          list: [
            {
              kind, poolId: 'weponbox_1_3_1', poolName: 'Scarlet Knot Issue',
              poolVersion: null, nameText: 'Amaranthine Tassel', gachaTs: '1785683585293', seqId: '361',
              giftRewardLabel: 'Scarlet Knot Tribute',
            },
            {
              kind: 'draw', poolId: 'weponbox_1_3_1', poolName: 'Scarlet Knot Issue', weaponId: 'wpn_valid',
              poolVersion: null, nameText: 'Valid',
              weaponName: 'Valid', weaponType: 'Sword', rarity: 4, isNew: false,
              gachaTs: '1785683585292', seqId: '360',
            },
          ],
          hasMore: false,
        },
        msg: '',
      }),
    } as any);

    const pulls = await fetchAllWeapons('token', '3', 'en-us', () => {}, 0);

    expect(pulls).toHaveLength(1);
    expect(pulls[0].weaponId).toBe('wpn_valid');
  });

  it.each(['character', 'weapon'])('paginates through ignored %s records and stops at existing history', async (type) => {
    const isCharacter = type === 'character';
    const metadata = {
      poolId: isCharacter ? 'special_1_6_1' : 'weaponbox_1_6_1',
      poolName: 'Rejuvenation', poolVersion: null, nameText: "Si's Token",
    };
    const draw = {
      ...metadata, kind: 'draw', nameText: 'Valid', rarity: 6, isNew: false,
      ...(isCharacter
        ? { charId: 'chr_valid', charName: 'Valid', isFree: false }
        : { weaponId: 'wpn_valid', weaponName: 'Valid', weaponType: 'Sword' }),
      gachaTs: '300', seqId: '3',
    };
    const cursors: (string | null)[] = [];
    vi.mocked(libcurl.fetch).mockImplementation(async (url) => {
      const params = new URL(String(url)).searchParams;
      let list: object[] = [];
      let hasMore = false;
      if (!isCharacter || params.get('pool_type') === CHARACTER_GACHA_POOL_TYPES.SPECIAL) {
        const cursor = params.get('seq_id');
        cursors.push(cursor);
        if (cursor === null) {
          list = [{ ...metadata, kind: 'gift_operator_token', gachaTs: '400', seqId: '4' }];
          hasMore = true;
        } else if (cursor === '4') {
          list = [draw, { ...metadata, kind: 'future_reward', gachaTs: '200', seqId: '2' }];
          hasMore = true;
        } else if (cursor === '2') {
          list = [{ ...draw, gachaTs: '100', seqId: '1' }];
          hasMore = true;
        } else {
          throw new Error(`Unexpected cursor: ${cursor}`);
        }
      }
      return {
        ok: true,
        text: async () => JSON.stringify({ code: 0, data: { list, hasMore }, msg: '' }),
      } as any;
    });
    const progress = vi.fn();
    const observed = vi.fn();

    const pulls = isCharacter
      ? await fetchAllCharacters('token', '3', 'en-us', (pool, count) => {
        if (pool === 'Special') progress(count);
      }, 1, observed)
      : await fetchAllWeapons('token', '3', 'en-us', progress, 1, observed);

    expect(pulls).toEqual([draw]);
    expect(cursors).toEqual([null, '4', '2']);
    expect(progress.mock.calls).toEqual([[0], [1], [1]]);
    expect(observed).toHaveBeenCalledWith({
      id: metadata.poolId, poolName: metadata.poolName,
      poolType: isCharacter ? CHARACTER_GACHA_POOL_TYPES.SPECIAL : 'weapon',
    });
  });
});
