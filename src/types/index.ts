export interface Grant {
  id: string;
  name: string;
  funder: string;
  deadline: string;
  maxAmount?: string;
  description: string;
  url?: string;
  relevance?: string;
  category: 'vinnova' | 'tillvaxtverket' | 'region' | 'eu' | 'other';
  status: 'open' | 'closing_soon' | 'closed';
}

export interface OrgProfile {
  name: string;
  description: string;
  focusAreas: string[];
  strengths: string[];
  partnerships: string[];
  region: string;
}

export interface ProjectInfo {
  title: string;
  description: string;
  goals: string;
  targetGroup: string;
  budget: string;
  timeline: string;
  partners: string[];
}

export interface ApplicationDraft {
  id: string;
  grantId: string;
  projectInfo: ProjectInfo;
  content: {
    summary: string;
    projectDescription: string;
    goals: string;
    implementation: string;
    budget: string;
    competence: string;
    dissemination: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface SearchFilters {
  category?: string;
  status?: string;
  funder?: string;
  deadline?: string;
}

export interface BrowserUseResponse {
  output?: string;
  result?: string | Record<string, unknown>;
  error?: string;
  success?: boolean;
}

export interface DeepSearchStepResult {
  step: string;
  output?: string;
  error?: string;
}

export interface DeepSearchResponse {
  success: boolean;
  plan: string[];
  rawResults: DeepSearchStepResult[];
  synthesis: string;
}
