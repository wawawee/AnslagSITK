import { Login } from '@/components/Login';
import { loadStoredProfile } from '@/components/OrgProfileCard';
import { Toaster } from '@/components/ui/sonner';
import { AgentIntelligence } from '@/sections/AgentIntelligence';
import { ApplicationWriter } from '@/sections/ApplicationWriter';
import { DraftsList } from '@/sections/DraftsList';
import { GrantSearch } from '@/sections/GrantSearch';
import { Header } from '@/sections/Header';
import type { Grant, OrgProfile } from '@/types';
import { useState } from 'react';
import './App.css';

const defaultOrgProfile: OrgProfile = {
  name: '',
  description: '',
  focusAreas: [],
  strengths: [],
  partnerships: [],
  region: '',
};

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem('sitk-admin-auth') === 'true';
  });
  const [activeTab, setActiveTab] = useState('search');
  const [selectedGrant, setSelectedGrant] = useState<Grant | null>(null);
  const [orgProfile, setOrgProfile] = useState<OrgProfile>(() => {
    return loadStoredProfile() ?? defaultOrgProfile;
  });

  const handleSelectGrant = (grant: Grant) => {
    setSelectedGrant(grant);
    setActiveTab('writer');
  };

  const handleLogout = () => {
    localStorage.removeItem('sitk-admin-auth');
    setIsLoggedIn(false);
  };

  if (!isLoggedIn) {
    return (
      <>
        <Toaster position="top-right" richColors />
        <Login onLogin={() => setIsLoggedIn(true)} />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-right" richColors />

      <Header activeTab={activeTab} onTabChange={setActiveTab} onLogout={handleLogout} />

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'search' && (
          <GrantSearch
            onSelectGrant={handleSelectGrant}
            orgProfile={orgProfile}
            onOrgProfileChange={setOrgProfile}
          />
        )}

        {activeTab === 'writer' && (
          <ApplicationWriter selectedGrant={selectedGrant} orgProfile={orgProfile} />
        )}

        {activeTab === 'drafts' && (
          <DraftsList />
        )}

        {activeTab === 'intelligence' && (
          <AgentIntelligence />
        )}
      </main>

      <footer className="border-t mt-16 py-8">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-center md:text-left">
              <p className="font-semibold">SITK Agent</p>
              <p className="text-sm text-muted-foreground">
                AI-driven ansökningshjälp för Sandvikens IT Kår
              </p>
            </div>
            <div className="text-sm text-muted-foreground">
              <p>Powered by Browser Use API</p>
              <p>© 2026 SITK - Sandvikens IT Kår</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
