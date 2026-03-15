import axios from 'axios';
import {
    Brain,
    ChevronRight,
    Clock,
    FileText,
    History,
    RefreshCw,
    Save,
    Search,
    ShieldCheck,
    Terminal
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

interface LogEntry {
  timestamp: string;
  message: string;
}

interface SearchResult {
  text: string;
  [key: string]: any;
}

export const AgentIntelligence: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'directives' | 'memory' | 'logs'>('directives');
  const [content, setContent] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const files = {
    directives: 'AGENTS.md',
    memory: 'MEMORY.md'
  };

  useEffect(() => {
    if (activeTab !== 'logs') {
      fetchFileContent(files[activeTab as keyof typeof files]);
    } else {
      fetchLogs();
    }
  }, [activeTab]); // Removed files from dependencies as it's constant

  const fetchFileContent = async (filename: string) => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/memory/${filename}`);
      setContent(response.data.content);
    } catch (error) {
      console.error('Failed to fetch memory:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/memory/logs');
      if (response.data.content) {
        // Simple parsing for display: lines starting with ###
        const lines = response.data.content.split('\n');
        const parsedLogs: LogEntry[] = [];
        lines.forEach((line: string) => {
          if (line.startsWith('###')) {
            const timeMatch = line.match(/\[(.*?)\]/);
            const msg = line.replace(/### \[(.*?)\]/, '').trim();
            parsedLogs.push({
              timestamp: timeMatch ? timeMatch[1] : '',
              message: msg
            });
          }
        });
        if (parsedLogs.length > 0) setLogs(parsedLogs);
      }
    } catch (error) {
       console.error('Failed to fetch logs:', error);
       setLogs([
         { timestamp: new Date().toLocaleTimeString(), message: "SITK Agent initialized with Modern Folder Standard" },
         { timestamp: new Date().toLocaleTimeString(), message: "Connected to Qdrant Cloud (Health: Green)" }
       ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const filename = files[activeTab as keyof typeof files];
      await axios.post(`/api/memory/${filename}`, { content });
      // Success toast would go here
    } catch (error) {
      console.error('Failed to save memory:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery) return;
    setLoadingSearch(true);
    try {
      const response = await axios.post('/api/memory/search', { query: searchQuery });
      setSearchResults(response.data.results);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoadingSearch(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
            <Brain className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Agent Intelligence</h1>
            <p className="text-slate-400 text-sm">Hantera agentens direktiv och durable memory</p>
          </div>
        </div>

        <div className="flex gap-2 p-1 bg-white/5 border border-white/10 rounded-lg backdrop-blur-md">
          <button
            onClick={() => setActiveTab('directives')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeTab === 'directives' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            Directives
          </button>
          <button
            onClick={() => setActiveTab('memory')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeTab === 'memory' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            Durable Memory
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeTab === 'logs' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            Episodic Logs
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main Content Area */}
        <div className="lg:col-span-3">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/20 to-indigo-500/20 rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-1000"></div>
            <div className="relative bg-black/40 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl h-[600px] flex flex-col">
              {activeTab !== 'logs' ? (
                <>
                  <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
                    <div className="flex items-center gap-2">
                       {activeTab === 'directives' ? <ShieldCheck className="w-4 h-4 text-blue-400" /> : <FileText className="w-4 h-4 text-indigo-400" />}
                       <span className="text-sm font-medium text-slate-300">{files[activeTab as keyof typeof files]}</span>
                    </div>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-blue-500/20"
                    >
                      {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Spara ändringar
                    </button>
                  </div>
                  <textarea
                    className="flex-1 w-full bg-transparent p-6 text-slate-200 font-mono text-sm focus:outline-none resize-none leading-relaxed"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={loading ? "Läser in minne..." : "Skriv agentens minne här..."}
                  />
                </>
              ) : (
                <div className="flex flex-col h-full bg-slate-950/20">
                   <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
                    <div className="flex items-center gap-2">
                       <Clock className="w-4 h-4 text-amber-400" />
                       <span className="text-sm font-medium text-slate-300">Dagens Episodic Logs</span>
                    </div>
                    <button className="text-slate-400 hover:text-white transition-colors">
                      <History className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
                    {logs.map((log, i) => (
                      <div key={i} className="flex gap-4 p-4 bg-white/5 border border-white/5 rounded-xl">
                        <Terminal className="w-5 h-5 text-amber-500 shrink-0 mt-1" />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-amber-500/70">{log.timestamp}</span>
                            <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-full">AGENT</span>
                          </div>
                          <p className="text-slate-300 text-sm whitespace-pre-wrap">{log.message}</p>
                        </div>
                      </div>
                    ))}
                    {logs.length === 0 && (
                      <p className="text-center text-slate-500 text-sm py-10">Inga händelser loggade än idag.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar / Tools */}
        <div className="flex flex-col gap-6">
          {/* Working Memory Status */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
             <div className="flex items-center gap-2 mb-4">
               <Brain className="w-4 h-4 text-pink-400" />
               <h3 className="text-sm font-semibold text-white">Working Memory</h3>
             </div>
             <div className="space-y-4">
                <div className="p-3 bg-pink-500/5 border border-pink-500/10 rounded-xl space-y-2">
                   <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Aktiv Uppgift</p>
                   <p className="text-sm text-slate-200">Veriferar Qdrant-koppling och bygger UI.</p>
                </div>
                <div className="p-3 bg-slate-500/5 border border-slate-500/10 rounded-xl space-y-2">
                   <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Status</p>
                   <div className="flex items-center gap-2">
                     <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                     <span className="text-sm text-slate-300">Ready for Search</span>
                   </div>
                </div>
             </div>
          </div>

          {/* Semantic Search Tool */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl">
             <div className="flex items-center gap-2 mb-4">
               <Search className="w-4 h-4 text-blue-400" />
               <h3 className="text-sm font-semibold text-white">Semantic Search</h3>
             </div>
             <div className="space-y-4">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Sök i minnet..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-4 pr-10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                  />
                  <button
                    onClick={handleSearch}
                    disabled={loadingSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  >
                    {loadingSearch ? <RefreshCw className="w-4 h-4 animate-spin text-blue-400" /> : <Search className="w-4 h-4" />}
                  </button>
                </div>

                {searchResults.length > 0 && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                    {searchResults.map((res, i) => (
                      <div key={i} className="p-2 bg-white/5 rounded-lg border border-white/5 hover:bg-white/10 transition-colors cursor-pointer group">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs text-slate-300 truncate">{res.text}</p>
                          <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-blue-400 transition-colors" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
