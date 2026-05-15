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

import { CHARACTER_FETCH_POOL_TYPES } from '../src/lib/api';
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
});
