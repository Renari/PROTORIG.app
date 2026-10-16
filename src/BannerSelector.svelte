<script lang="ts">
  import { tick } from 'svelte';
  import Icon from '@iconify/svelte';
  import type { BannerInfo } from './lib/banners';

  // Banners arrive in display order, newest first.
  export let banners: BannerInfo[] = [];
  export let selectedId = '';

  let menuOpen = false;
  let dropdown: HTMLDivElement;
  let menu: HTMLDivElement;
  let menuTrigger: HTMLButtonElement;

  $: selectedIndex = Math.max(0, banners.findIndex(banner => banner.id === selectedId));
  $: visibleBanners = banners.slice(Math.max(0, selectedIndex - 1), selectedIndex + 2);

  function closeMenu(restoreFocus = false) {
    menuOpen = false;
    if (restoreFocus) menuTrigger.focus();
  }

  function focusMenuItem(index: number) {
    const option = menu?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')[index];
    option?.focus({ preventScroll: true });
    option?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  async function openMenu(index = selectedIndex) {
    menuOpen = true;
    await tick();
    if (menuOpen) focusMenuItem(index);
  }

  function handleOutsideInteraction(event: Event) {
    if (menuOpen && event.target instanceof Node && !dropdown.contains(event.target)) closeMenu();
  }

  function handleTriggerKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      void openMenu();
    } else if (event.key === 'Escape') {
      closeMenu();
    }
  }

  function handleMenuKeydown(event: KeyboardEvent) {
    const options = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
    const index = options.indexOf(menu.ownerDocument.activeElement as HTMLButtonElement);
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowDown': nextIndex = (index + 1) % options.length; break;
      case 'ArrowUp': nextIndex = (index - 1 + options.length) % options.length; break;
      case 'Home': nextIndex = 0; break;
      case 'End': nextIndex = options.length - 1; break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
        return;
      case 'Tab': closeMenu(); return;
      default: return;
    }
    event.preventDefault();
    focusMenuItem(nextIndex);
  }

  function selectAdjacent(offset: number) {
    const banner = banners[selectedIndex + offset];
    if (banner) selectedId = banner.id;
  }

  function keepSelectionVisible(node: HTMLDivElement, _selectedId: string) {
    async function centerSelection() {
      await tick();
      const selected = node.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
      if (selected) {
        node.scrollLeft = selected.offsetLeft - (node.clientWidth - selected.offsetWidth) / 2;
      }
    }

    const observer = new ResizeObserver(() => void centerSelection());
    observer.observe(node);
    void centerSelection();
    return {
      update: () => void centerSelection(),
      destroy: () => observer.disconnect(),
    };
  }
</script>

<svelte:window on:pointerdown={handleOutsideInteraction} on:focusin={handleOutsideInteraction} />

{#if banners.length > 0}
  <nav aria-label="Banner selection" class="relative z-20 flex min-w-0 items-center gap-1 p-1.5 bg-zinc-800/80 rounded-xl border border-zinc-700/50 shadow-sm backdrop-blur-xl sm:gap-2">
    <div class="flex min-w-0 flex-1 items-center justify-center gap-1 sm:gap-2">
      {#if selectedIndex > 0}
        <button
          type="button"
          aria-label="Newer banner"
          title="Newer banner"
          on:click={() => selectAdjacent(-1)}
          class="flex h-10 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 focus-visible:outline-2 focus-visible:outline-primary-500 cursor-pointer sm:w-9"
        >
          <Icon icon="ph:caret-left-bold" />
        </button>
      {/if}

      <div
        use:keepSelectionVisible={selectedId}
        class="relative flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] sm:flex-initial sm:gap-2"
      >
        {#each visibleBanners as banner (banner.id)}
          <button
            type="button"
            aria-pressed={selectedId === banner.id}
            title={banner.poolName}
            on:click={() => selectedId = banner.id}
            class="max-w-full shrink-0 truncate px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors duration-200 cursor-pointer focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary-500 sm:px-4 {selectedId === banner.id ? 'bg-primary-500 text-zinc-950 shadow-md' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50'}"
          >
            {banner.poolName}
          </button>
        {/each}
      </div>

      {#if selectedIndex < banners.length - 1}
        <button
          type="button"
          aria-label="Older banner"
          title="Older banner"
          on:click={() => selectAdjacent(1)}
          class="flex h-10 w-7 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 focus-visible:outline-2 focus-visible:outline-primary-500 cursor-pointer sm:w-9"
        >
          <Icon icon="ph:caret-right-bold" />
        </button>
      {/if}
    </div>

    <div bind:this={dropdown} class="relative flex shrink-0 self-stretch">
      <button
        bind:this={menuTrigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        on:click={() => menuOpen ? closeMenu() : openMenu()}
        on:keydown={handleTriggerKeydown}
        class="flex cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors hover:bg-zinc-700/50 focus-visible:outline-2 focus-visible:outline-primary-500 sm:gap-2 sm:px-4 sm:text-sm {menuOpen ? 'bg-zinc-700/50 text-primary-400' : 'text-zinc-300'}"
      >
        <span>All Banners</span>
        <Icon icon={menuOpen ? 'ph:caret-up-bold' : 'ph:caret-down-bold'} />
      </button>

      {#if menuOpen}
        <div
          bind:this={menu}
          role="menu"
          aria-label="All banners"
          tabindex="-1"
          on:keydown={handleMenuKeydown}
          class="absolute right-0 top-full mt-2 max-h-[min(24rem,50vh)] w-[min(22rem,calc(100vw-3rem))] overflow-y-auto rounded-xl border border-zinc-700/70 bg-zinc-900/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl"
        >
          {#each banners as banner (banner.id)}
            <button
              type="button"
              role="menuitemradio"
              aria-checked={selectedId === banner.id}
              tabindex="-1"
              on:click={() => { selectedId = banner.id; closeMenu(true); }}
              class="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-500 {selectedId === banner.id ? 'bg-primary-500/15 text-primary-400' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white focus-visible:bg-zinc-800'}"
            >
              <span>{banner.poolName}</span>
              {#if selectedId === banner.id}
                <Icon icon="ph:check-bold" class="shrink-0" />
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </nav>
{/if}
