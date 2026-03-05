<script lang="ts">
  import Icon from '@iconify/svelte';
  import type { EndfieldGachaItem } from './lib/api';
  import { KNOWN_BANNERS, itemMatchesBanner, type BannerInfo } from './lib/banners';

  export let items: EndfieldGachaItem[];
  export let bannerId: string = 'all';
  export let onExport: () => void;

  // Rarity filter state: default shows 5 and 6 only
  let showRarity6 = true;
  let showRarity5 = true;
  let showRarity4 = false;

  const specialBanners = KNOWN_BANNERS.filter(b => b.poolType === 'E_CharacterGachaPoolType_Special' && b.id !== 'special-headhunting');
  let activeSpecialId = specialBanners[0]?.id || '';

  $: currentBanner = bannerId === 'special-headhunting'
    ? (KNOWN_BANNERS.find(b => b.id === activeSpecialId) || KNOWN_BANNERS[0])
    : bannerId === 'all'
      ? { id: 'all', poolType: '', label: 'All Headhunting', image: null } as BannerInfo
      : (KNOWN_BANNERS.find(b => b.id === bannerId) || KNOWN_BANNERS[0]);

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
          {sp.label}
        </button>
      {/each}
    </div>
  {/if}

  <!-- Banner Hero (if viewing specific banner with image) -->
  {#if currentBanner.image}
    <div class="rounded-2xl overflow-hidden shadow-2xl border border-zinc-700/50">
      <img src={currentBanner.image} alt={currentBanner.label} class="w-full h-auto block" />
    </div>
  {:else}
    <div class="flex items-center justify-between">
      <h2 class="text-2xl md:text-3xl font-extrabold text-white">{currentBanner.label}</h2>
    </div>
  {/if}

  <!-- Stats Row + Action Bar -->
  <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-zinc-800/40 backdrop-blur-xl rounded-2xl border border-zinc-700/50 p-5 shadow-xl">
    <div class="flex gap-6 flex-wrap">
      <div>
        <p class="text-zinc-500 text-xs font-semibold uppercase tracking-wider">Total</p>
        <p class="text-2xl font-bold text-white">{totalInView}</p>
      </div>
      <div>
        <p class="text-zinc-500 text-xs font-semibold uppercase tracking-wider">6-Star</p>
        <p class="text-2xl font-bold text-[#ff7000] flex items-center gap-1">
          {sixStarCount} <Icon icon="ph:star-fill" class="text-sm" />
        </p>
      </div>
      <div>
        <p class="text-zinc-500 text-xs font-semibold uppercase tracking-wider">5-Star</p>
        <p class="text-2xl font-bold text-[#ffba03] flex items-center gap-1">
          {fiveStarCount} <Icon icon="ph:star-fill" class="text-sm" />
        </p>
      </div>
    </div>
    {#if bannerId === 'all'}
      <div class="flex items-center gap-3 w-full lg:w-auto mt-4 lg:mt-0">
        <button on:click={onExport} class="flex-1 lg:flex-none justify-center bg-primary-500 hover:bg-primary-400 text-zinc-950 px-4 py-2 rounded-xl text-sm font-bold shadow-md transition-colors flex items-center gap-2">
          Export
        </button>
      </div>
    {/if}
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
            <th class="px-5 py-3.5 font-semibold">Rarity</th>
            <th class="px-5 py-3.5 font-semibold">Banner</th>
            <th class="px-5 py-3.5 font-semibold">Date</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-700/30">
          {#each sortedItems as item (item.seqId)}
            <tr class="{rarityRowClass(item.rarity)} transition-colors">
              <td class="px-5 py-3 text-xs text-zinc-500 font-mono" title="Pull ID: {item.seqId}">{item.seqId}</td>
              <td class="px-5 py-3 flex items-center gap-2.5">
                <span class="font-bold text-zinc-100">{item.charName}</span>
                {#if item.isNew}
                  <span class="bg-zinc-700/80 text-zinc-300 border border-zinc-600/50 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shadow-sm">New</span>
                {/if}
                {#if item.isFree}
                  <span class="bg-primary-500/20 text-primary-400 border border-primary-500/30 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shadow-sm" title="Free pulls do not count towards your pity limit.">Free</span>
                {/if}
              </td>
              <td class="px-5 py-3">
                {#if item.rarity === 6}
                  <span class="text-[#ff7000] font-bold text-sm flex items-center gap-0.5">{item.rarity}<Icon icon="ph:star-fill" class="text-xs ml-0.5" /></span>
                {:else if item.rarity === 5}
                  <span class="text-[#ffba03] font-bold text-sm flex items-center gap-0.5">{item.rarity}<Icon icon="ph:star-fill" class="text-xs ml-0.5" /></span>
                {:else if item.rarity === 4}
                  <span class="text-[#9451f8] font-bold text-sm flex items-center gap-0.5">{item.rarity}<Icon icon="ph:star-fill" class="text-xs ml-0.5" /></span>
                {:else}
                  <span class="text-zinc-500 text-sm flex items-center gap-0.5">{item.rarity}<Icon icon="ph:star-fill" class="text-xs ml-0.5" /></span>
                {/if}
              </td>
              <td class="px-5 py-3 text-sm text-zinc-400">{item.poolName || item.poolId}</td>
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
        <div class="px-5 py-4 {rarityRowClass(item.rarity)} flex flex-col gap-2.5 transition-colors">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <span class="font-bold text-base text-zinc-100">{item.charName}</span>
              {#if item.isNew}
                <span class="bg-zinc-700/80 text-zinc-300 border border-zinc-600/50 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shadow-sm">New</span>
              {/if}
              {#if item.isFree}
                <span class="bg-primary-500/20 text-primary-400 border border-primary-500/30 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shadow-sm">Free</span>
              {/if}
            </div>
            
            <div class="flex items-center gap-2">
              {#if item.rarity === 6}
                <span class="text-[#ff7000] font-extrabold text-sm flex items-center gap-0.5 bg-[#ff7000]/10 px-2 py-0.5 rounded-md border border-[#ff7000]/20">{item.rarity}<Icon icon="ph:star-fill" class="text-xs ml-0.5" /></span>
              {:else if item.rarity === 5}
                <span class="text-[#ffba03] font-bold text-sm flex items-center gap-0.5 bg-[#ffba03]/10 px-2 py-0.5 rounded-md border border-[#ffba03]/20">{item.rarity}<Icon icon="ph:star-fill" class="text-xs ml-0.5" /></span>
              {:else if item.rarity === 4}
                <span class="text-[#9451f8] font-bold text-sm flex items-center gap-0.5 bg-[#9451f8]/10 px-2 py-0.5 rounded-md border border-[#9451f8]/20">{item.rarity}<Icon icon="ph:star-fill" class="text-xs ml-0.5" /></span>
              {:else}
                <span class="text-zinc-500 text-sm flex items-center gap-0.5 bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-700">{item.rarity}<Icon icon="ph:star-fill" class="text-xs ml-0.5" /></span>
              {/if}
            </div>
          </div>
          
          <div class="flex items-center justify-between text-xs text-zinc-400 mt-1">
            <div class="flex-1 flex flex-col gap-1">
              <div class="flex items-center gap-1.5">
                <Icon icon="ph:flag-banner-fill" class="text-zinc-500" />
                <span class="truncate pr-2">{item.poolName || item.poolId}</span>
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
