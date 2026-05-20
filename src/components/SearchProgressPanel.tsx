import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export interface SearchLogEntry {
  timestamp: string;
  message: string;
}

interface SearchProgressPanelProps {
  active: boolean;
  status: string;
  logs: SearchLogEntry[];
  verbose?: boolean;
}

export function SearchProgressPanel({ active, status, logs, verbose = true }: SearchProgressPanelProps) {
  if (!active) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/40 animate-in fade-in duration-300">
      <CardHeader className="py-3 pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-900">
          <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
          {status || 'Söker utlysningar...'}
        </CardTitle>
      </CardHeader>
      {verbose && logs.length > 0 && (
        <CardContent className="pt-0 pb-3">
          <div className="max-h-40 overflow-y-auto rounded-lg bg-white/70 border border-amber-100 p-3 font-mono text-[11px] text-slate-600 space-y-1">
            {logs.map((log, i) => (
              <div key={`${log.timestamp}-${i}`} className="flex gap-2">
                <span className="text-amber-500 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span>{log.message}</span>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
