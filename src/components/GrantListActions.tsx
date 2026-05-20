import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  deleteGrantSnapshot,
  listGrantSnapshots,
  loadGrantSnapshot,
  saveGrantSnapshot,
} from '@/services/grantSnapshots';
import { apiService } from '@/services/api';
import { downloadGrantsCsv, downloadGrantsJson, parseGrantsImportFile } from '@/utils/grantExport';
import type { Grant } from '@/types';
import { Download, FileSpreadsheet, FileText, FolderOpen, Save, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

interface GrantListActionsProps {
  grants: Grant[];
  orgName: string;
  onLoadGrants: (grants: Grant[]) => void;
  onClear: () => void;
}

export function GrantListActions({ grants, orgName, onLoadGrants, onClear }: GrantListActionsProps) {
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [snapshots, setSnapshots] = useState(() => listGrantSnapshots());
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshSnapshots = () => setSnapshots(listGrantSnapshots());

  const handleSaveSnapshot = () => {
    if (grants.length === 0) {
      toast.error('Ingen lista att spara');
      return;
    }
    const snap = saveGrantSnapshot(
      snapshotLabel || `SITK ${grants.length} st — ${new Date().toLocaleDateString('sv-SE')}`,
      grants,
      orgName
    );
    refreshSnapshots();
    setSnapshotLabel('');
    toast.success(`Sparat: ${snap.label} (${snap.grants.length} utlysningar)`);
  };

  const handleLoadSnapshot = (id: string) => {
    const snap = loadGrantSnapshot(id);
    if (!snap) return;
    onLoadGrants(snap.grants);
    apiService.saveDiscoveredGrants(snap.grants);
    toast.success(`Laddade ${snap.grants.length} utlysningar från "${snap.label}"`);
  };

  const handleDeleteSnapshot = (id: string, label: string) => {
    deleteGrantSnapshot(id);
    refreshSnapshots();
    toast.message(`Raderade "${label}"`);
  };

  const baseName = (orgName || 'utlysningar').replace(/\s+/g, '-').toLowerCase();

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const imported = parseGrantsImportFile(text);
      onLoadGrants(imported);
      apiService.saveDiscoveredGrants(imported);
      toast.success(`Importerade ${imported.length} utlysningar`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import misslyckades');
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl border bg-muted/30">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs">Spara lista lokalt</Label>
          <Input
            placeholder={`t.ex. SITK ${grants.length || 326} utlysningar`}
            value={snapshotLabel}
            onChange={e => setSnapshotLabel(e.target.value)}
            className="h-9 mt-1"
          />
        </div>
        <Button type="button" size="sm" onClick={handleSaveSnapshot} disabled={grants.length === 0} className="gap-1.5">
          <Save className="h-4 w-4" />
          Spara kopia
        </Button>
      </div>

      {snapshots.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <Select onValueChange={handleLoadSnapshot}>
            <SelectTrigger className="w-[min(100%,320px)] h-9">
              <SelectValue placeholder="Ladda sparad lista..." />
            </SelectTrigger>
            <SelectContent>
              {snapshots.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label} ({s.grants.length} st)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {snapshots.length > 0 && (
            <Select onValueChange={id => {
              const s = snapshots.find(x => x.id === id);
              if (s) handleDeleteSnapshot(id, s.label);
            }}>
              <SelectTrigger className="w-[140px] h-9 text-destructive">
                <SelectValue placeholder="Radera sparad..." />
              </SelectTrigger>
              <SelectContent>
                {snapshots.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={grants.length === 0}
          className="gap-1.5"
          onClick={() => downloadGrantsJson(grants, `${baseName}-${grants.length}.json`)}
        >
          <Download className="h-3.5 w-3.5" />
          JSON
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={grants.length === 0}
          className="gap-1.5"
          onClick={() => downloadGrantsCsv(grants, `${baseName}-${grants.length}.csv`)}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Excel (CSV)
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={grants.length === 0}
          className="gap-1.5"
          onClick={async () => {
            try {
              await apiService.exportGrantsPdf(grants, `Utlysningar — ${orgName || 'export'}`, orgName);
              toast.success('PDF nedladdad');
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'PDF misslyckades');
            }
          }}
        >
          <FileText className="h-3.5 w-3.5" />
          PDF
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" />
          Importera JSON
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleImport(f);
            e.target.value = '';
          }}
        />
        {grants.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear} className="gap-1.5 text-destructive ml-auto">
            <Trash2 className="h-3.5 w-3.5" />
            Rensa aktiv lista
          </Button>
        )}
      </div>
    </div>
  );
}
