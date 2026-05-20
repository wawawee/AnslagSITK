import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiService } from '@/services/api';
import type { CuratedModelInfo, ModelPresetInfo, ModelSettings, OpenRouterCreditsInfo } from '@/types';
import { DEFAULT_MODEL_SETTINGS, loadModelSettings, saveModelSettings } from '@/utils/modelSettings';
import { ExternalLink, RefreshCw, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

function modelsByTier(models: CuratedModelInfo[]) {
  const order = ['lottery', 'free', 'budget', 'quality'];
  return order
    .map(tier => ({
      tier,
      items: models.filter(m => m.tier === tier),
    }))
    .filter(g => g.items.length > 0);
}

export function ModelSettingsPanel() {
  const [settings, setSettings] = useState<ModelSettings>(() => loadModelSettings());
  const [models, setModels] = useState<CuratedModelInfo[]>([]);
  const [presets, setPresets] = useState<ModelPresetInfo[]>([]);
  const [credits, setCredits] = useState<OpenRouterCreditsInfo | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(false);

  useEffect(() => {
    apiService
      .getCuratedModels()
      .then(r => {
        setModels(r.models);
        setPresets(r.presets);
      })
      .catch(() => toast.error('Kunde inte hämta modellista'));
  }, []);

  const refreshCredits = useCallback(() => {
    setLoadingCredits(true);
    apiService
      .getOpenRouterCredits()
      .then(setCredits)
      .finally(() => setLoadingCredits(false));
  }, []);

  useEffect(() => {
    refreshCredits();
  }, [refreshCredits]);

  const apply = (next: ModelSettings) => {
    setSettings(next);
    saveModelSettings(next);
    toast.success('Modellinställningar sparade');
  };

  const isCustom = settings.presetId === 'custom';
  const groups = modelsByTier(models);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-blue-500" />
          AI-modeller (OpenRouter)
        </h2>
        <p className="text-muted-foreground mt-1">
          Kuraterad lista — inte hela OpenRouter-katalogen. Priser per modell på{' '}
          <a
            href="https://openrouter.ai/models"
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 underline inline-flex items-center gap-1"
          >
            openrouter.ai/models <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">OpenRouter-kredit</CardTitle>
          <CardDescription>
            Valfritt — kräver API-nyckel med rätt behörighet (Management key om vanlig nyckel inte räcker).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={refreshCredits} disabled={loadingCredits}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingCredits ? 'animate-spin' : ''}`} />
            Uppdatera
          </Button>
          {credits?.available && credits.remainingCredits != null ? (
            <span className="text-sm font-medium">
              ~{credits.remainingCredits.toFixed(2)} {credits.currency || 'USD'} kvar
              <span className="text-muted-foreground font-normal">
                {' '}
                (köpt {credits.totalCredits?.toFixed(2)}, använt {credits.totalUsage?.toFixed(2)})
              </span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">
              {credits?.message || 'Kreditinfo ej tillgänglig — använd OpenRouter-dashboard istället'}
            </span>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Förval</CardTitle>
          <CardDescription>Snabb profil — eller välj &quot;Egen&quot; för att plocka modell per steg.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {presets.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  apply({
                    presetId: p.id as ModelSettings['presetId'],
                    reasonModel: undefined,
                    proModel: undefined,
                  })
                }
                className={`text-left rounded-lg border p-3 transition-colors ${
                  settings.presetId === p.id
                    ? 'border-blue-500 bg-blue-50/80 dark:bg-blue-950/30'
                    : 'hover:bg-muted/50'
                }`}
              >
                <div className="font-medium text-sm">{p.label}</div>
                <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
              </button>
            ))}
            <button
              type="button"
              onClick={() =>
                apply({ presetId: 'custom', reasonModel: settings.reasonModel, proModel: settings.proModel })
              }
              className={`text-left rounded-lg border p-3 transition-colors ${
                isCustom ? 'border-blue-500 bg-blue-50/80' : 'hover:bg-muted/50'
              }`}
            >
              <div className="font-medium text-sm">Egen</div>
              <p className="text-xs text-muted-foreground mt-1">Välj modell för planering och syntes separat.</p>
            </button>
          </div>
        </CardContent>
      </Card>

      {isCustom && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Egen konfiguration</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Planering (sökstrategi)</Label>
              <Select
                value={settings.reasonModel || ''}
                onValueChange={v => apply({ ...settings, presetId: 'custom', reasonModel: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Välj modell" />
                </SelectTrigger>
                <SelectContent>
                  {models.map(m => (
                    <SelectItem key={`r-${m.id}`} value={m.id}>
                      {m.label} ({m.badge})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Syntes & ansökningar</Label>
              <Select
                value={settings.proModel || ''}
                onValueChange={v => apply({ ...settings, presetId: 'custom', proModel: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Välj modell" />
                </SelectTrigger>
                <SelectContent>
                  {models.map(m => (
                    <SelectItem key={`p-${m.id}`} value={m.id}>
                      {m.label} ({m.badge})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Modeller i appen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {groups.map(g => (
            <div key={g.tier}>
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                {g.tier === 'lottery'
                  ? 'Gratis-lotto'
                  : g.tier === 'free'
                    ? 'Gratis'
                    : g.tier === 'budget'
                      ? 'Billig'
                      : 'Premium'}
              </p>
              <ul className="space-y-2">
                {g.items.map(m => (
                  <li key={m.id} className="text-sm border rounded-md p-2 bg-muted/20">
                    <span className="font-mono text-xs">{m.id}</span>
                    <span className="ml-2 text-xs text-blue-600">{m.badge}</span>
                    <p className="text-muted-foreground text-xs mt-1">{m.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      <Button variant="outline" onClick={() => apply({ ...DEFAULT_MODEL_SETTINGS })}>
        Återställ till rekommenderad
      </Button>
    </div>
  );
}
