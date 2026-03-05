<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '@iconify/svelte';
  import he from 'he';
  import { fetchAllPulls, type EndfieldGachaItem } from './lib/api';
  import { exportEGF } from './lib/egf';
  import Sidebar from './Sidebar.svelte';
  import PullHistory from './PullHistory.svelte';

  const STORAGE_KEY = 'protorig_app_pulls';

  // Page state: 'import' | 'pulls' | 'banner:<id>'
  let currentPage = 'import';
  let sidebarOpen = false;

  let urlInput = '';
  let token = '';
  let isFetching = false;
  let errorMsg = '';
  let fetchedItems: EndfieldGachaItem[] = [];
  let fetchingStatus = '';

  $: hasData = fetchedItems.length > 0;

  onMount(() => {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        fetchedItems = JSON.parse(cached);
        if (fetchedItems.length > 0) {
          currentPage = 'pulls';
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  });

  function saveToStorage(items: EndfieldGachaItem[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function clearStorage() {
    localStorage.removeItem(STORAGE_KEY);
    fetchedItems = [];
    currentPage = 'import';
  }

  function handleNavigate(page: string) {
    currentPage = page;
  }

  function goToImport() {
    currentPage = 'import';
  }

  function handleUrlSubmit() {
    errorMsg = '';
    try {
      const url = new URL(urlInput);
      let u8Token = url.searchParams.get('u8_token');

      if (!u8Token && !urlInput.includes('http')) {
        u8Token = urlInput;
      } else if (!u8Token) {
        errorMsg = 'Could not find u8_token in the provided URL.';
        return;
      }

      token = decodeURIComponent(he.decode(u8Token as string));
      startFetching(token);
    } catch (err) {
      if (urlInput.length > 20 && !urlInput.includes(' ')) {
        token = decodeURIComponent(he.decode(urlInput));
        startFetching(token);
      } else {
        errorMsg = 'Invalid input format. Please paste the entire URL beginning with https://';
      }
    }
  }

  async function startFetching(currentToken: string) {
    isFetching = true;
    errorMsg = '';
    fetchedItems = [];
    fetchingStatus = 'Initializing secure WebAssembly proxy...';
    try {
      fetchedItems = await fetchAllPulls(currentToken, (pool, count) => {
        fetchingStatus = `Scanning ${pool} pool... Found ${count} pulls so far.`;
      });
      saveToStorage(fetchedItems);
      currentPage = 'pulls';
    } catch (err: any) {
      errorMsg = err.message || 'Failed to fetch the pulls using the provided token.';
    } finally {
      isFetching = false;
      fetchingStatus = '';
    }
  }

  function handleExport() {
    exportEGF(fetchedItems);
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
    items={fetchedItems}
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
              Paste your headhunt record URL to fetch and store your headhunt history locally.
              Data is routed securely via end-to-end TLS WebAssembly proxy.
            </p>
          </header>

          <div class="bg-zinc-800/40 backdrop-blur-xl rounded-2xl border border-zinc-700/50 p-6 md:p-8 shadow-2xl max-w-2xl">
            <div class="space-y-5">
              <div>
                <label for="url-input" class="block text-xs font-bold tracking-wide text-zinc-500 uppercase mb-2">Record URL</label>
                <textarea
                  bind:value={urlInput}
                  id="url-input"
                  rows="4"
                  class="w-full bg-zinc-900/60 border border-zinc-700 rounded-xl px-4 py-3.5 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-500/50 focus:border-zinc-500 transition-all duration-200 resize-none shadow-inner text-sm"
                  placeholder="Paste your URL here... e.g., https://ef-webview.gryphline.com/page/gacha_char?pool_id=..."
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
          </div>

          {#if hasData}
            <div class="mt-6 bg-zinc-800/80 border border-zinc-700 rounded-xl p-4 max-w-2xl flex items-center gap-3 shadow-md">
              <Icon icon="ph:check-circle-duotone" class="text-zinc-400 text-xl flex-shrink-0" />
              <p class="text-sm text-zinc-300">
                You already have <strong>{fetchedItems.length}</strong> pulls stored locally.
                Importing again will replace your existing data.
              </p>
            </div>
          {/if}
        </div>

      {:else if currentPage === 'pulls' || currentPage.startsWith('banner:')}
        <!-- Pull History View -->
        <PullHistory
          items={fetchedItems}
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
