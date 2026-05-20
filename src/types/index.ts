export interface Grant {
  id: string;
  name: string;
  funder: string;
  deadline: string;
  maxAmount?: string;
  description: string;
  url?: string;
  relevance?: string;
  category: 'vinnova' | 'tillvaxtverket' | 'region' | 'eu' | 'stiftelse' | 'other';
  status: 'open' | 'closing_soon' | 'closed';
}

export interface OrgProfile {
  name: string;
  description: string;
  focusAreas: string[];
  strengths: string[];
  partnerships: string[];
  region: string;
  orgType?: string;
  orgNr?: string;
  phone?: string;
}

// Funding entity from backend configuration
export interface FundingEntity {
  id: string;
  name: string;
  orgNr: string;
  phone: string;
  type: 'private' | 'nonprofit' | 'company' | 'holding';
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

/** Inställningar för utlysningssökning */
export interface GrantSearchOptions {
  /** Önskat antal utlysningar i svaret (ca) */
  targetCount?: number;
  /** quick=2 Exa, standard=4, broad=6 + stiftelser/fonder */
  searchMode?: 'quick' | 'standard' | 'broad';
  /** Kuraterad OpenRouter-modell (sparad i localStorage) */
  modelSettings?: ModelSettings;
}

/** Admin: val av OpenRouter-modell (kuraterad lista) */
export interface ModelSettings {
  presetId: 'recommended' | 'budget' | 'premium' | 'lottery' | 'custom';
  /** Planering / sökstrategi */
  reasonModel?: string;
  /** Syntes / ansökningar */
  proModel?: string;
}

export interface CuratedModelInfo {
  id: string;
  label: string;
  tier: string;
  badge: string;
  description: string;
}

export interface ModelPresetInfo {
  id: string;
  label: string;
  description: string;
  reason: string[];
  pro: string[];
}

export interface OpenRouterCreditsInfo {
  success: boolean;
  available: boolean;
  remainingCredits?: number;
  totalCredits?: number;
  totalUsage?: number;
  currency?: string;
  message?: string;
  note?: string;
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
  warning?: string;
}

export interface SimilarFundedProject {
  projectName: string;
  organization: string;
  year?: string;
  amount?: string;
  summary: string;
  url?: string;
}

export interface GrantIntelligence {
  success: boolean;
  grantName: string;
  funder: string;
  searchQueries?: string[];
  funderProfile: string;
  similarProjects: SimilarFundedProject[];
  eligibilityNotes: string;
  applicationTips: string;
  commonPitfalls: string;
  fitForOrg: string;
  rawSynthesis?: string;
}

// Portfolio / GitHub Archive types
export interface GitHubRepo {
  name: string;
  readme: string | null;
  packageJson: { name?: string; description?: string; version?: string } | null;
}

export interface PortfolioAccount {
  account: string;
  repoCount: number;
  repos: { name: string; path: string }[];
}

export interface PortfolioAccountDetail {
  account: string;
  repoCount: number;
  repos: GitHubRepo[];
}
