import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { apiService } from '@/services/api';
import type { ApplicationDraft, Grant, ProjectInfo, SITKProfile } from '@/types';
import { BookOpen, Building2, Calendar, ChevronLeft, ChevronRight, Clock, Download, Euro, FileText, Lightbulb, Save, Share2, Sparkles, Target, Users, Wallet, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface ApplicationWriterProps {
  selectedGrant: Grant | null;
}

const defaultSITKProfile: SITKProfile = {
  name: 'SITK (Sandvikens IT Kår)',
  description: 'En aktör i Sandviken som utvecklar AI-lösningar för att effektivisera och stötta offentliga enheter, lokalt näringsliv och föreningsliv.',
  focusAreas: [
    'Offentliga/kommunala enheter',
    'Lokalt näringsliv och SMF',
    'Föreningsliv och civilsamhälle',
  ],
  strengths: [
    'Samarbete med Sandbacka Science Park',
    'Fokus på praktisk implementering av AI',
    'Expertis inom "Gemensamma AI-förmågor"',
    'Regional förankring i Gävleborg',
  ],
  partnerships: [
    'Sandbacka Science Park',
    'Sandvikens kommun',
    'Region Gävleborg',
    'Lokala näringslivet',
  ],
  region: 'Gävleborg / Norra Mellansverige',
};

const steps = [
  { id: 'project', label: 'Projektinfo', icon: Target },
  { id: 'summary', label: 'Sammanfattning', icon: FileText },
  { id: 'description', label: 'Beskrivning', icon: BookOpen },
  { id: 'goals', label: 'Mål', icon: Target },
  { id: 'implementation', label: 'Genomförande', icon: Clock },
  { id: 'budget', label: 'Budget', icon: Wallet },
  { id: 'competence', label: 'Kompetens', icon: Users },
  { id: 'dissemination', label: 'Spridning', icon: Share2 },
];

export function ApplicationWriter({ selectedGrant }: ApplicationWriterProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<ApplicationDraft | null>(null);

  const [projectInfo, setProjectInfo] = useState<ProjectInfo>({
    title: '',
    description: '',
    goals: '',
    targetGroup: '',
    budget: '',
    timeline: '',
    partners: [],
  });

  // Generate a complete project proposal based on the grant and SITK profile
  const generateProjectProposal = () => {
    if (!selectedGrant) {
      toast.error('Välj en utlysning först');
      return;
    }

    setGenerating(true);

    // Simulate AI generation delay
    setTimeout(() => {
      const proposal = createProjectProposal(selectedGrant, defaultSITKProfile);
      setProjectInfo(proposal);
      toast.success('Projektförslag genererat! Granska och justera efter behov.');
      setGenerating(false);
    }, 1500);
  };

  const generateDraft = async () => {
    if (!selectedGrant) {
      toast.error('Välj en utlysning först');
      return;
    }

    setGenerating(true);
    try {
      const result = await apiService.generateApplication(
        selectedGrant,
        projectInfo as ProjectInfo,
        defaultSITKProfile as SITKProfile
      );
      setDraft(result);
      toast.success('Ansökningsutkast genererat!');
    } catch (error) {
      toast.error('Kunde inte generera ansökan');
    } finally {
      setGenerating(false);
    }
  };

  const saveDraft = () => {
    if (draft) {
      const drafts = JSON.parse(localStorage.getItem('sitk-drafts') || '[]');
      drafts.push(draft);
      localStorage.setItem('sitk-drafts', JSON.stringify(drafts));
      toast.success('Utkast sparat!');
    }
  };

  const downloadDraft = () => {
    if (draft) {
      const content = `
# ${projectInfo.title}

## Sammanfattning
${draft.content.summary}

## Projektbeskrivning
${draft.content.projectDescription}

## Mål och förväntade resultat
${draft.content.goals}

## Genomförandeplan
${draft.content.implementation}

## Budget
${draft.content.budget}

## Organisationens kompetens
${draft.content.competence}

## Nyttjanderätt och spridning
${draft.content.dissemination}
      `.trim();

      const blob = new Blob([content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ansokan-${selectedGrant?.id || 'utkast'}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Ansökan nedladdad!');
    }
  };

  const progress = ((currentStep + 1) / steps.length) * 100;

  if (!selectedGrant) {
    return (
      <div className="text-center py-12">
        <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Ingen utlysning vald</h3>
        <p className="text-muted-foreground max-w-md mx-auto">
          Gå till "Sök utlysningar" och välj en utlysning för att börja skriva din ansökan.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Grant Info Banner */}
      <div className="bg-gradient-to-r from-blue-600 to-cyan-500 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <Badge className="bg-white/20 text-white border-0 mb-2">
              Vald utlysning
            </Badge>
            <h2 className="text-xl font-bold">{selectedGrant.name}</h2>
            <div className="flex items-center gap-4 mt-2 text-sm text-blue-100">
              <span className="flex items-center gap-1">
                <Building2 className="h-4 w-4" />
                {selectedGrant.funder}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                Deadline: {selectedGrant.deadline}
              </span>
              {selectedGrant.maxAmount && (
                <span className="flex items-center gap-1">
                  <Euro className="h-4 w-4" />
                  {selectedGrant.maxAmount}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">{steps[currentStep].label}</span>
          <span className="text-muted-foreground">Steg {currentStep + 1} av {steps.length}</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Step Navigation */}
      <div className="flex flex-wrap gap-2">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <Button
              key={step.id}
              variant={currentStep === index ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCurrentStep(index)}
              className={currentStep === index ? 'bg-blue-600 hover:bg-blue-700' : ''}
            >
              <Icon className="h-4 w-4 mr-1" />
              {step.label}
            </Button>
          );
        })}
      </div>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {(() => {
              const Icon = steps[currentStep].icon;
              return <Icon className="h-5 w-5 text-blue-600" />;
            })()}
            {steps[currentStep].label}
          </CardTitle>
          <CardDescription>
            Fyll i information för att generera ett professionellt ansökningsutkast.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentStep === 0 && (
            <ProjectInfoStep
              projectInfo={projectInfo}
              onChange={setProjectInfo}
              onGenerateProposal={generateProjectProposal}
              generating={generating}
            />
          )}
          {currentStep > 0 && draft && (
            <ApplicationContentStep
              stepId={steps[currentStep].id}
              content={draft.content}
              onChange={(key, value) => {
                setDraft({
                  ...draft,
                  content: { ...draft.content, [key]: value }
                });
              }}
            />
          )}
          {currentStep > 0 && !draft && (
            <div className="text-center py-8">
              <Sparkles className="h-12 w-12 text-blue-300 mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                Generera ett utkast för att se och redigera innehållet
              </p>
              <Button onClick={generateDraft} disabled={generating} className="bg-blue-600 hover:bg-blue-700">
                <Sparkles className="h-4 w-4 mr-2" />
                {generating ? 'Genererar...' : 'Generera utkast'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Föregående
        </Button>

        <div className="flex gap-2">
          {draft && (
            <>
              <Button variant="outline" onClick={saveDraft}>
                <Save className="h-4 w-4 mr-2" />
                Spara
              </Button>
              <Button variant="outline" onClick={downloadDraft}>
                <Download className="h-4 w-4 mr-2" />
                Ladda ner
              </Button>
            </>
          )}
          <Button
            onClick={() => {
              if (currentStep === steps.length - 1) {
                downloadDraft();
              } else {
                setCurrentStep(Math.min(steps.length - 1, currentStep + 1));
              }
            }}
            disabled={currentStep === 0 && !projectInfo.title}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {currentStep === steps.length - 1 ? 'Slutför' : 'Nästa'}
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>

      {/* SITK Profile Card */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-sm">SITK-profil (används i ansökan)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p className="mb-2"><strong>{defaultSITKProfile.name}</strong></p>
          <p className="mb-2">{defaultSITKProfile.description}</p>
          <div className="flex flex-wrap gap-1">
            {defaultSITKProfile.strengths.map((strength, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {strength}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Create a project proposal based on grant type and SITK profile
function createProjectProposal(grant: Grant, profile: SITKProfile): ProjectInfo {
  const grantCategory = grant.category;

  // Base proposals for different grant categories
  const proposals: Record<string, ProjectInfo> = {
    vinnova: {
      title: 'Gemensamma AI-förmågor för offentlig sektor - En praktisk implementering i Sandvikens kommun',
      description: `Projektet syftar till att utveckla och implementera AI-baserade lösningar som effektiviserar och förbättrar verksamheten hos offentliga aktörer i Sandviken och Gävleborgsregionen. Genom samarbete med ${profile.partnerships[0]} och ${profile.partnerships[1]} skapar vi en modell för praktisk AI-implementering som kan skalas till andra kommuner.

Projektet fokuserar på att utveckla "Gemensamma AI-förmågor" - en plattform och metodik för att dela AI-lösningar, data och kompetens mellan olika offentliga organisationer. Detta minskar dubbelarbete och maximerar nyttan av varje investering i AI.`,
      goals: 'Utveckla och implementera minst tre praktiska AI-lösningar inom kommunal verksamhet. Bygga en plattform för delning av AI-förmågor mellan kommuner. Utbilda minst 50 tjänstemän i AI-användning. Skapa en modell för hållbar drift och vidareutveckling. Mäta och dokumentera effektiviseringsvinster.',
      targetGroup: 'Kommunala tjänstemän och handläggare inom Sandvikens kommun och intresserade kommuner i Gävleborgsregionen',
      budget: grant.maxAmount || '3 000 000',
      timeline: '18 månader (januari 2026 - juni 2027)',
      partners: ['Sandvikens kommun', 'Sandbacka Science Park', 'Region Gävleborg'],
    },
    tillvaxtverket: {
      title: 'AI för lokal tillväxt - Digital transformation av SMF i Gävleborg',
      description: `Projektet ska stötta små och medelstora företag i Gävleborgsregionen att införa AI-teknik för att öka sin konkurrenskraft och effektivisera sin verksamhet. Genom ${profile.name} och vårt samarbete med ${profile.partnerships[0]} erbjuder vi kostnadsfri rådgivning, utbildning och praktisk implementeringsstöd.

Vi fokuserar särskilt på att hjälpa företag att använda AI för automatisering av administrativa uppgifter, förbättrad kundkommunikation och datadriven beslutsfattning. Projektet bidrar till regionens mål om ökad digital mognad och stärkt innovationskraft.`,
      goals: 'Stötta minst 30 SMF med AI-rådgivning och implementering. Genomföra 10 AI-workshops för företagare. Skapa en regional AI-hub för kunskapsdelning. Dokumentera och sprida best practices. Bygga långsiktiga samarbeten mellan företag och AI-experter.',
      targetGroup: 'Små och medelstora företag (SMF) i Gävleborgsregionen, särskilt inom tillverkning, tjänster och handel',
      budget: grant.maxAmount || '2 500 000',
      timeline: '24 månader (mars 2026 - februari 2028)',
      partners: ['Sandbacka Science Park', 'Almi Gävleborg', 'Företagarna Gävleborg'],
    },
    eu: {
      title: 'Digital Europe Deployment - AI för offentlig effektivisering och grön omställning',
      description: `Detta projekt kombinerar digital transformation med grön omställning genom att implementera AI-lösningar som både effektiviserar offentlig verksamhet och minskar miljöpåverkan. ${profile.name} leder arbetet med att utveckla AI-verktyg för resursoptimering, prediktivt underhåll och hållbarhetsrapportering.

Projektet är en del av Double Transition-satsningen och skapar en modell för hur offentliga organisationer kan använda AI för att uppnå både digitala och miljömässiga mål. Resultaten sprids inom EU:s Digital Europe-program.`,
      goals: 'Implementera AI-lösningar som minskar resursförbrukning med minst 15%. Utveckla verktyg för automatiserad hållbarhetsrapportering. Skapa en EU-spridd playbook för AI-driven grön omställning. Utbilda europeiska kommuner i projektets metoder.',
      targetGroup: 'Offentliga organisationer i Sverige och EU som vill kombinera digitalisering med miljömål',
      budget: grant.maxAmount || '€500 000',
      timeline: '36 månader (januari 2026 - december 2028)',
      partners: ['Sandvikens kommun', 'Sandbacka Science Park', 'DIGG', 'Internationella kommunnätverk'],
    },
    other: {
      title: 'AI för social innovation - Stärkt civilsamhälle och föreningsliv',
      description: `Projektet utforskar hur AI kan stötta ideella organisationer och föreningslivet att bli mer effektiva och nå fler med sin verksamhet. ${profile.name} utvecklar användarvänliga AI-verktyg som hjälper föreningar med kommunikation, medlemshantering och verksamhetsplanering.

Särskilt fokus läggs på att göra AI tillgängligt för små föreningar utan teknisk expertis, och att skapa en community där föreningar kan dela erfarenheter och stötta varandra.`,
      goals: 'Utveckla AI-verktyg anpassade för föreningslivets behov. Stötta minst 50 föreningar med AI-implementering. Skapa en peer-learning-community för förenings-AI. Dokumentera sociala effekter och inkluderingsvinster. Bygga en hållbar modell för fortsatt stöd.',
      targetGroup: 'Ideella föreningar, civilsamhällesorganisationer och volontärgrupper i Gävleborgsregionen',
      budget: grant.maxAmount || '1 500 000',
      timeline: '12 månader (april 2026 - mars 2027)',
      partners: ['Studieförbund', 'Föreningsråd', 'Civilsamhällesorganisationer'],
    },
  };

  // Return proposal based on category, fallback to vinnova if not found
  return proposals[grantCategory] || proposals.vinnova;
}

interface ProjectInfoStepProps {
  projectInfo: ProjectInfo;
  onChange: (info: ProjectInfo) => void;
  onGenerateProposal: () => void;
  generating: boolean;
}

function ProjectInfoStep({ projectInfo, onChange, onGenerateProposal, generating }: ProjectInfoStepProps) {
  const hasContent = projectInfo.title || projectInfo.description;

  return (
    <div className="space-y-4">
      {/* Generate Proposal Banner */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-500 rounded-xl p-5 text-white">
        <div className="flex items-start gap-4">
          <div className="bg-white/20 p-3 rounded-lg">
            <Wand2 className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-lg mb-1">Generera projektförslag automatiskt</h4>
            <p className="text-purple-100 text-sm mb-3">
              Låt AI skapa ett komplett projektförslag baserat på utlysningen och SITK:s profil.
              Du kan sedan granska och justera förslaget efter behov.
            </p>
            <Button
              onClick={onGenerateProposal}
              disabled={generating}
              className="bg-white text-purple-600 hover:bg-purple-50"
            >
              <Lightbulb className="h-4 w-4 mr-2" />
              {generating ? 'Genererar förslag...' : 'Skapa projektförslag'}
            </Button>
          </div>
        </div>
      </div>

      {/* Or divider */}
      {hasContent && (
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-muted-foreground">eller redigera manuellt</span>
          </div>
        </div>
      )}
      <div>
        <Label htmlFor="title">Projekttitel *</Label>
        <Input
          id="title"
          value={projectInfo.title}
          onChange={(e) => onChange({ ...projectInfo, title: e.target.value })}
          placeholder="T.ex. AI-baserad effektivisering av kommunal ärendehantering"
        />
      </div>

      <div>
        <Label htmlFor="description">Projektbeskrivning</Label>
        <Textarea
          id="description"
          value={projectInfo.description}
          onChange={(e) => onChange({ ...projectInfo, description: e.target.value })}
          placeholder="Beskriv kort vad projektet handlar om och vilket problem det löser..."
          rows={3}
        />
      </div>

      <div>
        <Label htmlFor="goals">Projektets mål</Label>
        <Textarea
          id="goals"
          value={projectInfo.goals}
          onChange={(e) => onChange({ ...projectInfo, goals: e.target.value })}
          placeholder="Vad ska projektet uppnå? Vilka är de konkreta målen?"
          rows={2}
        />
      </div>

      <div>
        <Label htmlFor="targetGroup">Målgrupp</Label>
        <Input
          id="targetGroup"
          value={projectInfo.targetGroup}
          onChange={(e) => onChange({ ...projectInfo, targetGroup: e.target.value })}
          placeholder="T.ex. Kommunala handläggare, lokala företag, föreningar..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="budget">Budget (kr)</Label>
          <Input
            id="budget"
            value={projectInfo.budget}
            onChange={(e) => onChange({ ...projectInfo, budget: e.target.value })}
            placeholder="T.ex. 2 500 000"
          />
        </div>
        <div>
          <Label htmlFor="timeline">Tidsplan</Label>
          <Input
            id="timeline"
            value={projectInfo.timeline}
            onChange={(e) => onChange({ ...projectInfo, timeline: e.target.value })}
            placeholder="T.ex. 12 månader (jan-dec 2026)"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="partners">Samarbetspartners (kommaseparerade)</Label>
        <Input
          id="partners"
          value={projectInfo.partners.join(', ')}
          onChange={(e) => onChange({ ...projectInfo, partners: e.target.value.split(',').map(s => s.trim()) })}
          placeholder="T.ex. Sandvikens kommun, Sandbacka Science Park..."
        />
      </div>
    </div>
  );
}

interface ApplicationContentStepProps {
  stepId: string;
  content: ApplicationDraft['content'];
  onChange: (key: keyof ApplicationDraft['content'], value: string) => void;
}

function ApplicationContentStep({ stepId, content, onChange }: ApplicationContentStepProps) {
  const contentMap: Record<string, { label: string; value: string; key: keyof ApplicationDraft['content'] }> = {
    summary: { label: 'Sammanfattning', value: content.summary, key: 'summary' },
    description: { label: 'Projektbeskrivning', value: content.projectDescription, key: 'projectDescription' },
    goals: { label: 'Mål och resultat', value: content.goals, key: 'goals' },
    implementation: { label: 'Genomförandeplan', value: content.implementation, key: 'implementation' },
    budget: { label: 'Budget', value: content.budget, key: 'budget' },
    competence: { label: 'Organisationens kompetens', value: content.competence, key: 'competence' },
    dissemination: { label: 'Nyttjanderätt och spridning', value: content.dissemination, key: 'dissemination' },
  };

  const item = contentMap[stepId];
  if (!item) return null;

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={stepId}>{item.label}</Label>
        <Textarea
          id={stepId}
          value={item.value}
          onChange={(e) => onChange(item.key, e.target.value)}
          rows={15}
          className="font-mono text-sm"
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Redigera texten ovan för att anpassa ansökan efter dina behov.
        Texten är förgenererad baserat på projektinformationen och SITK:s profil.
      </p>
    </div>
  );
}
