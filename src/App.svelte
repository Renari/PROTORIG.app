<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '@iconify/svelte';
  import he from 'he';
  import { fetchAllCharacters, fetchWeaponPools, fetchAllWeapons, type EndfieldGachaCharacter, type EndfieldGachaWeapon } from './lib/api';
  import { exportEGF } from './lib/egf';
  import Sidebar from './Sidebar.svelte';
  import PullHistory from './PullHistory.svelte';

  const STORAGE_KEY = 'protorig_app_pulls';

  let currentPage = 'import';
  let sidebarOpen = false;

  let selectedFile: File | null = null;
  let token = '';
  let serverId = '';
  let lang = '';
  let isFetching = false;
  let errorMsg = '';
  let fetchedCharacters: EndfieldGachaCharacter[] = [];
  let fetchedWeapons: EndfieldGachaWeapon[] = [];
  let fetchingStatus = '';

  $: hasCharacters = fetchedCharacters && fetchedCharacters.length > 0;
  $: hasWeapons = fetchedWeapons && fetchedWeapons.length > 0;
  $: hasData = hasCharacters || hasWeapons;

  onMount(() => {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          // Legacy array-based storage: only contains characters
          fetchedCharacters = parsed;
          fetchedWeapons = [];
          if (fetchedCharacters.length > 0) saveToStorage(fetchedCharacters, fetchedWeapons);
        } else {
          // New object-based storage
          fetchedCharacters = parsed.characters || [];
          fetchedWeapons = parsed.weapons || [];
        }
        
        if (fetchedCharacters.length > 0 || fetchedWeapons.length > 0) {
          currentPage = 'all-headhunts';
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  });

  function saveToStorage(characters: EndfieldGachaCharacter[], weapons: EndfieldGachaWeapon[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ characters, weapons }));
  }

  function clearStorage() {
    localStorage.removeItem(STORAGE_KEY);
    fetchedCharacters = [];
    fetchedWeapons = [];
    currentPage = 'import';
  }

  function handleNavigate(page: string) {
    currentPage = page;
  }

  function goToImport() {
    currentPage = 'import';
  }

  function findNewestTokenUrl(input: string): string | null {
    const normalized = input
      .replaceAll('\\u0026', '&')
      .replaceAll('\\/', '/')
      .replaceAll('&amp;', '&');

    const urlRegex = /https?:\/\/[^\s"'<>\\]+/gi;
    const matches = Array.from(normalized.matchAll(urlRegex));
    const tokenUrls = matches
      .map((m) => m[0])
      .filter((url): url is string => !!url && url.includes('u8_token='));

    return tokenUrls.length > 0 ? tokenUrls[tokenUrls.length - 1] : null;
  }

  function parseImportUrl(inputUrl: string): { token: string; serverId: string; lang: string } {
    const parsedUrl = new URL(inputUrl);
    const u8Token = parsedUrl.searchParams.get('u8_token');

    if (!u8Token) {
      throw new Error('Could not find u8_token in the selected file.');
    }

    return {
      token: decodeURIComponent(he.decode(u8Token)),
      serverId: parsedUrl.searchParams.get('server') || '3',
      lang: parsedUrl.searchParams.get('lang') || 'en-us'
    };
  }

  async function handleFileSubmit() {
    errorMsg = '';

    if (!selectedFile) {
      errorMsg = 'Please select the data_1 file before importing.';
      return;
    }

    try {
      const buffer = await selectedFile.arrayBuffer();
      const decoders = [
        new TextDecoder('utf-8'),
        new TextDecoder('utf-16le'),
        new TextDecoder('latin1')
      ];

      let extractedUrl: string | null = null;
      for (const decoder of decoders) {
        extractedUrl = findNewestTokenUrl(decoder.decode(buffer));
        if (extractedUrl) break;
      }

      if (!extractedUrl) {
        throw new Error('No URL containing u8_token was found in the selected data_1 file.');
      }

      const parsed = parseImportUrl(extractedUrl);
      token = parsed.token;
      serverId = parsed.serverId;
      lang = parsed.lang;

      startFetching(token, serverId, lang);
    } catch (err: any) {
      errorMsg = err.message || 'Failed to read the selected file.';
    }
  }

  function handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    selectedFile = input.files?.[0] || null;
    errorMsg = '';
  }

  function startFetching(currentToken: string, serverId: string, lang: string) {
    isFetching = true;
    errorMsg = '';
    fetchedCharacters = [];
    fetchedWeapons = [];
    fetchingStatus = 'Initializing secure WebAssembly proxy...';

    fetchAllCharacters(currentToken, serverId, lang, (pool, count) => {
      fetchingStatus = `Scanning character pool ${pool}... Found ${count} pulls.`;
    })
    .then((chars) => {
      fetchedCharacters = chars;
      return fetchWeaponPools(currentToken, serverId, lang);
    })
    .then((pools) => {
      return fetchAllWeapons(currentToken, serverId, lang, pools, (poolName: string, count: number) => {
        fetchingStatus = `Scanning weapon pool ${poolName}... Found ${count} pulls.`;
      });
    })
    .then((weaps) => {
      fetchedWeapons = weaps;
      saveToStorage(fetchedCharacters, fetchedWeapons);
      currentPage = 'all-headhunts';
    })
    .catch((err: any) => {
      errorMsg = err.message || 'Failed to fetch the pulls using the provided token.';
    })
    .finally(() => {
      isFetching = false;
      fetchingStatus = '';
    });
  }

  function handleExport() {
    exportEGF(fetchedCharacters, fetchedWeapons);
  }

  // Extract banner ID from page string like 'banner:hues-of-passion'
  $: activeBannerId = currentPage.startsWith('banner:')
    ? currentPage.replace('banner:', '')
    : 'all';
</script>

<div class="flex h-screen overflow-hidden bg-zinc-950 text-zinc-200">
  <!-- Mobile overlay -->
  {#if sidebarOpen}
    <div 
      class="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden transition-opacity"
      on:click={() => sidebarOpen = false}
      on:keydown={(e) => e.key === 'Escape' && (sidebarOpen = false)}
      role="button"
      tabindex="0"
    ></div>
  {/if}

  <Sidebar
    {currentPage}
    characters={fetchedCharacters}
    weapons={fetchedWeapons}
    onNavigate={handleNavigate}
    isOpen={sidebarOpen}
    onClose={() => sidebarOpen = false}
  />

  <main class="flex-1 flex flex-col h-screen overflow-hidden relative">
    <!-- Mobile Header -->
    <header class="md:hidden flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-md z-30">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0 shadow-lg shadow-black/20 overflow-hidden">
          <img src="/protorig.png" alt="Protorig Logo" class="w-full h-full object-cover" />
        </div>
        <h1 class="text-sm font-extrabold text-white tracking-tight leading-none">PROTORIG.app</h1>
      </div>
      <button 
        class="p-2 -mr-2 text-zinc-400 hover:text-white transition-colors"
        on:click={() => sidebarOpen = true}
      >
        <Icon icon="ph:list-bold" class="text-2xl" />
      </button>
    </header>

    <div class="flex-1 overflow-y-auto">
      <div class="p-6 md:p-8 lg:p-10 max-w-6xl mx-auto relative z-10 w-full">
      {#if currentPage === 'import'}
        <!-- Import Page -->
        <div style="animation: fadeInUp 0.5s ease-out forwards;">
          <header class="mb-10">
            <h1 class="text-3xl md:text-4xl font-extrabold tracking-tight text-white mb-3">
              Import <span class="text-zinc-300">Headhunt History</span>
            </h1>
            <p class="text-zinc-400 text-sm md:text-base font-medium max-w-xl leading-relaxed">
              Select the binary <strong>data_1</strong> file to extract your u8_token URL and fetch your headhunt history locally.
              Data is routed securely via end-to-end TLS WebAssembly proxy.
            </p>
            <p class="mt-3 text-zinc-500 text-xs md:text-sm font-medium">
              File location: AppData/Local/PlatformProcess/Cache/data_1
            </p>
          </header>

          <div class="bg-zinc-800/40 backdrop-blur-xl rounded-2xl border border-zinc-700/50 p-6 md:p-8 shadow-2xl max-w-2xl">
            <div class="space-y-5">
              <div>
                <label
                  for="data-file-input"
                  class="flex flex-col items-center justify-center gap-3 w-full bg-zinc-900/60 border-2 border-dashed border-zinc-700 rounded-xl px-4 py-8 cursor-pointer hover:border-zinc-500 hover:bg-zinc-900/80 transition-all duration-200"
                >
                  {#if selectedFile}
                    <Icon icon="ph:file-duotone" class="text-3xl text-primary-500" />
                    <span class="text-sm text-zinc-300 font-medium">{selectedFile.name}</span>
                  {:else}
                    <Icon icon="ph:upload-simple-bold" class="text-3xl text-zinc-500" />
                    <span class="text-sm text-zinc-400">Click to select <strong>data_1</strong></span>
                  {/if}
                </label>
                <input
                  id="data-file-input"
                  type="file"
                  on:change={handleFileChange}
                  class="hidden"
                />
              </div>

              {#if errorMsg}
                <div class="bg-red-500/10 border border-red-500/20 text-red-300 px-4 py-3 rounded-xl flex items-center gap-3 animate-shake">
                  <Icon icon="ph:warning-circle-duotone" class="text-xl text-red-400 flex-shrink-0" />
                  <p class="text-sm font-medium">{errorMsg}</p>
                </div>
              {/if}

              <button
                on:click={handleFileSubmit}
                disabled={isFetching || !selectedFile}
                class="w-full relative overflow-hidden bg-primary-600 hover:bg-primary-500 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-zinc-950 font-bold py-3.5 px-6 rounded-xl transition-all duration-300 active:scale-[0.98] shadow-lg shadow-black/20 disabled:shadow-none flex flex-col items-center justify-center gap-1.5 border border-primary-500/50 disabled:border-transparent"
              >
                {#if isFetching}
                  <div class="flex items-center gap-3">
                    <span class="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                    <span>Fetching Data...</span>
                  </div>
                  <span class="text-xs text-zinc-400 font-medium">{fetchingStatus}</span>
                {:else}
                  <div class="flex items-center gap-2.5">
                    <Icon icon="ph:download-simple-bold" class="text-xl" />
                    <span>Import Data</span>
                  </div>
                {/if}
              </button>
            </div>
          </div>

          {#if hasData}
            <div class="mt-6 bg-zinc-800/80 border border-zinc-700 rounded-xl p-4 max-w-2xl flex items-center gap-3 shadow-md">
              <Icon icon="ph:check-circle-duotone" class="text-zinc-400 text-xl flex-shrink-0" />
              <p class="text-sm text-zinc-300">
                You already have <strong>{fetchedCharacters.length + fetchedWeapons.length}</strong> pulls stored locally.
                Importing again will replace your existing data.
              </p>
            </div>
          {/if}
        </div>

      {:else if currentPage === 'all-headhunts' || currentPage.startsWith('banner:') || currentPage === 'all-arsenal-issues' || currentPage.startsWith('weapon-banner:')}
        <!-- Pull History View -->
        <PullHistory
          items={currentPage.startsWith('weapon-banner:') || currentPage === 'all-arsenal-issues' ? fetchedWeapons : fetchedCharacters}
          isWeaponView={currentPage.startsWith('weapon-banner:') || currentPage === 'all-arsenal-issues'}
          bannerId={activeBannerId}
          onExport={handleExport}
        />
      {/if}
      </div>
    </div>
  </main>
</div>

<style>
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(16px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-4px); }
    75% { transform: translateX(4px); }
  }

  .animate-shake {
    animation: shake 0.4s ease-in-out;
  }
</style>
