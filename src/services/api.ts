import type { ApplicationDraft, BrowserUseResponse, DeepSearchResponse, Grant, ProjectInfo, SearchFilters, SITKProfile } from '@/types';

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

  // Browser Use API methods
  async runBrowserTask(task: string): Promise<BrowserUseResponse> {
    return this.fetch('/api/browser-use/run', {
      method: 'POST',
      body: JSON.stringify({ task }),
    });
  }

  async createSession(config?: Record<string, unknown>): Promise<BrowserUseResponse> {
    return this.fetch('/api/browser-use/sessions', {
      method: 'POST',
      body: JSON.stringify(config || {}),
    });
  }

  async sendMessage(sessionId: string, message: string): Promise<BrowserUseResponse> {
    return this.fetch(`/api/browser-use/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  // Deep search method using Gemini + Browser Use
  async deepSearch(query: string): Promise<DeepSearchResponse> {
    return this.fetch('/api/deep-search', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
  }

  // Grant search methods
  async searchGrants(query: string, filters?: SearchFilters, useDeepSearch: boolean = false): Promise<Grant[]> {
    try {
      if (useDeepSearch) {
        const deepResult = await this.deepSearch(query);
        // Synthesis contains the markdown report
        console.log('Deep search synthesis:', deepResult.synthesis);

        // Try to parse grants from the synthesis
        const parsedGrants = this.parseGrantsFromOutput(deepResult.synthesis);
        if (parsedGrants.length > 0 && !parsedGrants[0].id.includes('mock')) {
          return parsedGrants;
        }

        return this.getMockGrants();
      }

      const result = await this.fetch<unknown>('/api/search-grants', {
        method: 'POST',
        body: JSON.stringify({ query, filters }),
      });

      // If the API returns raw output, parse it
      if (typeof result === 'object' && result !== null) {
        const browserRes = result as BrowserUseResponse;
        if (browserRes.output || browserRes.result) {
          const rawOutput = browserRes.output || (typeof browserRes.result === 'string' ? browserRes.result : JSON.stringify(browserRes.result));
          return this.parseGrantsFromOutput(rawOutput);
        }
      }

      return Array.isArray(result) ? (result as Grant[]) : this.getMockGrants();
    } catch (error) {
      console.error('Search grants error:', error);
      // Return mock data for demo purposes
      return this.getMockGrants();
    }
  }

  // Targeted discovery for finding MORE leads with verbose status updates
  async discoverMoreGrants(
    onStatusUpdate?: (status: string, logs: { timestamp: string; message: string }[]) => void,
    existingCount: number = 0
  ): Promise<Grant[]> {
    try {
      // Step 1: Start the discovery task
      const startResult = await this.fetch<{ success: boolean; taskId: string }>('/api/discover-grants', {
        method: 'POST',
        body: JSON.stringify({ query: 'new leads' }),
      });

      const taskId = startResult.taskId;
      console.log(`Discovery started with Task ID: ${taskId}`);

      // Step 2: Poll for status updates
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
                // Ensure unique IDs based on timestamp to avoid collisions
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
        }, 2000); // Poll every 2 seconds
      });

    } catch (error) {
      console.error('Discover more grants error:', error);
      // Fallback: return empty if discovery fails completely
      return [];
    }
  }

  // Generate application draft
  async generateApplication(grantInfo: Grant, projectInfo: ProjectInfo, sitkProfile: SITKProfile): Promise<ApplicationDraft> {
    const response = await this.fetch<{ success: boolean; content: Record<string, unknown> }>('/api/generate-application', {
      method: 'POST',
      body: JSON.stringify({ grantInfo, projectInfo, sitkProfile }),
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

  // Persistence management
  saveDiscoveredGrants(grants: Grant[]): void {
    localStorage.setItem('sitk-discovered-grants', JSON.stringify(grants));
  }

  loadDiscoveredGrants(): Grant[] {
    const saved = localStorage.getItem('sitk-discovered-grants');
    return saved ? JSON.parse(saved) : [];
  }

  private parseGrantsFromOutput(output: string): Grant[] {
    const grants: Grant[] = [];

    // Split by common grant headers (## or **Grant Name**) or simply by blank lines if headers are missing
    const sections = output.split(/(?=^## |^\*\*)/m).filter(s => s.trim().length > 20);

    for (const section of sections) {
      const grant: Partial<Grant> = {};

      // Extract Name - look for ## [Name] or **Name** or simply # Name
      const nameMatch = section.match(/(?:^#+ |^\*\*)(.*?)(?:\*\*|$|\n|\])/m);
      if (nameMatch) {
        grant.name = nameMatch[1].replace(/[[\]]/g, '').trim();
      } else {
        // Try the first non-empty line as name if no header found
        const firstLine = section.trim().split('\n')[0];
        if (firstLine && firstLine.length < 100) {
          grant.name = firstLine.replace(/[#*[\]]/g, '').trim();
        } else {
          continue;
        }
      }

      // Extract Funder
      const funderMatch = section.match(/(?:^|\n)[- \t*]*(?:Finansiär|Funder|Myndighet|Utlysare|Organisation)\*\*?:\s*([^*\n]*)/i);
      if (funderMatch) grant.funder = funderMatch[1].trim();

      // Extract Deadline
      const deadlineMatch = section.match(/(?:^|\n)[- \t*]*(?:Deadline|Sista ansökningsdag|Datum|Stänger|Slutdatum)\*\*?:\s*([^*\n]*)/i);
      if (deadlineMatch) grant.deadline = deadlineMatch[1].trim();

      // Extract Amount
      const amountMatch = section.match(/(?:^|\n)[- \t*]*(?:Belopp|Maxbelopp|Amount|Budget|Stöd)\*\*?:\s*([^*\n]*)/i);
      if (amountMatch) grant.maxAmount = amountMatch[1].trim();

      // Extract URL - Prioritize labeled URL then falls back to any http link
      const labeledUrlMatch = section.match(/(?:^|\n)[- \t*]*(?:URL|Länk|Link|Källa)\*\*?:\s*(https?:\/\/[^\s)\n]+)/i);
      if (labeledUrlMatch) {
        grant.url = labeledUrlMatch[1].trim();
      } else {
        const urlMatch = section.match(/(https?:\/\/[^\s)\n]+)/);
        if (urlMatch) grant.url = urlMatch[1].trim();
      }

      // Extract Relevance/Strategy (if available) - sometimes synthesized as "Relevans" or "Varför"
      const relevanceMatch = section.match(/(?:^|\n)[- \t*]*(?:Relevans|Strategisk vikt|Motivering|Varför)\*\*?:\s*([\s\S]*?)(?=\n[- \t*]*(?:- \*\*|## |$))/i);
      if (relevanceMatch) grant.relevance = relevanceMatch[1].trim();

      // Extract Description
      const descMatch = section.match(/(?:^|\n)[- \t*]*(?:Beskrivning|Description|Om utlysningen|Info)\*\*?:\s*([\s\S]*?)(?=\n[- \t*]*(?:- \*\*|## |Relevans:|URL:|$))/i);
      if (descMatch) {
        grant.description = descMatch[1].trim();
      } else {
        // Fallback: use lines that don't match other fields
        const lines = section.split('\n').slice(1);
        grant.description = lines
          .filter(l => !l.match(/[- \t*]*(?:Finansiär|Deadline|Belopp|URL|Datum|Funder|Amount|Relevans|Beskrivning|##)/i) && l.trim().length > 5)
          .join(' ')
          .substring(0, 500)
          .trim();
      }

      // Determine category
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
        id: 'vinnova-1',
        name: 'Avancerad digitalisering - AI i offentlig sektor',
        funder: 'Vinnova',
        deadline: '2026-04-15',
        maxAmount: '5 000 000 kr',
        description: 'Stöd för projekt som utvecklar och implementerar AI-lösningar i offentlig verksamhet. Fokus på effektivisering och förbättrad service.',
        url: 'https://vinnova.se',
        relevance: 'Perfekt för SITK:s arbete med kommunala enheter. Möjlighet att skala AI-lösningar inom välfärdsteknik.',
        category: 'vinnova',
        status: 'open',
      },
      {
        id: 'vinnova-2',
        name: 'Tillämpad AI för industrin',
        funder: 'Vinnova',
        deadline: '2026-05-30',
        maxAmount: '3 000 000 kr',
        description: 'Samarbetsprojekt mellan akademi, industri och offentlig sektor för att utveckla praktiska AI-tillämpningar.',
        url: 'https://vinnova.se',
        relevance: 'SITK kan agera teknisk brygga mellan kommun och lokala företag. Kräver samarbete med minst två aktörer.',
        category: 'vinnova',
        status: 'open',
      },
      {
        id: 'tillvaxt-1',
        name: 'Regionalfondsprogrammet - Digital transformation',
        funder: 'Tillväxtverket / Region Gävleborg',
        deadline: '2026-03-31',
        maxAmount: '2 500 000 kr',
        description: 'Stöd för digital transformation och innovationskraft för SMF i Norra Mellansverige.',
        url: 'https://tillvaxtverket.se',
        relevance: 'Direkt koppling till SITK:s arbete med lokalt näringsliv. Sandbacka Science Park-faktorn ökar trovärdigheten.',
        category: 'tillvaxtverket',
        status: 'closing_soon',
      },
      {
        id: 'eu-1',
        name: 'Digital Europe Programme - AI Deployment',
        funder: 'EU / DIGITAL / Vinnova',
        deadline: '2026-06-15',
        maxAmount: '€500 000',
        description: 'EU-finansiering för utrullning av AI-lösningar inom offentlig sektor och SME.',
        url: 'https://digital-strategy.ec.europa.eu',
        relevance: 'Möjlighet till större EU-finansiering. Double Transition (digital + grön) är ett krav.',
        category: 'eu',
        status: 'open',
      },
      {
        id: 'arvsfonden-1',
        name: 'Social innovation för civilsamhället',
        funder: 'Arvsfonden',
        deadline: '2026-08-01',
        maxAmount: '1 500 000 kr',
        description: 'Stöd för projekt som utvecklar nya metoder och arbetssätt för ideell sektor.',
        url: 'https://arvsfonden.se',
        relevance: 'Passar SITK:s arbete med föreningslivet. AI för ideell sektor och gemenskapsbyggande.',
        category: 'other',
        status: 'open',
      },
      {
        id: 'postkod-1',
        name: 'Digitalisering för social hållbarhet',
        funder: 'Postkodstiftelsen',
        deadline: '2026-04-30',
        maxAmount: '2 000 000 kr',
        description: 'Stöd för projekt som använder digital teknik för att skapa sociala innovationer.',
        url: 'https://postkodstiftelsen.se',
        relevance: 'SITK:s fokus på AI för samhällsnytta passar väl med Postkodstiftelsens profil.',
        category: 'other',
        status: 'open',
      },
      {
        id: 'exp-1',
        name: 'Göranssonska Stiftelserna - Lokalt projektstöd 2026',
        funder: 'Göranssonska Stiftelserna',
        deadline: '2026-02-15',
        maxAmount: 'Upp till 1 000 000 kr',
        description: 'Stöd till lokala föreningar och projekt i Sandviken med omnejd. Fokus på social sammanhållning och utveckling.',
        url: 'https://www.goranssonskastiftelserna.se',
        relevance: 'Vår kärnfinansiär i Sandviken. Perfekt för regionala AI-initiativ.',
        category: 'region',
        status: 'open',
      },
      {
        id: 'exp-2',
        name: 'Digitalisering för hållbar tillväxt',
        funder: 'Tillväxtverket',
        deadline: '2026-05-10',
        maxAmount: '2 500 000 kr',
        description: 'Insatser som stärker digital mognad och hållbar innovation hos SMF.',
        url: 'https://tillvaxtverket.se',
        relevance: 'Matchar SITK:s fokus på regional digital transformation.',
        category: 'tillvaxtverket',
        status: 'open',
      },
      {
        id: 'exp-3',
        name: 'Innovationscheckar Gävleborg 2026',
        funder: 'Region Gävleborg',
        deadline: 'Löpande till juni 2026',
        maxAmount: '100 000 - 250 000 kr',
        description: 'Små checkar för att verifiera tekniska lösningar eller affärsidéer.',
        url: 'https://regiongavleborg.se',
        relevance: 'Låg tröskel för att testa nya AI-idéer i länet.',
        category: 'region',
        status: 'open',
      },
      {
        id: 'exp-4',
        name: 'AI i offentlig sektor - Utlysning 2026',
        funder: 'Vinnova',
        deadline: '2026-03-20',
        maxAmount: '4 000 000 kr',
        description: 'Avancerad digitalisering genom tillämpad AI i välfärden.',
        url: 'https://vinnova.se',
        relevance: 'Kärnan i SITK:s tekniska expertis.',
        category: 'vinnova',
        status: 'closing_soon',
      }
    ];
  }
}

export const apiService = new ApiService();
