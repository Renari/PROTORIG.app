<script lang="ts">
  import Icon from '@iconify/svelte';
  import type { BackupRecord } from './lib/backups';

  export let hasData: boolean;
  export let backups: BackupRecord[] = [];
  export let busyLabel = '';
  export let notice = '';
  export let error = '';
  export let onExport: () => void;
  export let onRestoreBackup: (id: string) => void;
  export let onDeleteBackup: (id: string) => void;
  export let onClearData: () => void;

  const reasonLabels: Record<BackupRecord['reason'], string> = {
    'before-import': 'Before import',
    'before-restore': 'Before restore',
    'before-clear': 'Before clear',
  };

  function formatTimestamp(value: string): string {
    return new Date(value).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
</script>

<div class="space-y-6" style="animation: fadeInUp 0.5s ease-out forwards;">
  <header class="space-y-3">
    <h1 class="text-3xl md:text-4xl font-extrabold tracking-tight text-white">Settings</h1>
    <p class="text-zinc-400 text-sm md:text-base font-medium max-w-2xl leading-relaxed">
      Manage exports, local recovery snapshots, and destructive data actions.
    </p>
  </header>

  {#if notice}
    <div class="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 px-4 py-3 rounded-xl flex items-center gap-3">
      <Icon icon="ph:check-circle-duotone" class="text-xl text-emerald-400 flex-shrink-0" />
      <p class="text-sm font-medium">{notice}</p>
    </div>
  {/if}

  {#if error}
    <div class="bg-red-500/10 border border-red-500/20 text-red-300 px-4 py-3 rounded-xl flex items-center gap-3">
      <Icon icon="ph:warning-circle-duotone" class="text-xl text-red-400 flex-shrink-0" />
      <p class="text-sm font-medium">{error}</p>
    </div>
  {/if}

  <section class="bg-zinc-800/40 backdrop-blur-xl rounded-2xl border border-zinc-700/50 shadow-xl p-6 md:p-8 space-y-4">
    <div class="space-y-1">
      <h2 class="text-xl font-bold text-white">Data Export</h2>
      <p class="text-sm text-zinc-400">Download the current database contents in EGF format.</p>
    </div>

    <button
      on:click={onExport}
      disabled={!hasData || !!busyLabel}
      class="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-400 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-zinc-950 px-4 py-2.5 rounded-xl text-sm font-bold shadow-md transition-colors"
    >
      <Icon icon="ph:download-simple-bold" class="text-lg" />
      <span>Export EGF</span>
    </button>
  </section>

  <section class="bg-zinc-800/40 backdrop-blur-xl rounded-2xl border border-zinc-700/50 shadow-xl p-6 md:p-8 space-y-4">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div class="space-y-1">
        <h2 class="text-xl font-bold text-white">Local Backups</h2>
        <p class="text-sm text-zinc-400">Automatic snapshots created before risky actions. The newest 10 are kept locally.</p>
      </div>
      {#if busyLabel}
        <div class="inline-flex items-center gap-2 text-sm text-zinc-300 bg-zinc-900/70 border border-zinc-700 rounded-lg px-3 py-2">
          <span class="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
          <span>{busyLabel}</span>
        </div>
      {/if}
    </div>

    {#if backups.length === 0}
      <div class="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 px-5 py-8 text-center text-sm text-zinc-500">
        No backups yet. A backup will be created before imports, restores, and clears when local data exists.
      </div>
    {:else}
      <div class="space-y-3">
        {#each backups as backup (backup.id)}
          <div class="rounded-xl border border-zinc-700/60 bg-zinc-900/50 px-4 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div class="space-y-1">
              <div class="flex items-center gap-2 flex-wrap">
                <p class="text-sm font-bold text-white">{formatTimestamp(backup.createdAt)}</p>
                <span class="text-[10px] uppercase tracking-widest font-bold text-zinc-400 bg-zinc-800 border border-zinc-700 rounded-full px-2 py-1">
                  {reasonLabels[backup.reason]}
                </span>
              </div>
              <p class="text-sm text-zinc-400">
                {backup.counts.characters} character pulls, {backup.counts.weapons} weapon pulls
              </p>
            </div>

            <div class="flex items-center gap-2">
              <button
                on:click={() => onRestoreBackup(backup.id)}
                disabled={!!busyLabel}
                class="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-400 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-zinc-950 px-3 py-2 rounded-lg text-sm font-bold transition-colors"
              >
                <Icon icon="ph:arrow-counter-clockwise-bold" class="text-base" />
                <span>Restore</span>
              </button>
              <button
                on:click={() => onDeleteBackup(backup.id)}
                disabled={!!busyLabel}
                class="inline-flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-zinc-200 px-3 py-2 rounded-lg text-sm font-semibold transition-colors border border-zinc-700"
              >
                <Icon icon="ph:trash-bold" class="text-base" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <section class="bg-red-950/20 backdrop-blur-xl rounded-2xl border border-red-500/20 shadow-xl p-6 md:p-8 space-y-4">
    <div class="space-y-1">
      <h2 class="text-xl font-bold text-white">Danger Zone</h2>
      <p class="text-sm text-zinc-400">
        Clear the local database. If data exists, a backup will be created first so you can restore it later.
      </p>
    </div>

    <button
      on:click={onClearData}
      disabled={!!busyLabel || !hasData}
      class="inline-flex items-center gap-2 bg-red-500/90 hover:bg-red-400 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-md transition-colors"
    >
      <Icon icon="ph:trash-bold" class="text-lg" />
      <span>Clear Local Data</span>
    </button>
  </section>
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
</style>
