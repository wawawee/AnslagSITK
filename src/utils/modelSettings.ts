import type { ModelSettings } from '@/types';

const STORAGE_KEY = 'sitk-model-settings';

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  presetId: 'recommended',
};

export function loadModelSettings(): ModelSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MODEL_SETTINGS };
    const parsed = JSON.parse(raw) as ModelSettings;
    return { ...DEFAULT_MODEL_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_MODEL_SETTINGS };
  }
}

export function saveModelSettings(settings: ModelSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
