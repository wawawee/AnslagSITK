import { Button } from '@/components/ui/button';
import { Brain, Menu, X } from 'lucide-react';
import { useState } from 'react';

interface HeaderProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void;
}

const navItems = [
  { id: 'search', label: 'Sök utlysningar', icon: 'Search' },
  { id: 'writer', label: 'Skriv ansökan', icon: 'FileText' },
  { id: 'drafts', label: 'Mina utkast', icon: 'Draft' },
];

export function Header({ activeTab, onTabChange, onLogout }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500">
              <Brain className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold gradient-text">SITK Agent</h1>
              <p className="text-xs text-muted-foreground">AI för ansökningshjälp</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Button
                key={item.id}
                variant={activeTab === item.id ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onTabChange(item.id)}
                className={activeTab === item.id ? 'bg-blue-600 hover:bg-blue-700' : ''}
              >
                {item.label}
              </Button>
            ))}
            <div className="w-px h-6 bg-border mx-2" />
            <Button
              variant="ghost"
              size="sm"
              onClick={onLogout}
              className="text-muted-foreground hover:text-red-400 hover:bg-red-400/10"
            >
              Logga ut
            </Button>
          </nav>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden py-4 border-t">
            <div className="flex flex-col gap-2">
              {navItems.map((item) => (
                <Button
                  key={item.id}
                  variant={activeTab === item.id ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => {
                    onTabChange(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={activeTab === item.id ? 'bg-blue-600 hover:bg-blue-700 justify-start' : 'justify-start'}
                >
                  {item.label}
                </Button>
              ))}
              <div className="h-px bg-border my-2" />
              <Button
                variant="ghost"
                size="sm"
                onClick={onLogout}
                className="justify-start text-red-400 hover:bg-red-400/10"
              >
                Logga ut
              </Button>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
