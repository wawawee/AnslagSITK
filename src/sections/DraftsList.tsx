import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ApplicationDraft } from '@/types';
import { Calendar, Download, Edit, Euro, FileText, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface DraftsListProps {
  onResumeDraft?: (draft: ApplicationDraft) => void;
}

export function DraftsList({ onResumeDraft }: DraftsListProps = {}) {
  const [drafts, setDrafts] = useState<ApplicationDraft[]>(() => {
    const saved = localStorage.getItem('sitk-drafts');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedDraft, setSelectedDraft] = useState<ApplicationDraft | null>(null);

  const deleteDraft = (id: string) => {
    const updated = drafts.filter(d => d.id !== id);
    localStorage.setItem('sitk-drafts', JSON.stringify(updated));
    setDrafts(updated);
    toast.success('Utkast raderat');
  };

  const downloadDraft = (draft: ApplicationDraft) => {
    const content = `
# ${draft.projectInfo.title}

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
    a.download = `ansokan-${draft.id}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Ansökan nedladdad!');
  };

  if (drafts.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Inga sparade utkast</h3>
        <p className="text-muted-foreground max-w-md mx-auto">
          När du skriver ansökningar kan du spara dem här för att fortsätta senare.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Mina ansökningsutkast</h2>
        <Badge variant="secondary">{drafts.length} utkast</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {drafts.map((draft) => (
          <Card key={draft.id} className="card-hover">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <FileText className="h-8 w-8 text-blue-600" />
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => downloadDraft(draft)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500 hover:text-red-700"
                    onClick={() => deleteDraft(draft.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <CardTitle className="text-lg line-clamp-2">
                {draft.projectInfo.title || 'Namnlöst projekt'}
              </CardTitle>
              <CardDescription className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Skapat {new Date(draft.createdAt).toLocaleDateString('sv-SE')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                {draft.projectInfo.description || 'Ingen beskrivning'}
              </p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {draft.projectInfo.budget && (
                  <span className="flex items-center gap-1">
                    <Euro className="h-3 w-3" />
                    {draft.projectInfo.budget}
                  </span>
                )}
                {draft.projectInfo.timeline && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {draft.projectInfo.timeline}
                  </span>
                )}
              </div>
              <div className="flex gap-2 mt-4">
                <Button
                  variant="ghost"
                  className="flex-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                  onClick={() => setSelectedDraft(draft)}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Detaljer
                </Button>
                {onResumeDraft && (
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-xs"
                    onClick={() => onResumeDraft(draft)}
                  >
                    Återuppta →
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Draft Detail Dialog */}
      <Dialog open={!!selectedDraft} onOpenChange={() => setSelectedDraft(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          {selectedDraft && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedDraft.projectInfo.title}</DialogTitle>
                <DialogDescription>
                  Skapat {new Date(selectedDraft.createdAt).toLocaleDateString('sv-SE')}
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="max-h-[60vh]">
                <div className="space-y-6 pr-4">
                  <div>
                    <h4 className="font-semibold mb-2">Projektinformation</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Målgrupp:</span>
                        <p>{selectedDraft.projectInfo.targetGroup || '-'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Budget:</span>
                        <p>{selectedDraft.projectInfo.budget || '-'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Tidsplan:</span>
                        <p>{selectedDraft.projectInfo.timeline || '-'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Partners:</span>
                        <p>{selectedDraft.projectInfo.partners.join(', ') || '-'}</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Sammanfattning</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {selectedDraft.content.summary}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Projektbeskrivning</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {selectedDraft.content.projectDescription}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Mål och resultat</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {selectedDraft.content.goals}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Genomförande</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {selectedDraft.content.implementation}
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold mb-2">Budget</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {selectedDraft.content.budget}
                    </p>
                  </div>
                </div>
              </ScrollArea>

              <div className="flex gap-3 pt-4">
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  onClick={() => downloadDraft(selectedDraft)}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Ladda ner
                </Button>
                <Button variant="outline" onClick={() => setSelectedDraft(null)}>
                  Stäng
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
