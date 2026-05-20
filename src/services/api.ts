import type { ApplicationDraft, DeepSearchResponse, Grant, GrantIntelligence, ProjectInfo, SearchFilters, OrgProfile, FundingEntity, PortfolioAccount, PortfolioAccountDetail } from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

class ApiService {
  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  async deepSearch(query: string, orgProfile?: OrgProfile): Promise<DeepSearchResponse> {
    return this.fetch('/api/deep-search', {
      method: 'POST',
      body: JSON.stringify({ query, orgProfile }),
    });
  }

  async grantIntelligence(grantInfo: Grant, orgProfile?: OrgProfile): Promise<GrantIntelligence> {
    return this.fetch('/api/grant-intelligence', {
      method: 'POST',
      body: JSON.stringify({ grantInfo, orgProfile }),
    });
  }

  async searchGrants(query: string, filters?: SearchFilters, useDeepSearch: boolean = false, orgProfile?: OrgProfile): Promise<Grant[]> {
    try {
      if (useDeepSearch) {
        const deepResult = await this.deepSearch(query, orgProfile);
        const parsedGrants = this.parseGrantsFromOutput(deepResult.synthesis);
        if (parsedGrants.length > 0 && !parsedGrants[0].id.includes('mock')) {
          return parsedGrants;
        }
        return this.getMockGrants();
      }

      const result = await this.fetch<unknown>('/api/search-grants', {
        method: 'POST',
        body: JSON.stringify({ query, filters, orgProfile }),
      });

      if (typeof result === 'object' && result !== null && 'output' in result) {
        const raw = (result as { output?: string }).output;
        if (raw) return this.parseGrantsFromOutput(raw);
      }

      return Array.isArray(result) ? (result as Grant[]) : this.getMockGrants();
    } catch (error) {
      console.error('Search grants error:', error);
      return this.getMockGrants();
    }
  }

  async discoverMoreGrants(
    onStatusUpdate?: (status: string, logs: { timestamp: string; message: string }[]) => void,
    existingCount: number = 0,
    orgProfile?: OrgProfile
  ): Promise<Grant[]> {
    try {
      const startResult = await this.fetch<{ success: boolean; taskId: string }>('/api/discover-grants', {
        method: 'POST',
        body: JSON.stringify({ query: 'new leads', orgProfile }),
      });

      const taskId = startResult.taskId;

      return new Promise((resolve, reject) => {
        const pollInterval = setInterval(async () => {
          try {
            const statusResult = await this.fetch<{
              id: string;
              status: string;
              logs: { timestamp: string; message: string }[];
              result: string | null;
              completed: boolean;
            }>(`/api/discovery-status/${taskId}`);

            if (onStatusUpdate) {
              onStatusUpdate(statusResult.status, statusResult.logs);
            }

            if (statusResult.completed) {
              clearInterval(pollInterval);
              if (statusResult.result) {
                const newGrants = this.parseGrantsFromOutput(statusResult.result);
                const uniqueGrants = newGrants.map((g, i) => ({
                  ...g,
                  id: `discovered-${Date.now()}-${i + existingCount}`
                }));
                resolve(uniqueGrants);
              } else {
                resolve([]);
              }
            }
          } catch (err) {
            clearInterval(pollInterval);
            console.error('Polling error:', err);
            reject(err);
          }
        }, 2000);
      });

    } catch (error) {
      console.error('Discover more grants error:', error);
      return [];
    }
  }

  async generateProposals(grantInfo: Grant, orgProfile: OrgProfile, count: number = 3): Promise<ProjectInfo[]> {
    const response = await this.fetch<{ success: boolean; proposals: ProjectInfo[] }>('/api/generate-proposals', {
      method: 'POST',
      body: JSON.stringify({ grantInfo, orgProfile, count }),
    });
    return response.proposals || [];
  }

  async generateApplication(grantInfo: Grant, projectInfo: ProjectInfo, orgProfile: OrgProfile): Promise<ApplicationDraft> {
    const response = await this.fetch<{ success: boolean; content: Record<string, unknown> }>('/api/generate-application', {
      method: 'POST',
      body: JSON.stringify({ grantInfo, projectInfo, orgProfile }),
    });

    return {
      id: `draft-${Date.now()}`,
      grantId: grantInfo.id,
      projectInfo,
      content: response.content as ApplicationDraft['content'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  saveDiscoveredGrants(grants: Grant[]): void {
    localStorage.setItem('sitk-discovered-grants', JSON.stringify(grants));
  }

  loadDiscoveredGrants(): Grant[] {
    const saved = localStorage.getItem('sitk-discovered-grants');
    return saved ? JSON.parse(saved) : [];
  }

  private parseGrantsFromOutput(output: string): Grant[] {
    const grants: Grant[] = [];
    const sections = output.split(/(?=^## |^\*\*)/m).filter(s => s.trim().length > 20);

    for (const section of sections) {
      const grant: Partial<Grant> = {};

      const nameMatch = section.match(/(?:^#+ |^\*\*)(.*?)(?:\*\*|$|\n|\])/m);
      if (nameMatch) {
        grant.name = nameMatch[1].replace(/[[\]]/g, '').trim();
      } else {
        const firstLine = section.trim().split('\n')[0];
        if (firstLine && firstLine.length < 100) {
          grant.name = firstLine.replace(/[#*[\]]/g, '').trim();
        } else {
          continue;
        }
      }

      const funderMatch = section.match(/(?:^|\n)[- \t*]*(?:Finansiär|Funder|Myndighet|Utlysare|Organisation)\*\*?:\s*([^*\n]*)/i);
      if (funderMatch) grant.funder = funderMatch[1].trim();

      const deadlineMatch = section.match(/(?:^|\n)[- \t*]*(?:Deadline|Sista ansökningsdag|Datum|Stänger|Slutdatum)\*\*?:\s*([^*\n]*)/i);
      if (deadlineMatch) grant.deadline = deadlineMatch[1].trim();

      const amountMatch = section.match(/(?:^|\n)[- \t*]*(?:Belopp|Maxbelopp|Amount|Budget|Stöd)\*\*?:\s*([^*\n]*)/i);
      if (amountMatch) grant.maxAmount = amountMatch[1].trim();

      const labeledUrlMatch = section.match(/(?:^|\n)[- \t*]*(?:URL|Länk|Link|Källa)\*\*?:\s*(https?:\/\/[^\s)\n]+)/i);
      if (labeledUrlMatch) {
        grant.url = labeledUrlMatch[1].trim();
      } else {
        const urlMatch = section.match(/(https?:\/\/[^\s)\n]+)/);
        if (urlMatch) grant.url = urlMatch[1].trim();
      }

      const relevanceMatch = section.match(/(?:^|\n)[- \t*]*(?:Relevans|Strategisk vikt|Motivering|Varför)\*\*?:\s*([\s\S]*?)(?=\n[- \t*]*(?:- \*\*|## |$))/i);
      if (relevanceMatch) grant.relevance = relevanceMatch[1].trim();

      const descMatch = section.match(/(?:^|\n)[- \t*]*(?:Beskrivning|Description|Om utlysningen|Info)\*\*?:\s*([\s\S]*?)(?=\n[- \t*]*(?:- \*\*|## |Relevans:|URL:|$))/i);
      if (descMatch) {
        grant.description = descMatch[1].trim();
      } else {
        const lines = section.split('\n').slice(1);
        grant.description = lines
          .filter(l => !l.match(/[- \t*]*(?:Finansiär|Deadline|Belopp|URL|Datum|Funder|Amount|Relevans|Beskrivning|##)/i) && l.trim().length > 5)
          .join(' ')
          .substring(0, 500)
          .trim();
      }

      const funderLower = (grant.funder || '').toLowerCase();
      const nameLower = (grant.name || '').toLowerCase();

      if (funderLower.includes('vinnova') || nameLower.includes('vinnova')) grant.category = 'vinnova';
      else if (funderLower.includes('tillväxtverket') || nameLower.includes('tillväxtverket')) grant.category = 'tillvaxtverket';
      else if (funderLower.includes('region') || funderLower.includes('länsstyrelsen') || funderLower.includes('kommun')) grant.category = 'region';
      else if (funderLower.includes('eu') || funderLower.includes('digital europe') || funderLower.includes('horizon') || funderLower.includes('interreg')) grant.category = 'eu';
      else grant.category = 'other';

      grant.id = `grant-ds-${Date.now()}-${grants.length}`;
      grant.status = 'open';

      if (grant.name && grant.name.length > 3) {
        grants.push(grant as Grant);
      }
    }

    return grants;
  }

  public getMockGrants(): Grant[] {
    return [
      {
        id: 'mock-1',
        name: 'Riskkapital & AI-innovation 2026',
        funder: 'Tech Fund',
        deadline: 'Löpande',
        maxAmount: '10 000 000 kr',
        description: 'Exempelanslag för att demonstrera plattformen.',
        url: 'https://example.com',
        category: 'other',
        status: 'open',
      }
    ];
  }

  // --- Entity Endpoints ---
  async getEntities(): Promise<FundingEntity[]> {
    const response = await this.fetch<{ entities: FundingEntity[] }>('/api/entities');
    return response.entities || [];
  }

  async getEntity(id: string): Promise<FundingEntity | null> {
    try {
      const response = await this.fetch<{ entity: FundingEntity }>(`/api/entities/${id}`);
      return response.entity || null;
    } catch {
      return null;
    }
  }

  entityToOrgProfile(entity: FundingEntity): OrgProfile {
    return {
      name: entity.name,
      description: entity.description,
      focusAreas: entity.focusAreas,
      strengths: entity.strengths,
      partnerships: entity.partnerships,
      region: entity.region,
      orgType: entity.type,
      orgNr: entity.orgNr,
      phone: entity.phone,
    };
  }

  // --- Portfolio Endpoints (privat verktyg — ingen auth) ---
  async getPortfolioAccounts(): Promise<PortfolioAccount[]> {
    const response = await this.fetch<{ accounts: PortfolioAccount[] }>('/api/portfolio/accounts');
    return response.accounts || [];
  }

  async getPortfolioAccount(account: string): Promise<PortfolioAccountDetail | null> {
    try {
      return await this.fetch<PortfolioAccountDetail>(`/api/portfolio/account/${account}`);
    } catch {
      return null;
    }
  }

  // --- PDF Export ---
  async generatePdf(draft: ApplicationDraft, entity?: { name?: string; orgNr?: string; phone?: string }): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/generate-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft, entity }),
    });
    if (!response.ok) throw new Error('PDF-generering misslyckades');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ansokan-${draft.id || Date.now()}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const apiService = new ApiService();
