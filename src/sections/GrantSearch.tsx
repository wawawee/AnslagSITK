import { OrgProfileCard } from '@/components/OrgProfileCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiService } from '@/services/api';
import type { Grant, OrgProfile, SearchFilters } from '@/types';
import { AlertCircle, Building2, Calendar, CheckCircle2, Clock, Euro, ExternalLink, Filter, Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const categoryColors: Record<string, string> = {
  vinnova: 'bg-blue-100 text-blue-800 border-blue-200',
  tillvaxtverket: 'bg-green-100 text-green-800 border-green-200',
  region: 'bg-purple-100 text-purple-800 border-purple-200',
  eu: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  other: 'bg-gray-100 text-gray-800 border-gray-200',
};

const categoryLabels: Record<string, string> = {
  vinnova: 'Vinnova',
  tillvaxtverket: 'Tillväxtverket',
  region: 'Regionalt',
  eu: 'EU-medel',
  other: 'Övrigt',
};

const statusIcons = {
  open: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  closing_soon: <AlertCircle className="h-4 w-4 text-amber-500" />,
  closed: <Clock className="h-4 w-4 text-gray-400" />,
};

interface GrantSearchProps {
  onSelectGrant: (grant: Grant) => void;
  orgProfile: OrgProfile;
  onOrgProfileChange: (profile: OrgProfile) => void;
}

export function GrantSearch({ onSelectGrant, orgProfile, onOrgProfileChange }: GrantSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({});
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedGrant, setSelectedGrant] = useState<Grant | null>(null);
  const [deepSearchSynthesis, setDeepSearchSynthesis] = useState<string | null>(null);
  const [researchSteps, setResearchSteps] = useState<string[]>([]);

  // Load grants on mount
  useState(() => {
    const savedGrants = apiService.loadDiscoveredGrants();
    if (savedGrants.length > 0) {
      setGrants(savedGrants);
    } else {
      // Initialize with mock grants if nothing saved
      const mocks = apiService.getMockGrants();
      setGrants(mocks);
      apiService.saveDiscoveredGrants(mocks);
    }
  });

  const handleSearch = async () => {
    setLoading(true);
    try {
      const results = await apiService.searchGrants(searchQuery, filters, false, orgProfile.name ? orgProfile : undefined);
      // Merge results with existing grants, avoiding duplicates by ID
      setGrants(prev => {
        const existingIds = new Set(prev.map(g => g.id));
        const newUniqueResults = results.filter(g => !existingIds.has(g.id));
        const updated = [...prev, ...newUniqueResults];
        apiService.saveDiscoveredGrants(updated);
        return updated;
      });
      toast.success(`Hittade ${results.length} utlysningar`);
    } catch {
      toast.error('Kunde inte söka utlysningar');
    } finally {
      setLoading(false);
    }
  };

  const handleDeepSearch = async () => {
    if (!searchQuery) {
      toast.error('Vänligen fyll i ett sökord eller projektbeskrivning');
      return;
    }

    setLoading(true);
    try {
      const result = await apiService.deepSearch(searchQuery, orgProfile.name ? orgProfile : undefined);

      if (result.success) {
        setDeepSearchSynthesis(result.synthesis);
        setResearchSteps(result.plan);
        toast.success('Djupsökning slutförd');

        // Try to parse the synthesis for grants
        const parsedGrants = await apiService.searchGrants(searchQuery, filters, true, orgProfile.name ? orgProfile : undefined);
        if (parsedGrants.length > 0) {
          setGrants(prev => {
            const existingIds = new Set(prev.map(g => g.id));
            const newUniqueResults = parsedGrants.filter(g => !existingIds.has(g.id));
            const updated = [...prev, ...newUniqueResults];
            apiService.saveDiscoveredGrants(updated);
            return updated;
          });
        }
      }
    } catch {
      toast.error('Djupsökning misslyckades');
      handleSearch(); // Fallback
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className="space-y-6">
      {/* Org Profile */}
      <OrgProfileCard profile={orgProfile} onChange={onOrgProfileChange} />

      {/* Search Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600/90 via-blue-600 to-cyan-500/90 rounded-2xl p-6 md:p-8 text-white shadow-xl shadow-blue-500/20 backdrop-blur-md border border-white/10">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-48 h-48 bg-cyan-400/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <h2 className="text-2xl md:text-3xl font-bold mb-2 tracking-tight">Hitta rätt finansiering</h2>
          <p className="text-blue-100 mb-6 max-w-2xl font-medium">
            Sök bland aktuella utlysningar från Vinnova, Tillväxtverket, EU och andra finansiärer med hjälp av AI-driven analys.
          </p>

          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-blue-300 group-focus-within:text-white transition-colors" />
              <Input
                placeholder="Sök efter utlysningar eller beskriv ditt projekt..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-blue-200 h-12 backdrop-blur-sm focus:bg-white/20 focus:border-white/40 transition-all rounded-xl"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSearch}
                disabled={loading}
                className="bg-white text-blue-600 hover:bg-blue-50 h-12 px-6 font-semibold shadow-lg shadow-white/10 rounded-xl"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 animate-spin" />
                    Söker...
                  </div>
                ) : 'Sök'}
              </Button>
              <Button
                onClick={handleDeepSearch}
                disabled={loading}
                variant="secondary"
                className="bg-blue-500/20 text-white hover:bg-blue-500/30 h-12 px-6 border border-white/20 backdrop-blur-sm shadow-lg shadow-blue-900/20 rounded-xl group"
              >
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="h-4 w-4 transition-transform group-hover:scale-110" />
                    <div className="absolute inset-0 bg-white/40 blur-sm scale-150 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  Deep Search
                </div>
              </Button>
            </div>
          </div>
        </div>
      </div>



      {/* Deep Search Report */}
      {deepSearchSynthesis && (
        <Card className="border-blue-100 bg-white/40 backdrop-blur-xl shadow-2xl shadow-blue-500/5 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
          <CardHeader className="border-b border-blue-50/50 bg-blue-50/30">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl flex items-center gap-2 text-blue-900 font-bold">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Search className="h-5 w-5 text-blue-600" />
                </div>
                Djupsökningsrapport
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeepSearchSynthesis(null)}
                className="text-blue-600 hover:text-blue-800 hover:bg-blue-100/50 rounded-full h-8 w-8 p-0"
              >
                ✕
              </Button>
            </div>
            <CardDescription className="text-blue-700 font-medium pl-11">
              AI-syntes baserad på {researchSteps.length} autonoma söksteg hos myndigheter.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-6 py-6 md:px-12 md:py-8 bg-gradient-to-b from-white to-blue-50/30">
              <div className="prose prose-blue max-w-none whitespace-pre-wrap text-sm md:text-base leading-relaxed text-slate-700 max-h-[500px] overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-blue-200">
                {deepSearchSynthesis}
              </div>
            </div>

            <div className="px-6 py-4 bg-white/60 border-t border-blue-50/50 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3 text-blue-500" />
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Exekverade söksteg</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {researchSteps.map((step, i) => (
                  <Badge
                    key={i}
                    variant="outline"
                    className="bg-white/80 text-blue-700 border-blue-100/50 shadow-sm px-3 py-1 text-xs font-normal flex items-center gap-1.5"
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                    {step}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <Select
            value={filters.category}
            onValueChange={(value) => setFilters({ ...filters, category: value })}
          >
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Kategori" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla kategorier</SelectItem>
              <SelectItem value="vinnova">Vinnova</SelectItem>
              <SelectItem value="tillvaxtverket">Tillväxtverket</SelectItem>
              <SelectItem value="region">Regionalt</SelectItem>
              <SelectItem value="eu">EU-medel</SelectItem>
              <SelectItem value="other">Övrigt</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.status}
            onValueChange={(value) => setFilters({ ...filters, status: value })}
          >
            <SelectTrigger className="w-[180px]">
              <Clock className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla statusar</SelectItem>
              <SelectItem value="open">Öppen</SelectItem>
              <SelectItem value="closing_soon">Stänger snart</SelectItem>
              <SelectItem value="closed">Stängd</SelectItem>
            </SelectContent>
          </Select>
        </div>

      </div>

      {/* Results */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">Alla ({grants.length})</TabsTrigger>
          <TabsTrigger value="vinnova">Vinnova</TabsTrigger>
          <TabsTrigger value="regional">Regionalt</TabsTrigger>
          <TabsTrigger value="eu">EU</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {grants.map((grant) => (
              <GrantCard
                key={grant.id}
                grant={grant}
                onSelect={() => setSelectedGrant(grant)}
                onWriteApplication={() => onSelectGrant(grant)}
              />
            ))}
          </div>
          {grants.length === 0 && !loading && (
            <div className="text-center py-12">
              <Search className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-muted-foreground">Inga utlysningar hittades. Prova att söka eller använd Deep Search.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="vinnova" className="mt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {grants.filter(g => g.category === 'vinnova').map((grant) => (
              <GrantCard
                key={grant.id}
                grant={grant}
                onSelect={() => setSelectedGrant(grant)}
                onWriteApplication={() => onSelectGrant(grant)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="regional" className="mt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {grants.filter(g => g.category === 'tillvaxtverket' || g.category === 'region').map((grant) => (
              <GrantCard
                key={grant.id}
                grant={grant}
                onSelect={() => setSelectedGrant(grant)}
                onWriteApplication={() => onSelectGrant(grant)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="eu" className="mt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {grants.filter(g => g.category === 'eu').map((grant) => (
              <GrantCard
                key={grant.id}
                grant={grant}
                onSelect={() => setSelectedGrant(grant)}
                onWriteApplication={() => onSelectGrant(grant)}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Grant Detail Dialog */}
      <Dialog open={!!selectedGrant} onOpenChange={() => setSelectedGrant(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedGrant && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className={categoryColors[selectedGrant.category]}>
                    {categoryLabels[selectedGrant.category]}
                  </Badge>
                  {statusIcons[selectedGrant.status]}
                </div>
                <DialogTitle className="text-xl">{selectedGrant.name}</DialogTitle>
                <DialogDescription className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {selectedGrant.funder}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>Deadline: <strong>{selectedGrant.deadline}</strong></span>
                  </div>
                  {selectedGrant.maxAmount && (
                    <div className="flex items-center gap-2">
                      <Euro className="h-4 w-4 text-muted-foreground" />
                      <span>Max: <strong>{selectedGrant.maxAmount}</strong></span>
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="font-semibold mb-2">Beskrivning</h4>
                  <p className="text-sm text-muted-foreground">{selectedGrant.description}</p>
                </div>

                {selectedGrant.relevance && (
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-semibold mb-2 text-blue-900">Varför passar detta SITK?</h4>
                    <p className="text-sm text-blue-800">{selectedGrant.relevance}</p>
                  </div>
                )}

                {selectedGrant.url && (
                  <a
                    href={selectedGrant.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Öppna utlysningen
                  </a>
                )}

                <div className="flex gap-3 pt-4">
                  <Button
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                    onClick={() => {
                      onSelectGrant(selectedGrant);
                      setSelectedGrant(null);
                    }}
                  >
                    Skriv ansökan
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedGrant(null)}>
                    Stäng
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface GrantCardProps {
  grant: Grant;
  onSelect: () => void;
  onWriteApplication: () => void;
}

function GrantCard({ grant, onSelect, onWriteApplication }: GrantCardProps) {
  return (
    <Card
      className="group relative overflow-hidden border-white/20 bg-white/5 backdrop-blur-md shadow-lg hover:shadow-2xl hover:bg-white/10 transition-all duration-500 cursor-pointer border-l-4 border-l-blue-500"
      onClick={onSelect}
    >
      <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="p-2 bg-blue-500/20 rounded-full backdrop-blur-md">
          <ExternalLink className="h-4 w-4 text-blue-400" />
        </div>
      </div>

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <Badge variant="outline" className={`${categoryColors[grant.category]} backdrop-blur-md border-white/10`}>
            {categoryLabels[grant.category]}
          </Badge>
          <div className="flex items-center gap-1">
            {statusIcons[grant.status]}
          </div>
        </div>
        <CardTitle className="text-lg font-bold leading-tight group-hover:text-blue-400 transition-colors line-clamp-2">
          {grant.name}
        </CardTitle>
        <div className="flex items-center gap-2 text-xs font-semibold text-blue-300 uppercase tracking-wider mt-1">
          <Building2 className="h-3 w-3" />
          {grant.funder}
        </div>
      </CardHeader>

      <CardContent className="pb-3 space-y-4">
        <p className="text-sm text-slate-400 line-clamp-3 leading-relaxed">
          {grant.description}
        </p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <div className="flex items-center gap-1.5 text-slate-300 bg-white/5 py-1 px-2 rounded-md">
            <Calendar className="h-3.5 w-3.5 text-blue-400" />
            <span className="font-medium">{grant.deadline}</span>
          </div>
          {grant.maxAmount && (
            <div className="flex items-center gap-1.5 text-slate-300 bg-white/5 py-1 px-2 rounded-md">
              <Euro className="h-3.5 w-3.5 text-cyan-400" />
              <span className="font-medium">{grant.maxAmount}</span>
            </div>
          )}
          {grant.url && (
            <div className="flex items-center gap-1.5 text-blue-400/80 hover:text-blue-300 transition-colors">
              <ExternalLink className="h-3 w-3" />
              <span className="truncate max-w-[120px]">
                {(() => {
                  try {
                    return new URL(grant.url).hostname.replace('www.', '');
                  } catch {
                    return 'Länk';
                  }
                })()}
              </span>
            </div>
          )}
        </div>

        {grant.relevance && (
          <div className="pt-2">
            <div className="text-[10px] font-bold text-blue-500/80 uppercase tracking-widest flex items-center gap-1 mb-1">
              <CheckCircle2 className="h-3 w-3" />
              SITK Match
            </div>
            <p className="text-[11px] text-slate-500 italic line-clamp-1">
              "{grant.relevance}"
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-2 border-t border-white/5">
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-blue-400 hover:text-white hover:bg-blue-600/20 group-hover:bg-blue-600/10 transition-all font-bold tracking-tight"
          onClick={(e) => {
            e.stopPropagation();
            onWriteApplication();
          }}
        >
          GENERERA ANSÖKAN
        </Button>
      </CardFooter>
    </Card>
  );
}
