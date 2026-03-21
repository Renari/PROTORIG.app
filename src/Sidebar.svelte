<script lang="ts">
  import { onMount } from 'svelte';
  import githubLogo from './assets/GitHub_Lockup_White.png';
  import Icon from '@iconify/svelte';
  import type { EndfieldGachaCharacter, EndfieldGachaWeapon } from './lib/api';
  import gachaWeaponExploreBtnIcon from './assets/icons/gachaweapon_explorebtn_icon.png';
  import gachaPoolHeadhuntWeaponIcon from './assets/icons/gachapool_headhunt_weapon_icon.png';
  import btnRaffle2 from './assets/icons/btn_raffle_2.png';

  export let characters: EndfieldGachaCharacter[];
  export let weapons: EndfieldGachaWeapon[];
  export let currentPage: string;
  export let onNavigate: (page: string) => void;
  export let isOpen: boolean = false;
  export let onClose: () => void = () => {};
  
  $: hasCharacters = characters && characters.length > 0;
  $: hasWeapons = weapons && weapons.length > 0;

  let kofiHtml = '';

  onMount(() => {
    const existingScript = document.getElementById('kofi-script');
    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'kofi-script';
      script.src = 'https://storage.ko-fi.com/cdn/widget/Widget_2.js';
      script.async = true;
      script.onload = () => {
        // @ts-ignore
        if (window.kofiwidget2) {
          // @ts-ignore
          window.kofiwidget2.init('Support me on Ko-fi', '#EAB308', 'O5O01VED64');
          // @ts-ignore
          kofiHtml = window.kofiwidget2.getHTML() + '<style>span.kofitext, span.kofitext a { color: #09090b !important; text-shadow: none !important; font-weight: 800 !important; }</style>';
        }
      };
      document.head.appendChild(script);
    } else {
      // @ts-ignore
      if (window.kofiwidget2) {
        // @ts-ignore
        window.kofiwidget2.init('Support me on Ko-fi', '#EAB308', 'O5O01VED64');
        // @ts-ignore
        kofiHtml = window.kofiwidget2.getHTML() + '<style>span.kofitext, span.kofitext a { color: #09090b !important; text-shadow: none !important; font-weight: 800 !important; }</style>';
      }
    }
  });

  function handleNav(page: string) {
    onNavigate(page);
    onClose();
  }

  interface NavItem {
    id: string;
    label: string;
    icon: string;
    requiresData?: boolean;
    requiresCharacters?: boolean;
    requiresWeapons?: boolean;
  }

  const mainNav: NavItem[] = [
    { id: 'import', label: 'Import', icon: 'ph:download-simple-bold' },
    { id: 'all-headhunts', label: 'All Headhunting', icon: 'ph:list-bullets-bold', requiresCharacters: true },
    { id: 'all-arsenal-issues', label: 'All Arsenal Issues', icon: 'ph:sword-bold', requiresWeapons: true },
  ];

  function isNavActive(page: string, itemId: string): boolean {
    return page === itemId;
  }
  
  const bannerCategories = [
    { id: 'special-headhunting', label: 'Special Headhunting' },
    { id: 'standard', label: 'Basic Headhunting' },
    { id: 'beginner', label: 'New Horizons' }
  ];

  const weaponCategories = [
    { id: 'special-arsenal', label: 'Special Arsenal' },
    { id: 'standard-arsenal', label: 'Standard Arsenal' }
  ];
</script>

<aside
  class="sidebar fixed inset-y-0 left-0 z-50 flex flex-col h-screen bg-zinc-900/95 backdrop-blur-xl border-r border-zinc-700/50 flex-shrink-0 w-full md:w-64 md:relative md:bg-zinc-900/80 transition-transform duration-300 {isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0"
>
  <!-- Logo / Branding -->
  <div class="flex items-center justify-between px-5 py-5 border-b border-zinc-700/50">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 flex items-center justify-center flex-shrink-0 overflow-hidden">
        <img src="/protorig.png" alt="Protorig Logo" class="w-full h-full object-cover" />
      </div>
      <div>
        <h1 class="text-base font-extrabold text-white tracking-tight leading-none">PROTORIG.app</h1>
      </div>
    </div>
    <button class="md:hidden text-zinc-400 hover:text-white p-2 -mr-2" on:click={onClose}>
      <Icon icon="ph:x-bold" class="text-xl" />
    </button>
  </div>

  <!-- Main Navigation -->
  <nav class="flex-1 overflow-y-auto py-4 px-3 space-y-1">
    <p class="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-3 mb-2">Navigation</p>
    {#each mainNav as item}
      {@const active = isNavActive(currentPage, item.id)}
      {@const disabled = (item.requiresCharacters && !hasCharacters) || (item.requiresWeapons && !hasWeapons)}
      <button
        on:click={() => handleNav(item.id)}
        {disabled}
        class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 group
          {active ? 'bg-zinc-800 text-white border border-zinc-700/50 shadow-sm relative overflow-hidden' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border border-transparent'}
          {disabled ? 'opacity-30 cursor-not-allowed' : ''}"
      >
        {#if active}
          <div class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-primary-500 rounded-r-md"></div>
        {/if}
        <Icon icon={item.icon} class="text-lg flex-shrink-0 {active ? 'text-[#f7e704]' : ''}" />
        <span>{item.label}</span>
      </button>
    {/each}

    <div class="pt-4">
      <p class="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-3 mb-2">Headhunt</p>
      {#each bannerCategories as cat (cat.id)}
        {@const bannerActive = currentPage === `banner:${cat.id}`}
        <button
          on:click={() => handleNav(`banner:${cat.id}`)}
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group border relative overflow-hidden
            {bannerActive ? 'bg-zinc-800 text-white border-zinc-700/50 shadow-sm' : 'text-zinc-400 border-transparent hover:bg-zinc-800/50 hover:text-zinc-200'}"
        >
          {#if bannerActive}
            <div class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-primary-500 rounded-r-md"></div>
          {/if}
          <img src={bannerActive ? btnRaffle2 : gachaWeaponExploreBtnIcon} alt="" class="h-[18px] w-[18px] object-contain flex-shrink-0 {bannerActive ? 'scale-175' : 'scale-150 opacity-70 group-hover:opacity-100'}" />
          <span class="truncate">{cat.label}</span>
        </button>
      {/each}
    </div>

    <div class="pt-4">
      <p class="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-3 mb-2">Arsenal Exchange</p>
      {#each weaponCategories as cat (cat.id)}
        {@const bannerActive = currentPage === `banner:${cat.id}`}
        <button
          on:click={() => handleNav(`banner:${cat.id}`)}
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group border relative overflow-hidden
            {bannerActive ? 'bg-zinc-800 text-white border-zinc-700/50 shadow-sm' : 'text-zinc-400 border-transparent hover:bg-zinc-800/50 hover:text-zinc-200'}"
        >
          {#if bannerActive}
            <div class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-primary-500 rounded-r-md"></div>
          {/if}
          <img src={gachaPoolHeadhuntWeaponIcon} alt="" 
            class="h-[18px] w-[18px] object-contain flex-shrink-0 scale-120 mt-1 {bannerActive ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}" 
            style={bannerActive ? 'filter: brightness(0) saturate(100%) invert(84%) sepia(87%) saturate(1048%) hue-rotate(359deg) brightness(101%) contrast(106%);' : ''}
          />
          <span class="truncate">{cat.label}</span>
        </button>
      {/each}
    </div>
  </nav>

  <!-- Bottom actions -->
  <div class="p-4 border-t border-zinc-700/50 flex flex-col justify-center items-center gap-4">
    <a href="https://github.com/Renari/PROTORIG.app" target="_blank" rel="noopener noreferrer" class="opacity-70 hover:opacity-100 transition-opacity">
      <img src={githubLogo} alt="GitHub Repository" class="h-8 w-auto" />
    </a>
    {#if kofiHtml}
      {@html kofiHtml}
    {/if}
  </div>
</aside>
