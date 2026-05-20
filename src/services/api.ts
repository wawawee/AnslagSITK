import type { ApplicationDraft, DeepSearchResponse, Grant, GrantIntelligence, ProjectInfo, SearchFilters, OrgProfile, FundingEntity, PortfolioAccount, PortfolioAccountDetail, GrantSearchOptions } from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

class ApiService {
  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Kan inte nå API (${API_BASE_URL || 'samma origin'}${endpoint}). Kör npm run dev:all — ${msg}`
      );
    }

    if (!response.ok) {
      const text = await response.text();
      let message = `HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(text) as { error?: string };
        if (parsed.error) message = parsed.error;
      } catch {
        if (text && text.length < 200) message = text;
        else if (response.status === 404) message = 'API-endpoint hittades inte — starta om backend (npm run dev:all)';
      }
      throw new Error(message);
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

  async pollSearchTask(
    taskId: string,
    onProgress?: (status: string, logs: { timestamp: string; message: string }[]) => void
  ): Promise<{ output: string; searchSteps?: string[]; warning?: string }> {
    if (!taskId || taskId === 'undefined') {
      throw new Error(
        'Ogiltigt sök-task — troligen gammal API-process på port 3001. Stoppa alla node-processer och kör: npm run dev:all'
      );
    }

    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const statusResult = await this.fetch<{
            status: string;
            logs: { timestamp: string; message: string }[];
            result: string | null;
            searchSteps?: string[];
            completed: boolean;
            warning?: string;
            error?: string;
          }>(`/api/discovery-status/${taskId}`);

          onProgress?.(statusResult.status, statusResult.logs || []);

          if (statusResult.completed) {
            if (statusResult.result) {
              resolve({
                output: statusResult.result,
                searchSteps: statusResult.searchSteps,
                warning: statusResult.warning,
              });
            } else {
              reject(new Error(statusResult.status || statusResult.error || 'Sökningen misslyckades'));
            }
            return;
          }
          setTimeout(poll, 1200);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('404') || msg.toLowerCase().includes('task not found')) {
            reject(
              new Error(
                'Task not found — starta om API (Ctrl+C, sedan npm run dev:all). Flera gamla node-processer på port 3001 ger detta fel.'
              )
            );
          } else {
            reject(err);
          }
        }
      };
      poll();
    });
  }

  private async resolveSearchOutput(
    start: { taskId?: string; output?: string; warning?: string; searchSteps?: string[] },
    onProgress?: (status: string, logs: { timestamp: string; message: string }[]) => void
  ): Promise<{ output: string; searchSteps: string[]; warning?: string }> {
    if (start.output) {
      onProgress?.('Klar (synkront API-svar)', []);
      return { output: start.output, searchSteps: start.searchSteps || [], warning: start.warning };
    }
    if (!start.taskId) {
      throw new Error(
        'API svarade utan taskId. Stoppa gamla servrar och kör om: npm run dev:all'
      );
    }
    const polled = await this.pollSearchTask(start.taskId, onProgress);
    return { output: polled.output, searchSteps: polled.searchSteps || [], warning: polled.warning };
  }

  async searchGrants(
    query: string,
    filters?: SearchFilters,
    orgProfile?: OrgProfile,
    onProgress?: (status: string, logs: { timestamp: string; message: string }[]) => void,
    options?: GrantSearchOptions
  ): Promise<{ grants: Grant[]; searchSteps: string[] }> {
    const start = await this.fetch<{
      taskId?: string;
      output?: string;
      warning?: string;
      searchSteps?: string[];
    }>('/api/search-grants', {
      method: 'POST',
      body: JSON.stringify({ query, filters, orgProfile, ...options }),
    });

    const { output, searchSteps, warning } = await this.resolveSearchOutput(start, onProgress);
    if (warning) console.warn('[AnslagSITK]', warning);

    const grants = this.parseGrantsFromOutput(output);
    if (grants.length === 0) {
      throw new Error('Sökningen gav inga parsbara utlysningar — prova annat sökord eller Deep Search');
    }
    return { grants, searchSteps };
  }

  async deepSearchWithProgress(
    query: string,
    orgProfile?: OrgProfile,
    onProgress?: (status: string, logs: { timestamp: string; message: string }[]) => void,
    options?: GrantSearchOptions
  ): Promise<DeepSearchResponse> {
    const deepOpts: GrantSearchOptions = {
      targetCount: options?.targetCount ?? 12,
      searchMode: options?.searchMode ?? 'broad',
    };
    const start = await this.fetch<{
      taskId?: string;
      output?: string;
      synthesis?: string;
      warning?: string;
    }>('/api/deep-search', {
      method: 'POST',
      body: JSON.stringify({ query, orgProfile, ...deepOpts }),
    });

    const resolved = start.synthesis
      ? { output: start.synthesis, searchSteps: [] as string[], warning: start.warning }
      : await this.resolveSearchOutput(start, onProgress);

    return {
      success: true,
      plan: resolved.searchSteps,
      rawResults: [],
      synthesis: resolved.output,
      ...(resolved.warning ? { warning: resolved.warning } : {}),
    };
  }

  async checkHealth(): Promise<{ status: string; search?: string }> {
    return this.fetch('/api/health');
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
    const grants: Grant[] = saved ? JSON.parse(saved) : [];
    return grants.filter(g => !g.id?.startsWith('mock-'));
  }

  clearDiscoveredGrants(): void {
    localStorage.removeItem('sitk-discovered-grants');
  }

  parseGrantsFromOutput(output: string): Grant[] {
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
      else if (
        /stiftelse|fond|postkod|arvsfonden|kamprad|göransson|familjen|wallenberg|riksbankens jubileumsfond|rf\.nu/i.test(
          `${funderLower} ${nameLower}`
        )
      ) {
        grant.category = 'stiftelse';
      } else grant.category = 'other';

      grant.id = `grant-ds-${Date.now()}-${grants.length}`;
      grant.status = 'open';

      if (grant.name && grant.name.length > 3) {
        grants.push(grant as Grant);
      }
    }

    return grants;
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

  async exportGrantsPdf(grants: Grant[], title: string, orgName?: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/export-grants-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grants, title, orgName }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'PDF-export misslyckades');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `utlysningar-${Date.now()}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
