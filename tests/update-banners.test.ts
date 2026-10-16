/**
 * @vitest-environment node
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('banner updater', () => {
  it.each([
    ['1_5_1', 'weponbox', false],
    ['1_6_1', 'weaponbox', false],
    ['1_10_1', 'weaponbox', false],
    ['2_0_1', 'weaponbox', false],
    ['1_6_1', 'weaponbox', true],
  ] as const)('selects %s weapon pools using %s (explicit weapon: %s)', (version, prefix, explicitWeapon) => {
    const root = mkdtempSync(join(tmpdir(), 'update-banners-'));
    try {
      mkdirSync(join(root, 'scripts'));
      mkdirSync(join(root, 'src/lib'), { recursive: true });
      mkdirSync(join(root, 'bin'));
      copyFileSync(new URL('../scripts/update-banners.sh', import.meta.url), join(root, 'scripts/update-banners.sh'));
      copyFileSync(new URL('../src/lib/api.ts', import.meta.url), join(root, 'src/lib/api.ts'));
      const historical = { id: 'expired', poolName: 'Historical Banner', poolType: 'weapon', featured: 'wpn_old' };
      writeFileSync(join(root, 'src/lib/banners.jsonc'), JSON.stringify([historical]));
      writeFileSync(join(root, 'bin/curl'), `#!/usr/bin/env node
require('node:fs').appendFileSync('${root}/requests', process.argv.join(' ') + '\\n');
const poolId = process.argv.find(arg => arg.startsWith('pool_id='))?.slice(8);
const pool = poolId === 'special_${version}' ? {
  pool_gacha_type: 'char', pool_type: 'special', pool_name: 'Rejuvenation',
  up6_name: 'Operator', all: [{ id: 'chr_0036_jsspsi', name: 'Operator', rarity: 6 }],
} : poolId === '${prefix}_${version}' ? {
  pool_gacha_type: 'weapon', pool_type: 'normal', pool_name: 'Seal of Jade Issue',
  up6_name: 'Jade Vessel', all: [{ id: 'wpn_claym_0018', name: 'Jade Vessel', rarity: 6 }],
} : null;
console.log(JSON.stringify(pool ? { code: 0, data: { pool } } : { code: 40402, msg: 'Pool not found' }));
`, { mode: 0o755 });
      // The explicit weapon ID also exercises duplicate queue entries under set -e.
      const output = execFileSync('bash', [join(root, 'scripts/update-banners.sh'),
        '--pool-id', `special_${version}`,
        ...(explicitWeapon ? ['--pool-id', `${prefix}_${version}`] : []), '--dry-run'], {
        env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}` },
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
      });
      expect(JSON.parse(output)).toEqual(expect.arrayContaining([
        historical,
        { id: `special_${version}`, poolType: 'E_CharacterGachaPoolType_Special', poolName: 'Rejuvenation', featured: 'chr_0036_jsspsi' },
        { id: `${prefix}_${version}`, poolType: 'weapon', poolName: 'Seal of Jade Issue', featured: 'wpn_claym_0018' },
      ]));
      expect(JSON.parse(output)).toHaveLength(3);
      const requests = readFileSync(join(root, 'requests'), 'utf8').trim().split('\n');
      expect(requests).toHaveLength(2);
      expect(requests[0]).toContain(`pool_id=special_${version}`);
      expect(requests[1]).toContain(`pool_id=${prefix}_${version}`);
      expect(JSON.parse(readFileSync(join(root, 'src/lib/banners.jsonc'), 'utf8'))).toEqual([historical]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
