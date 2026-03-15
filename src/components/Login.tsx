import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, LogIn } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface LoginProps {
  onLogin: () => void;
}

export function Login({ onLogin }: LoginProps) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Simple password check as requested
    if (password === 'samithecrab') {
      localStorage.setItem('sitk-admin-auth', 'true');
      toast.success('Inloggad som administratör');
      onLogin();
    } else {
      toast.error('Fel lösenord');
      setPassword('');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-background to-background">
      <Card className="w-full max-w-md border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-purple-500/10 opacity-50" />

        <CardHeader className="space-y-1 relative z-10">
          <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4 border border-blue-500/30 group-hover:scale-110 transition-transform duration-500">
            <Lock className="w-6 h-6 text-blue-400" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Välkommen tillbaka</CardTitle>
          <CardDescription>
            Ange administratörslösenordet för att fortsätta
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 relative z-10">
            <div className="space-y-2">
              <Label htmlFor="password">Lösenord</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="bg-white/5 border-white/10 focus:border-blue-500/50 transition-all duration-300"
              />
            </div>
          </CardContent>
          <CardFooter className="relative z-10">
            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-500 transition-all duration-300 shadow-[0_0_20px_rgba(37,99,235,0.3)] group"
              disabled={loading}
            >
              Tillåt åtkomst
              <LogIn className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
