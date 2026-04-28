import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { apiService } from '@/services/api';
import type { ApplicationDraft, Grant, ProjectInfo, OrgProfile } from '@/types';
import { BookOpen, Building2, Calendar, ChevronLeft, ChevronRight, Clock, Download, Euro, FileText, Lightbulb, Save, Share2, Sparkles, Target, Users, Wallet, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface ApplicationWriterProps {
  selectedGrant: Grant | null;
  orgProfile?: OrgProfile;
}

const defaultOrgProfile: OrgProfile = {
  name: 'SITK (Sandvikens IT Kår) / AI Startup',
  description: 'Vi utvecklar AI-lösningar för att effektivisera verksamheter och skapa värde.',
  focusAreas: [
    'AI för effektivisering',
    'Offentliga enheter och näringsliv'
  ],
  strengths: [
    'Praktisk AI-implementering',
    'Innovation och teknik'
  ],
  partnerships: [],
  region: 'Sverige',
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

export function ApplicationWriter({ selectedGrant, orgProfile: externalProfile }: ApplicationWriterProps) {
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

  const [proposals, setProposals] = useState<ProjectInfo[]>([]);
  // Use the externally-provided profile (from App-level state) if available and filled in,
  // otherwise fall back to the hardcoded default so the writer still works standalone.
  const resolvedDefault = externalProfile?.name ? externalProfile : defaultOrgProfile;
  const [profile, setProfile] = useState<OrgProfile>(resolvedDefault);

  const generateProjectProposal = async () => {
    if (!selectedGrant) {
      toast.error('Välj en utlysning först');
      return;
    }

    setGenerating(true);
    try {
      const generated = await apiService.generateProposals(selectedGrant, profile, 2);
      if (generated && generated.length > 0) {
        setProposals(generated);
        setProjectInfo(generated[0]);
        toast.success('Projektförslag genererade!');
      } else {
        toast.error('Kunde inte generera förslag');
      }
    } catch (error) {
      toast.error('Fel vid generering');
    } finally {
      setGenerating(false);
    }
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
        profile
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
      {/* Profil-inställning (enkel för nu) */}
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="text-sm">Din Organisationsprofil (Redigera vid behov)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Namn</Label>
            <Input value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} />
          </div>
          <div>
            <Label>Kort Beskrivning</Label>
            <Input value={profile.description} onChange={e => setProfile({...profile, description: e.target.value})} />
          </div>
        </CardContent>
      </Card>

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

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-medium">{steps[currentStep].label}</span>
          <span className="text-muted-foreground">Steg {currentStep + 1} av {steps.length}</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

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
              proposals={proposals}
              onSelectProposal={setProjectInfo}
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
    </div>
  );
}

interface ProjectInfoStepProps {
  projectInfo: ProjectInfo;
  onChange: (info: ProjectInfo) => void;
  onGenerateProposal: () => void;
  generating: boolean;
  proposals: ProjectInfo[];
  onSelectProposal: (p: ProjectInfo) => void;
}

function ProjectInfoStep({ projectInfo, onChange, onGenerateProposal, generating, proposals, onSelectProposal }: ProjectInfoStepProps) {
  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-purple-600 to-pink-500 rounded-xl p-5 text-white">
        <div className="flex items-start gap-4">
          <div className="bg-white/20 p-3 rounded-lg">
            <Wand2 className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-lg mb-1">AI-Generera Förslag</h4>
            <p className="text-purple-100 text-sm mb-3">
              Låt Gemini skapa projektförslag skräddarsydda för din profil och utlysningen.
            </p>
            <Button
              onClick={onGenerateProposal}
              disabled={generating}
              className="bg-white text-purple-600 hover:bg-purple-50"
            >
              <Lightbulb className="h-4 w-4 mr-2" />
              {generating ? 'Genererar förslag...' : 'Skapa 2 unika projektförslag'}
            </Button>
          </div>
        </div>
      </div>

      {proposals.length > 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 mb-4">
           {proposals.map((p, idx) => (
             <Card key={idx} className={`cursor-pointer transition-all ${projectInfo.title === p.title ? 'ring-2 ring-purple-500' : 'hover:bg-muted/50'}`} onClick={() => onSelectProposal(p)}>
               <CardHeader className="p-4"><CardTitle className="text-sm">{p.title}</CardTitle></CardHeader>
             </Card>
           ))}
        </div>
      )}

      <div>
        <Label htmlFor="title">Projekttitel *</Label>
        <Input
          id="title"
          value={projectInfo.title}
          onChange={(e) => onChange({ ...projectInfo, title: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="description">Projektbeskrivning</Label>
        <Textarea
          id="description"
          value={projectInfo.description}
          onChange={(e) => onChange({ ...projectInfo, description: e.target.value })}
          rows={3}
        />
      </div>
      <div>
        <Label htmlFor="goals">Projektets mål</Label>
        <Textarea
          id="goals"
          value={projectInfo.goals}
          onChange={(e) => onChange({ ...projectInfo, goals: e.target.value })}
          rows={2}
        />
      </div>
      <div>
        <Label htmlFor="targetGroup">Målgrupp</Label>
        <Input
          id="targetGroup"
          value={projectInfo.targetGroup}
          onChange={(e) => onChange({ ...projectInfo, targetGroup: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="budget">Budget</Label>
          <Input
            id="budget"
            value={projectInfo.budget}
            onChange={(e) => onChange({ ...projectInfo, budget: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="timeline">Tidsplan</Label>
          <Input
            id="timeline"
            value={projectInfo.timeline}
            onChange={(e) => onChange({ ...projectInfo, timeline: e.target.value })}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="partners">Samarbetspartners</Label>
        <Input
          id="partners"
          value={Array.isArray(projectInfo.partners) ? projectInfo.partners.join(', ') : projectInfo.partners}
          onChange={(e) => onChange({ ...projectInfo, partners: e.target.value.split(',').map(s => s.trim()) })}
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
    </div>
  );
}
