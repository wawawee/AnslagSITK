import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { OrgProfile } from '@/types';
import { Building2, ChevronDown, ChevronUp, User, Users, Pencil, CheckCircle2 } from 'lucide-react';

const STORAGE_KEY = 'sitk-org-profile';

const defaultProfile: OrgProfile = {
  name: '',
  description: '',
  focusAreas: [],
  strengths: [],
  partnerships: [],
  region: '',
};

export function loadStoredProfile(): OrgProfile | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function saveProfile(profile: OrgProfile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

interface OrgProfileCardProps {
  profile: OrgProfile;
  onChange: (profile: OrgProfile) => void;
}

type OrgType = 'Företag' | 'Förening' | 'Privatperson' | 'Annan';

const orgTypeIcons: Record<OrgType, React.ReactNode> = {
  Företag: <Building2 className="h-4 w-4" />,
  Förening: <Users className="h-4 w-4" />,
  Privatperson: <User className="h-4 w-4" />,
  Annan: <Building2 className="h-4 w-4" />,
};

export function OrgProfileCard({ profile, onChange }: OrgProfileCardProps) {
  const [expanded, setExpanded] = useState(!profile.name);
  const [orgType, setOrgType] = useState<OrgType>('Förening');
  const [orgNr, setOrgNr] = useState('');

  const isComplete = !!profile.name && !!profile.description;

  const handleSave = () => {
    saveProfile(profile);
    setExpanded(false);
  };

  const handleChange = (field: keyof OrgProfile, value: string | string[]) => {
    const updated = { ...profile, [field]: value };
    onChange(updated);
  };

  const handleFocusAreasChange = (val: string) => {
    handleChange('focusAreas', val.split(',').map(s => s.trim()).filter(Boolean));
  };

  const handleStrengthsChange = (val: string) => {
    handleChange('strengths', val.split(',').map(s => s.trim()).filter(Boolean));
  };

  const handlePartnersChange = (val: string) => {
    handleChange('partnerships', val.split(',').map(s => s.trim()).filter(Boolean));
  };

  if (!expanded) {
    return (
      <div
        className="flex items-center justify-between bg-muted/40 border rounded-xl px-4 py-3 cursor-pointer hover:bg-muted/60 transition-colors"
        onClick={() => setExpanded(true)}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            {orgTypeIcons[orgType]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{profile.name || 'Ingen profil'}</span>
              {isComplete && (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              )}
            </div>
            {profile.description && (
              <p className="text-xs text-muted-foreground line-clamp-1">{profile.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Pencil className="h-3.5 w-3.5" />
          <ChevronDown className="h-4 w-4" />
        </div>
      </div>
    );
  }

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-600" />
            Vem söker du anslag för?
          </CardTitle>
          {isComplete && (
            <Button variant="ghost" size="sm" onClick={() => setExpanded(false)} className="h-7 px-2 text-muted-foreground">
              <ChevronUp className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Fyll i uppgifterna så anpassas anslagen och ansökningarna automatiskt.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="org-name" className="text-xs">Namn *</Label>
            <Input
              id="org-name"
              placeholder="t.ex. Sandvikens IT Kår"
              value={profile.name}
              onChange={e => handleChange('name', e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label htmlFor="org-type" className="text-xs">Typ</Label>
            <Select value={orgType} onValueChange={v => setOrgType(v as OrgType)}>
              <SelectTrigger id="org-type" className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Företag">Företag</SelectItem>
                <SelectItem value="Förening">Förening / Ideell org</SelectItem>
                <SelectItem value="Privatperson">Privatperson</SelectItem>
                <SelectItem value="Annan">Annan</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="org-nr" className="text-xs">Org.nr (valfritt)</Label>
            <Input
              id="org-nr"
              placeholder="t.ex. 802477-XXXX"
              value={orgNr}
              onChange={e => setOrgNr(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label htmlFor="org-region" className="text-xs">Region</Label>
            <Input
              id="org-region"
              placeholder="t.ex. Gävleborg / Sandviken"
              value={profile.region}
              onChange={e => handleChange('region', e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="org-desc" className="text-xs">Verksamhetsbeskrivning *</Label>
          <Textarea
            id="org-desc"
            placeholder="Beskriv kort vad ni gör, t.ex. 'Vi är en IT-förening som arrangerar kurser och events i Sandviken...'"
            value={profile.description}
            onChange={e => handleChange('description', e.target.value)}
            rows={2}
            className="text-sm resize-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="org-focus" className="text-xs">Fokusområden (kommaseparerat)</Label>
            <Input
              id="org-focus"
              placeholder="t.ex. AI, Utbildning, Digital inkludering"
              value={profile.focusAreas.join(', ')}
              onChange={e => handleFocusAreasChange(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label htmlFor="org-strengths" className="text-xs">Styrkor (kommaseparerat)</Label>
            <Input
              id="org-strengths"
              placeholder="t.ex. Lokalt nätverk, Teknisk kompetens"
              value={profile.strengths.join(', ')}
              onChange={e => handleStrengthsChange(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="org-partners" className="text-xs">Samarbetspartners (kommaseparerat, valfritt)</Label>
          <Input
            id="org-partners"
            placeholder="t.ex. Sandvikens kommun, Högskolan i Gävle"
            value={profile.partnerships.join(', ')}
            onChange={e => handlePartnersChange(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button
            onClick={handleSave}
            disabled={!isComplete}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 h-8 text-xs"
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Spara profil
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
