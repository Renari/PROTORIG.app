<script lang="ts">
  const bannerImages = import.meta.glob('./assets/banners/*.{png,jpg}', { eager: true, query: '?url', import: 'default' });
  
  function getBannerImage(id: string): string | null {
    for (const path in bannerImages) {
      if (path.includes(`/${id}.`)) {
        return bannerImages[path] as string;
      }
    }
    return null;
  }

  const charIcons = import.meta.glob('./assets/icons/charbattleicon/*.{png,jpg}', { eager: true, query: '?url', import: 'default' });

  function getCharIcon(charId: string): string | null {
    if (!charId) return null;
    for (const path in charIcons) {
      if (path.includes(`/icon_${charId}.`)) {
        return charIcons[path] as string;
      }
    }
    return null;
  }

  const weaponIcons = import.meta.glob('./assets/icons/itemiconbig/*.{png,jpg}', { eager: true, query: '?url', import: 'default' });

  function getWeaponIcon(weaponId: string): string | null {
    if (!weaponId) return null;
    for (const path in weaponIcons) {
      if (path.includes(`/${weaponId}.`)) {
        return weaponIcons[path] as string;
      }
    }
    return null;
  }

  import Icon from '@iconify/svelte';
  import gachaWeaponExploreBtnIcon from './assets/icons/gachaweapon_explorebtn_icon.png';
  import gachaPoolIconHeadhuntWeapon from './assets/icons/gachapool_headhunt_weapon_icon.png';
  import type { GachaRecordItem } from './lib/api';
  import type { PityStats } from './lib/db';
  import {
    CHARACTER_GACHA_POOL_TYPES,
    DUPLICATE_GUARANTEE_LIMIT,
    GUARANTEE_LIMIT as CHARACTER_GUARANTEE_LIMIT,
    KNOWN_BANNERS,
    PITY_LIMIT,
    WEAPON_PITY_LIMIT,
    WEAPON_DUPLICATE_GUARANTEE_LIMIT,
    WEAPON_GUARANTEE_LIMIT,
    itemMatchesBanner,
    type BannerInfo
  } from './lib/banners';

  export let items: GachaRecordItem[];
  export let bannerId: string = 'all';
  export let isWeaponView: boolean = false;
  export let onExport: () => void;
  export let pityStats: PityStats | null = null;

  // Rarity filter state: default shows 5 and 6 only
  let showRarity6 = true;
  let showRarity5 = true;
  let showRarity4 = false;

  const specialBanners = KNOWN_BANNERS.filter(b => b.poolType === CHARACTER_GACHA_POOL_TYPES.SPECIAL);
  const specialWeaponBanners = KNOWN_BANNERS.filter(b => b.poolType === 'weapon' && !b.id.startsWith('weaponbox_constant'));
  const standardWeaponBanners = KNOWN_BANNERS.filter(b => b.poolType === 'weapon' && b.id.startsWith('weaponbox_constant'));
  
  let activeSpecialId = specialBanners[0]?.id || '';
  let activeWeaponSpecialId = specialWeaponBanners[0]?.id || '';
  let activeWeaponStandardId = standardWeaponBanners[0]?.id || '';

  $: currentBanner = (() => {
    if (bannerId === 'all') {
      return {
        id: 'all',
        poolType: '',
        poolName: isWeaponView ? 'All Arsenal Issues' : 'All Headhunting'
      } as BannerInfo;
    }
    if (bannerId === 'special-headhunting') {
      return KNOWN_BANNERS.find(b => b.id === activeSpecialId) || specialBanners[0];
    }
    if (bannerId === 'special-arsenal') {
      return KNOWN_BANNERS.find(b => b.id === activeWeaponSpecialId) || specialWeaponBanners[0];
    }
    if (bannerId === 'basic-arsenal') {
      return KNOWN_BANNERS.find(b => b.id === activeWeaponStandardId) || standardWeaponBanners[0];
    }
    return KNOWN_BANNERS.find(b => b.id === bannerId) || KNOWN_BANNERS[0];
  })();

  $: bannerImageUrl = getBannerImage(currentBanner.id);

  $: filteredByBanner = bannerId === 'all'
    ? items
    : items.filter(item => itemMatchesBanner(item, currentBanner));

  $: filteredItems = filteredByBanner.filter(item => {
    if (item.rarity === 6 && showRarity6) return true;
    if (item.rarity === 5 && showRarity5) return true;
    if (item.rarity <= 4 && showRarity4) return true;
    return false;
  });

  // Sort by seqId descending (newest first)
  $: sortedItems = [...filteredItems].sort((a, b) => Number(b.seqId) - Number(a.seqId));

  $: totalInView = filteredByBanner.length;
  $: sixStarCount = filteredByBanner.filter(i => i.rarity === 6).length;
  $: fiveStarCount = filteredByBanner.filter(i => i.rarity === 5).length;
  
  function isNonFreeFeatured(item: GachaRecordItem, featuredId: string | undefined): boolean {
    if (!featuredId) return false;
    if ('isFree' in item && item.isFree) return false;
    return ('charId' in item ? item.charId : item.weaponId) === featuredId;
  }

  // Guarantee uses the following formula:
  //   f(p, n) = { firstLimit - n  if p < 1,  dupLimit - (n % dupLimit)  if p >= 1 }
  // p = times the featured was obtained (non-free), n = total non-free pulls on this banner.
  $: guarantee = (() => {
    if (currentBanner.poolType !== CHARACTER_GACHA_POOL_TYPES.SPECIAL && !isWeaponView) {
      return 0;
    }
    const firstLimit = isWeaponView ? WEAPON_GUARANTEE_LIMIT : CHARACTER_GUARANTEE_LIMIT;
    const dupLimit = isWeaponView ? WEAPON_DUPLICATE_GUARANTEE_LIMIT : DUPLICATE_GUARANTEE_LIMIT;

    const n = pityStats?.guarantees[currentBanner.id] || 0;
    const p = filteredByBanner.filter(i => isNonFreeFeatured(i, currentBanner.featured)).length;

    if (p < 1) {
      return firstLimit - n;
    }
    return dupLimit - (n % dupLimit);
  })();

  // Retrieve global DB-computed tracking values
  $: specialPity = pityStats?.poolTypes[CHARACTER_GACHA_POOL_TYPES.SPECIAL]?.pity6 || 0;
  $: standardPity = pityStats?.poolTypes[CHARACTER_GACHA_POOL_TYPES.STANDARD]?.pity6 || 0;
  $: beginnerPity = pityStats?.poolTypes[CHARACTER_GACHA_POOL_TYPES.BEGINNER]?.pity6 || 0;
  $: weaponPity = isWeaponView && bannerId !== 'all' ? (pityStats?.poolTypes[currentBanner.id]?.pity6 || 0) : 0;
  function formatDate(tsMs: string) {
    const d = new Date(Number(tsMs));
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function toggleRarity(r: number) {
    if (r === 6) showRarity6 = !showRarity6;
    else if (r === 5) showRarity5 = !showRarity5;
    else showRarity4 = !showRarity4;
  }

  function rarityRowClass(rarity: number): string {
    if (rarity === 6) return 'hover:bg-[#ff7000]/2 border-l-2 border-l-[#ff7000]';
    if (rarity === 5) return 'hover:bg-[#ffba03]/2 border-l-2 border-l-[#ffba03]';
    if (rarity === 4) return 'hover:bg-[#9451f8]/2 border-l-2 border-l-[#9451f8]';
    return 'hover:bg-zinc-700/20 border-l-2 border-l-transparent';
  }

  function getPityColorClass(pity: number, isWeapon: boolean, rarity: number): string {
    if (rarity === 5) {
      if (pity > 8) return 'text-[#ff2a2a]';
      if (pity >= 5) return 'text-[#ffff00]';
      return 'text-[#39ff14]';
    }
    if (isWeapon) {
      if (pity > 32) return 'text-[#ff2a2a]';
      if (pity > 16) return 'text-[#ffff00]';
      return 'text-[#39ff14]';
    } else {
      if (pity >= 65) return 'text-[#ff2a2a]';
      if (pity > 32) return 'text-[#ffff00]';
      return 'text-[#39ff14]';
    }
  }

  function getPityBgClass(pity: number, isWeapon: boolean, rarity: number): string {
    if (rarity === 5) {
      if (pity > 8) return 'bg-[#ff2a2a]/10 border-[#ff2a2a]/20 text-[#ff2a2a]';
      if (pity >= 5) return 'bg-[#ffff00]/10 border-[#ffff00]/20 text-[#ffff00]';
      return 'bg-[#39ff14]/10 border-[#39ff14]/20 text-[#39ff14]';
    }
    if (isWeapon) {
      if (pity > 32) return 'bg-[#ff2a2a]/10 border-[#ff2a2a]/20 text-[#ff2a2a]';
      if (pity > 16) return 'bg-[#ffff00]/10 border-[#ffff00]/20 text-[#ffff00]';
      return 'bg-[#39ff14]/10 border-[#39ff14]/20 text-[#39ff14]';
    } else {
      if (pity >= 65) return 'bg-[#ff2a2a]/10 border-[#ff2a2a]/20 text-[#ff2a2a]';
      if (pity > 32) return 'bg-[#ffff00]/10 border-[#ffff00]/20 text-[#ffff00]';
      return 'bg-[#39ff14]/10 border-[#39ff14]/20 text-[#39ff14]';
    }
  }
</script>

<div class="space-y-6" style="animation: fadeInUp 0.5s ease-out forwards;">
  <!-- Special Banner Tabs -->
  {#if bannerId === 'special-headhunting'}
    <div class="flex flex-wrap items-center gap-2 p-1.5 bg-zinc-800/80 rounded-xl border border-zinc-700/50 shadow-sm backdrop-blur-xl">
      {#each specialBanners as sp}
        <button
          on:click={() => activeSpecialId = sp.id}
          class="px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 {activeSpecialId === sp.id ? 'bg-primary-500 text-zinc-950 shadow-md' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'}"
        >
          {sp.poolName}
        </button>
      {/each}
    </div>
  {:else if bannerId === 'special-arsenal'}
    <div class="flex flex-wrap items-center gap-2 p-1.5 bg-zinc-800/80 rounded-xl border border-zinc-700/50 shadow-sm backdrop-blur-xl">
      {#each specialWeaponBanners as sp}
        <button
          on:click={() => activeWeaponSpecialId = sp.id}
          class="px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 {activeWeaponSpecialId === sp.id ? 'bg-primary-500 text-zinc-950 shadow-md' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'}"
        >
          {sp.poolName}
        </button>
      {/each}
    </div>
  {:else if bannerId === 'basic-arsenal'}
    <div class="flex flex-wrap items-center gap-2 p-1.5 bg-zinc-800/80 rounded-xl border border-zinc-700/50 shadow-sm backdrop-blur-xl">
      {#each standardWeaponBanners as sp}
        <button
          on:click={() => activeWeaponStandardId = sp.id}
          class="px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 {activeWeaponStandardId === sp.id ? 'bg-primary-500 text-zinc-950 shadow-md' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'}"
        >
          {sp.poolName}
        </button>
      {/each}
    </div>
  {/if}

  <!-- Hero and Stats Container -->
  <div class="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
    <!-- Banner Hero / Title -->
    {#if bannerImageUrl}
      <div class="rounded-2xl overflow-hidden shadow-2xl border border-zinc-700/50 flex items-center justify-center bg-zinc-900/50">
        <img src={bannerImageUrl} alt={currentBanner.poolName} class="w-full h-auto object-contain block" />
      </div>
    {:else}
      <div class="flex items-center justify-between xl:col-span-2">
        <h2 class="text-2xl md:text-3xl font-extrabold text-white">{currentBanner.poolName}</h2>
      </div>
    {/if}

    <!-- Stats Row + Action Bar -->
    <div class="flex flex-col {bannerImageUrl ? 'justify-center p-5 xl:p-8' : 'xl:flex-row items-start xl:items-center justify-between p-5 xl:col-span-2'} bg-zinc-800/40 backdrop-blur-xl rounded-2xl border border-zinc-700/50 shadow-xl gap-4">
      <div class="flex {bannerImageUrl ? 'justify-center gap-x-6 md:gap-x-8 gap-y-6 flex-wrap w-full' : 'gap-6 flex-wrap w-full'}">
        <!-- Primary Stats -->
        <div class="flex flex-col items-center">
          <p class="text-zinc-500 text-xs md:text-sm font-semibold uppercase tracking-wider">Total</p>
          <p class="font-bold text-white {bannerImageUrl ? 'text-4xl md:text-5xl mt-1 md:mt-2' : 'text-3xl'}">{totalInView}</p>
        </div>
        <div class="flex flex-col items-center">
          <p class="text-zinc-500 text-xs md:text-sm font-semibold uppercase tracking-wider inline-flex items-center gap-0.5">6<Icon icon="ph:star-fill" class="relative -top-[1px]" /></p>
          <p class="font-bold text-[#ff7000] flex items-center justify-center gap-1 {bannerImageUrl ? 'text-4xl md:text-5xl mt-1 md:mt-2' : 'text-3xl'}">
            {sixStarCount} 
          </p>
        </div>
        <div class="flex flex-col items-center">
          <p class="text-zinc-500 text-xs md:text-sm font-semibold uppercase tracking-wider inline-flex items-center gap-0.5">5<Icon icon="ph:star-fill" class="relative -top-[1px]" /></p>
          <p class="font-bold text-[#ffba03] flex items-center justify-center gap-1 {bannerImageUrl ? 'text-4xl md:text-5xl mt-1 md:mt-2' : 'text-3xl'}">
            {fiveStarCount}
          </p>
        </div>
        
        <!-- Responsive Line Break: Forces new row on Desktop (side card) only -->
        {#if bannerImageUrl}
          <div class="hidden xl:block w-full h-0"></div>
        {/if}

        <!-- Pity & Guarantee Stats -->
        {#if bannerId === 'all'}
          {#if !isWeaponView}
            <div class="flex flex-col items-center">
              <p class="text-zinc-500 text-xs md:text-sm font-semibold uppercase tracking-wider">Special Pity</p>
              <p class="font-bold text-[#38bdf8] flex items-baseline justify-center gap-0.5 text-3xl">
                {specialPity}<span class="text-zinc-400">/{PITY_LIMIT}</span>
              </p>
            </div>
            <div class="flex flex-col items-center">
              <p class="text-zinc-500 text-xs md:text-sm font-semibold uppercase tracking-wider">Basic Pity</p>
              <p class="font-bold text-[#38bdf8] flex items-baseline justify-center gap-0.5 text-3xl">
                {standardPity}<span class="text-zinc-400">/{PITY_LIMIT}</span>
              </p>
            </div>
          {/if}
        {:else if currentBanner.poolType !== CHARACTER_GACHA_POOL_TYPES.BEGINNER}
          <div class="flex flex-col items-center">
            <p class="text-zinc-500 text-xs md:text-sm font-semibold uppercase tracking-wider">Pity</p>
            <p class="font-bold text-[#38bdf8] flex items-baseline justify-center gap-0.5 {bannerImageUrl ? 'text-4xl md:text-5xl mt-1 md:mt-2' : 'text-3xl'}">
              {#if currentBanner.poolType === CHARACTER_GACHA_POOL_TYPES.STANDARD}
                {standardPity}<span class="text-zinc-400">/{PITY_LIMIT}</span>
              {:else if currentBanner.poolType === CHARACTER_GACHA_POOL_TYPES.SPECIAL}
                {specialPity}<span class="text-zinc-400">/{PITY_LIMIT}</span>
              {:else if isWeaponView && bannerId !== 'all'}
                {weaponPity}<span class="text-zinc-400">/{WEAPON_PITY_LIMIT}</span>
              {/if}
            </p>
          </div>
          {#if currentBanner.poolType === CHARACTER_GACHA_POOL_TYPES.SPECIAL || (isWeaponView && bannerId !== 'all')}
            <div class="flex flex-col items-center">
              <p class="text-zinc-500 text-xs md:text-sm font-semibold uppercase tracking-wider">Guarantee</p>
              <p class="font-bold text-[#ef4444] items-baseline justify-center gap-0.5 {bannerImageUrl ? 'text-4xl md:text-5xl mt-1 md:mt-2' : 'text-3xl'}">
                {#if currentBanner.featured}
                  {guarantee}
                {:else}
                  <span class="text-zinc-400">N/A</span>
                {/if}
              </p>
            </div>
          {/if}
        {/if}
      </div>
      {#if bannerId === 'all'}
        <div class="flex items-center gap-3 w-full xl:w-auto mt-4 xl:mt-0">
          <button on:click={onExport} class="flex-1 xl:flex-none justify-center bg-primary-500 hover:bg-primary-400 text-zinc-950 px-4 py-2 rounded-xl text-sm font-bold shadow-md transition-colors flex items-center gap-2">
            Export
          </button>
        </div>
      {/if}
    </div>
  </div>

  <!-- Rarity Filter -->
  <div class="flex items-center gap-3 flex-wrap">
    <span class="text-xs font-bold text-zinc-500 uppercase tracking-wider">Filter:</span>
    <button
      on:click={() => toggleRarity(6)}
      class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 border
        {showRarity6 ? 'bg-[#ff7000]/10 text-[#ff7000] border-[#ff7000]' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}"
    >
      6★
    </button>
    <button
      on:click={() => toggleRarity(5)}
      class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 border
        {showRarity5 ? 'bg-[#ffba03]/10 text-[#ffba03] border-[#ffba03]' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}"
    >
      5★
    </button>
    <button
      on:click={() => toggleRarity(4)}
      class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 border
        {showRarity4 ? 'bg-[#9451f8]/10 text-[#9451f8] border-[#9451f8]' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}"
    >
      4★
    </button>
    <span class="text-xs text-zinc-600 ml-1">({sortedItems.length} shown)</span>
  </div>

  <!-- Pull Table -->
  <div class="bg-zinc-800/40 backdrop-blur-xl rounded-2xl border border-zinc-700/50 shadow-xl overflow-hidden">
    <!-- Desktop Table Layout -->
    <div class="hidden lg:block overflow-x-auto">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-zinc-900/60 text-zinc-400 text-xs uppercase tracking-wider border-b border-zinc-700/50">
            <th class="px-5 py-3.5 font-semibold">#</th>
            <th class="px-5 py-3.5 font-semibold">Character</th>
            <th class="px-5 py-3.5 font-semibold">Pity</th>
            <th class="px-5 py-3.5 font-semibold">Banner</th>
            <th class="px-5 py-3.5 font-semibold">Date</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-700/30">
          {#each sortedItems as item (item.seqId)}
            {@const bgImage = 'charId' in item ? getCharIcon(item.charId) : ('weaponId' in item ? getWeaponIcon(item.weaponId) : null)}
            <tr class="{rarityRowClass(item.rarity)} transition-colors">
              <td class="px-5 py-3 text-xs text-zinc-500 font-mono" title="Pull ID: {item.seqId}">{item.seqId}</td>
              <td 
                class="px-5 py-3 flex items-center gap-2.5 whitespace-nowrap {bgImage ? '!pl-0' : ''}"
                style={bgImage ? `background-image: url(${bgImage}); background-position: left center; background-repeat: no-repeat; background-size: contain;` : ''}
              >
                <span class="font-bold {item.rarity === 6 ? 'text-[#ff7000]' : item.rarity === 5 ? 'text-[#ffba03]' : 'text-[#9451f8]'} {bgImage ? 'pl-14' : ''}">
                  {'charName' in item ? item.charName : item.weaponName}
                </span>
                {#if item.isNew}
                  <span class="bg-zinc-700/80 text-zinc-300 border border-zinc-600/50 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shadow-sm">New</span>
                {/if}
                {#if 'isFree' in item && item.isFree}
                  <span class="bg-primary-500/20 text-primary-400 border border-primary-500/30 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shadow-sm" title="Free pulls do not count towards your pity limit.">Free</span>
                {/if}
              </td>
              <td class="px-5 py-3">
                {#if item.pity}
                  <span class="{getPityColorClass(item.pity, 'weaponId' in item, item.rarity)} font-bold text-sm flex items-center gap-0.5">{item.pity}</span>
                {:else}
                  <span class="text-zinc-600 text-sm flex items-center gap-0.5">-</span>
                {/if}
              </td>
              <td class="px-5 py-3 text-sm text-zinc-400">{item.poolName}</td>
              <td class="px-5 py-3 text-sm text-zinc-500 font-mono tracking-tight">{formatDate(item.gachaTs)}</td>
            </tr>
          {/each}
          {#if sortedItems.length === 0}
            <tr>
              <td colspan="5" class="px-5 py-12 text-center text-zinc-500">
                No pulls match the current filters.
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>

    <!-- Mobile Card Layout -->
    <div class="lg:hidden flex flex-col divide-y divide-zinc-700/30">
      {#each sortedItems as item (item.seqId)}
        {@const bgImage = 'charId' in item ? getCharIcon(item.charId) : ('weaponId' in item ? getWeaponIcon(item.weaponId) : null)}
        <div class="px-5 py-4 {rarityRowClass(item.rarity)} flex flex-col gap-2.5 transition-colors">
          <div class="flex items-center justify-between">
            <div 
              class="flex items-center gap-2.5 py-1 whitespace-nowrap"
              style={bgImage ? `background-image: url(${bgImage}); background-position: left center; background-repeat: no-repeat; background-size: contain;` : ''}
            >
              <span class="font-bold text-base {item.rarity === 6 ? 'text-[#ff7000]' : item.rarity === 5 ? 'text-[#ffba03]' : 'text-[#9451f8]'} {bgImage ? 'pl-9' : ''}">
                {'charName' in item ? item.charName : item.weaponName}
              </span>
              {#if item.isNew}
                <span class="bg-zinc-700/80 text-zinc-300 border border-zinc-600/50 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shadow-sm">New</span>
              {/if}
              {#if 'isFree' in item && item.isFree}
                <span class="bg-primary-500/20 text-primary-400 border border-primary-500/30 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shadow-sm">Free</span>
              {/if}
            </div>
            
            <div class="flex items-center gap-2">
              {#if item.pity}
                <span class="{getPityBgClass(item.pity, 'weaponId' in item, item.rarity)} {item.rarity === 6 ? 'font-extrabold' : 'font-bold'} text-sm flex items-center gap-1 px-2 py-0.5 rounded-md border">
                  <span class="text-[10px] uppercase tracking-wider opacity-80">Pity</span> {item.pity}
                </span>
              {/if}
            </div>
          </div>
          
          <div class="flex items-center justify-between text-xs text-zinc-400 mt-1">
            <div class="flex-1 flex flex-col gap-1">
              <div class="flex items-center gap-1.5">
                <img src={isWeaponView ? gachaPoolIconHeadhuntWeapon : gachaWeaponExploreBtnIcon} alt="" class="w-3.5 h-3.5 object-contain opacity-70 scale-150" />
                <span class="truncate pr-2">{item.poolName}</span>
              </div>
              <div class="flex items-center gap-1.5 text-zinc-500 font-mono tracking-tight">
                <Icon icon="ph:clock-fill" class="text-zinc-600" />
                <span>{formatDate(item.gachaTs)}</span>
              </div>
            </div>
            <div class="text-[10px] text-zinc-600 font-mono bg-zinc-900/50 px-2 py-1 rounded-md border border-zinc-800">
              #{item.seqId}
            </div>
          </div>
        </div>
      {/each}
      {#if sortedItems.length === 0}
        <div class="px-5 py-12 text-center text-zinc-500">
          No pulls match the current filters.
        </div>
      {/if}
    </div>
  </div>
</div>
