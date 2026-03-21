<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '@iconify/svelte';
  // @ts-ignore
  import he from 'he';
  import { fetchAllCharacters, fetchWeaponPools, fetchAllWeapons, type EndfieldGachaCharacter, type EndfieldGachaWeapon } from './lib/api';
  import { exportEGF } from './lib/egf';
  import { initDb, getAllCharacters, getAllWeapons, insertCharacters, insertWeapons, insertWeaponPools, clearAllData, recalculateAllPity, getPityStats, type PityStats } from './lib/db';
  import { migrateFromLocalStorage } from './lib/db-migration';
  import Sidebar from './Sidebar.svelte';
  import PullHistory from './PullHistory.svelte';

  const LINUX_SH = 'https://raw.githubusercontent.com/Renari/PROTORIG.app/76138d03b71ad231036f3f85b8aad9416d4e7d35/scripts/linux.sh'
  const WINDOWS_PS1 = 'https://raw.githubusercontent.com/Renari/PROTORIG.app/92aef8a6629b9be60e0f80292f19c6a67d515185/scripts/windows.ps1'

  let currentPage = 'import';
  let sidebarOpen = false;

  let selectedFile: File | null = null;
  let urlInput = '';
  let importTab: 'windows' | 'linux' | 'windows-manual' | 'manual' | 'macos' = 'windows';
  let token = '';
  let serverId = '';
  let lang = '';
  let isFetching = false;
  let errorMsg = '';
  let fetchedCharacters: EndfieldGachaCharacter[] = [];
  let fetchedWeapons: EndfieldGachaWeapon[] = [];
  let pityStats: PityStats | null = null;
  let fetchingStatus = '';

  const importTabs = [
    { id: 'windows' as const, label: 'Windows', icon: 'ph:windows-logo-bold' },
    { id: 'linux' as const, label: 'Linux', icon: 'ph:linux-logo-bold' },
    { id: 'windows-manual' as const, label: 'Windows (Manual)', icon: 'ph:hand-bold' },
    { id: 'manual' as const, label: 'Manual', icon: 'ph:file-bold' },
    { id: 'macos' as const, label: 'macOS', icon: 'ph:apple-logo-bold' },
  ];

  $: hasCharacters = fetchedCharacters && fetchedCharacters.length > 0;
  $: hasWeapons = fetchedWeapons && fetchedWeapons.length > 0;
  $: hasData = hasCharacters || hasWeapons;

  onMount(async () => {
    try {
      await initDb();
      await migrateFromLocalStorage();
      fetchedCharacters = await getAllCharacters();
      fetchedWeapons = await getAllWeapons();
      pityStats = await getPityStats();
      if (fetchedCharacters.length > 0 || fetchedWeapons.length > 0) {
        currentPage = 'all-headhunts';
      }
    } catch (err) {
      console.error('Failed to initialize database:', err);
    }
  });

  async function clearStorage() {
    await clearAllData();
    fetchedCharacters = [];
    fetchedWeapons = [];
    pityStats = await getPityStats();
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

  function handleUrlSubmit() {
    errorMsg = '';
    const input = urlInput.trim();

    if (!input) {
      errorMsg = 'Please paste the URL before importing.';
      return;
    }

    try {
      const parsed = parseImportUrl(input);
      token = parsed.token;
      serverId = parsed.serverId;
      lang = parsed.lang;
      startFetching(token, serverId, lang);
    } catch (err: any) {
      errorMsg = err.message || 'Invalid URL. Make sure it contains u8_token.';
    }
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

    let weaponPools: Awaited<ReturnType<typeof fetchWeaponPools>> = [];

    fetchAllCharacters(currentToken, serverId, lang, (pool, count) => {
      fetchingStatus = `Scanning character pool ${pool}... Found ${count} pulls.`;
    })
    .then((chars) => {
      fetchedCharacters = chars;
      return fetchWeaponPools(currentToken, serverId, lang);
    })
    .then((pools) => {
      weaponPools = pools;
      return fetchAllWeapons(currentToken, serverId, lang, pools, (poolName: string, count: number) => {
        fetchingStatus = `Scanning weapon pool ${poolName}... Found ${count} pulls.`;
      });
    })
    .then(async (weaps) => {
      fetchedWeapons = weaps;
      await insertCharacters(fetchedCharacters);
      await insertWeaponPools(weaponPools);
      await insertWeapons(fetchedWeapons);
      fetchingStatus = 'Recalculating global pity records...';
      await recalculateAllPity();
      pityStats = await getPityStats();
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
          <header class="mb-8">
            <h1 class="text-3xl md:text-4xl font-extrabold tracking-tight text-white mb-3">
              Import <span class="text-zinc-300">Headhunt History</span>
            </h1>
            <p class="text-zinc-400 text-sm md:text-base font-medium max-w-xl leading-relaxed">
              Follow the instructions for your platform to extract and import your headhunt data.
              Data is routed securely via end-to-end TLS WebAssembly proxy.
            </p>
          </header>

          <!-- Platform Tabs -->
          <div class="flex flex-wrap gap-1.5 mb-6 max-w-2xl">
            {#each importTabs as tab}
              <button
                on:click={() => { importTab = tab.id; errorMsg = ''; }}
                class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold tracking-wide transition-all duration-200
                  {importTab === tab.id
                    ? 'bg-primary-600 text-zinc-950 shadow-md'
                    : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}"
              >
                <Icon icon={tab.icon} class="text-sm" />
                {tab.label}
              </button>
            {/each}
          </div>

          <div class="bg-zinc-800/40 backdrop-blur-xl rounded-2xl border border-zinc-700/50 p-6 md:p-8 shadow-2xl max-w-2xl">
            {#if importTab === 'windows'}
              <!-- Windows: PowerShell script -->
              <div class="space-y-5">
                <div class="space-y-3">
                  <h3 class="text-sm font-bold text-white">Instructions</h3>
                  <ol class="list-decimal list-inside text-sm text-zinc-400 space-y-2 leading-relaxed">
                    <li>Open <strong class="text-zinc-200">PowerShell</strong></li>
                    <li>Paste the following command and press Enter:</li>
                  </ol>
                  <div class="relative group">
                    <pre class="bg-zinc-900/80 border border-zinc-700 rounded-xl px-4 py-3 text-xs text-zinc-300 overflow-x-auto font-mono select-all">irm {WINDOWS_PS1} | iex</pre>
                  </div>
                  <div class="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
                    <Icon icon="ph:warning-duotone" class="text-lg text-amber-400 flex-shrink-0 mt-0.5" />
                    <p class="text-xs text-amber-300/90 leading-relaxed">Running scripts from the internet can be dangerous. You should <a href="{WINDOWS_PS1}" target="_blank" rel="noopener noreferrer" class="underline text-amber-200 hover:text-white">review the script</a> or have someone you trust review it before running.</p>
                  </div>
                  <ol start="3" class="list-decimal list-inside text-sm text-zinc-400 space-y-2 leading-relaxed">
                    <li>The URL will be extracted and copied to your clipboard</li>
                    <li>Paste the URL below</li>
                  </ol>
                </div>

                <div>
                  <label for="url-input-win" class="block text-xs font-bold tracking-wide text-zinc-500 uppercase mb-2">Record URL</label>
                  <textarea
                    bind:value={urlInput}
                    id="url-input-win"
                    rows="3"
                    class="w-full bg-zinc-900/60 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:border-zinc-500 transition-all duration-200 resize-none shadow-inner text-sm"
                    placeholder="Paste the URL from PowerShell here..."
                  ></textarea>
                </div>

                {#if errorMsg}
                  <div class="bg-red-500/10 border border-red-500/20 text-red-300 px-4 py-3 rounded-xl flex items-center gap-3 animate-shake">
                    <Icon icon="ph:warning-circle-duotone" class="text-xl text-red-400 flex-shrink-0" />
                    <p class="text-sm font-medium">{errorMsg}</p>
                  </div>
                {/if}

                <button
                  on:click={handleUrlSubmit}
                  disabled={isFetching || !urlInput}
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

            {:else if importTab === 'windows-manual'}
              <!-- Windows (Manual): drag-and-drop data_1 -->
              <div class="space-y-5">
                <div class="space-y-3">
                  <h3 class="text-sm font-bold text-white">Instructions</h3>
                  <ol class="list-decimal list-inside text-sm text-zinc-400 space-y-2 leading-relaxed">
                    <li>Press <kbd class="px-1.5 py-0.5 bg-zinc-700 rounded text-zinc-200 text-xs font-mono">Win</kbd> + <kbd class="px-1.5 py-0.5 bg-zinc-700 rounded text-zinc-200 text-xs font-mono">R</kbd> to open the Run dialog</li>
                    <li>Type in: <code class="px-1.5 py-0.5 bg-zinc-700 rounded text-zinc-200 text-xs font-mono">%LocalAppData%\PlatformProcess\Cache</code></li>
                    <li>Drag and drop the <strong class="text-zinc-200">data_1</strong> file into the box below</li>
                  </ol>
                </div>

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
                      <span class="text-sm text-zinc-400">Click or drag <strong>data_1</strong> here</span>
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

            {:else if importTab === 'linux'}
              <!-- Linux: bash script -->
              <div class="space-y-5">
                <div class="space-y-3">
                  <h3 class="text-sm font-bold text-white">Instructions</h3>
                  <ol class="list-decimal list-inside text-sm text-zinc-400 space-y-2 leading-relaxed">
                    <li>Open a <strong class="text-zinc-200">terminal</strong></li>
                    <li>Run the following command:</li>
                  </ol>
                  <div class="relative group">
                    <pre class="bg-zinc-900/80 border border-zinc-700 rounded-xl px-4 py-3 text-xs text-zinc-300 overflow-x-auto font-mono select-all">curl -s {LINUX_SH} | bash</pre>
                  </div>
                  <div class="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
                    <Icon icon="ph:warning-duotone" class="text-lg text-amber-400 flex-shrink-0 mt-0.5" />
                    <p class="text-xs text-amber-300/90 leading-relaxed">Running scripts from the internet can be dangerous. You should <a href="{LINUX_SH}" target="_blank" rel="noopener noreferrer" class="underline text-amber-200 hover:text-white">review the script</a> or have someone you trust review it before running.</p>
                  </div>
                  <ol start="3" class="list-decimal list-inside text-sm text-zinc-400 space-y-2 leading-relaxed">
                    <li>The script will search common Wine/Proton prefix locations for the <strong class="text-zinc-200">data_1</strong> file</li>
                    <li>The URL will be extracted and copied to your clipboard</li>
                    <li>Paste the URL below</li>
                  </ol>
                </div>

                <div>
                  <label for="url-input-linux" class="block text-xs font-bold tracking-wide text-zinc-500 uppercase mb-2">Record URL</label>
                  <textarea
                    bind:value={urlInput}
                    id="url-input-linux"
                    rows="3"
                    class="w-full bg-zinc-900/60 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:border-zinc-500 transition-all duration-200 resize-none shadow-inner text-sm"
                    placeholder="Paste the URL from your terminal here..."
                  ></textarea>
                </div>

                {#if errorMsg}
                  <div class="bg-red-500/10 border border-red-500/20 text-red-300 px-4 py-3 rounded-xl flex items-center gap-3 animate-shake">
                    <Icon icon="ph:warning-circle-duotone" class="text-xl text-red-400 flex-shrink-0" />
                    <p class="text-sm font-medium">{errorMsg}</p>
                  </div>
                {/if}

                <button
                  on:click={handleUrlSubmit}
                  disabled={isFetching || !urlInput}
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

            {:else if importTab === 'manual'}
              <!-- Manual: just file upload -->
              <div class="space-y-5">
                <div class="space-y-3">
                  <h3 class="text-sm font-bold text-white">Instructions</h3>
                  <p class="text-sm text-zinc-400 leading-relaxed">
                    Locate the <strong class="text-zinc-200">data_1</strong> file on your system and upload it below.
                    This file is typically found in the game's cache directory under
                    <code class="px-1.5 py-0.5 bg-zinc-700 rounded text-zinc-200 text-xs font-mono">PlatformProcess/Cache/data_1</code>.
                  </p>
                </div>

                <div>
                  <label
                    for="data-file-input-manual"
                    class="flex flex-col items-center justify-center gap-3 w-full bg-zinc-900/60 border-2 border-dashed border-zinc-700 rounded-xl px-4 py-8 cursor-pointer hover:border-zinc-500 hover:bg-zinc-900/80 transition-all duration-200"
                  >
                    {#if selectedFile}
                      <Icon icon="ph:file-duotone" class="text-3xl text-primary-500" />
                      <span class="text-sm text-zinc-300 font-medium">{selectedFile.name}</span>
                    {:else}
                      <Icon icon="ph:upload-simple-bold" class="text-3xl text-zinc-500" />
                      <span class="text-sm text-zinc-400">Click or drag <strong>data_1</strong> here</span>
                    {/if}
                  </label>
                  <input
                    id="data-file-input-manual"
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

            {:else if importTab === 'macos'}
              <!-- macOS: not yet supported -->
              <div class="flex flex-col items-center justify-center py-10 text-center space-y-4">
                <Icon icon="ph:apple-logo-bold" class="text-5xl text-zinc-600" />
                <h3 class="text-lg font-bold text-white">macOS Support</h3>
                <p class="text-sm text-zinc-400 max-w-md leading-relaxed">
                  macOS is not currently supported as I don't have a way to test an implementation.
                  If you're a macOS user and would like to help add support, please reach out!
                </p>
              </div>
            {/if}
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
          pityStats={pityStats}
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
