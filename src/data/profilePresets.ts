import type { OrgProfile } from '@/types';

export interface ProfilePreset {
  id: string;
  label: string;
  profile: OrgProfile;
}

/** Profilmallar — klicka "Ladda mall" i utlysningssökningen */
export const PROFILE_PRESETS: ProfilePreset[] = [
  {
    id: 'twistedstacks',
    label: 'TwistedStacks (portfölj)',
    profile: {
      name: 'TwistedStacks',
      orgType: 'Företag',
      orgNr: '',
      region: 'Gävleborg / Sandviken',
      description:
        'TwistedStacks är en AI-driven produktstudio som utvecklar specialiserad mjukvara för små och medelstora företag, rådgivare och regional utveckling. Vi bygger en portfölj av vertikala verktyg på gemensam teknisk grund — öppen myndighetsdata, spårbar AI-analys och människa-i-loopen — så att komplex regelverkskunskap blir användbar i vardagen. Första produkten i drift är SkatteRevision (beslutsstöd så att företag betalar rätt skatt och rådgivare arbetar effektivare). Övriga projekt inkluderar AnslagSITK (AI-sökning av Vinnova-, Tillväxtverket- och EU-utlysningar), juridiskt beslutsstöd (LAGA), energi- och klimatanalys för industri (EnergiRevision) samt en multi-agent-plattform för research och automation. Verksamheten bedrivs som enskild firma under varumärket TwistedStacks; aktiebolag planeras när volym och finansiering motiverar det. Vi samverkar med regionala aktörer och söker stöd för innovation, digitalisering av SME-tjänster och hållbar omställning.',
      focusAreas: [
        'AI-driven mjukvara och beslutsstöd',
        'Digitalisering för SME',
        'Skatte- och redovisningstech',
        'Legal tech och compliance',
        'Energi, klimat och industriell omställning',
        'Innovationsfinansiering och regional utveckling',
        'Öppen data och myndighetsintegration',
      ],
      strengths: [
        'Portfölj av specialiserade produkter på gemensam AI-plattform',
        'Domänkunskap: skatt, energi, juridik, finansiering',
        'iXBRL, Bolagsverket, SCB och rättskällor i pipeline',
        'Multi-agent-arkitektur med källhänvisning (zero hallucination)',
        'Snabb väg från prototyp till produktion (Vercel, öppen stack)',
        'B2B-modell mot rådgivare, byråer och regionala partners',
      ],
      partnerships: [
        'Sandvikens IT-Kår (regional förankring)',
        'Redovisnings- och skattekonsulter (pilot)',
        'Göranssonska stiftelserna / regionala nätverk (mål)',
      ],
    },
  },
];

export function getProfilePreset(id: string): OrgProfile | undefined {
  return PROFILE_PRESETS.find(p => p.id === id)?.profile;
}
