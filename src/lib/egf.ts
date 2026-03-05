import type { EndfieldGachaItem } from './api';

export interface EGFInfo {
  uid: string;
  lang: string;
  game_id: string;
  export_timestamp: number;
  export_app: string;
  export_app_version: string;
}

export interface EGFExport {
  info: EGFInfo;
  list: EndfieldGachaItem[];
}

export function exportEGF(items: EndfieldGachaItem[]) {
  // Try to find the user's UID or stick to an empty string. The auth API does not expose it
  const exportData: EGFExport = {
    info: {
      uid: '',
      lang: 'en-us',
      game_id: 'endfield',
      export_timestamp: Math.floor(Date.now() / 1000),
      export_app: 'PROTORIG.app',
      export_app_version: 'v1.0.0'
    },
    list: items
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `Endfield_EGF_${exportData.info.export_timestamp}.json`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
