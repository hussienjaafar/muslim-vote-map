import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { Ban } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function AuthGuard({ children, requireAdmin = false }: AuthGuardProps) {
  const { user, loading, isAdmin, isSuspended } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (isSuspended) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4 max-w-md px-6">
          <div className="h-12 w-12 rounded-full bg-destructive/20 flex items-center justify-center mx-auto">
            <Ban className="h-6 w-6 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">Account Suspended</h2>
          <p className="text-muted-foreground text-sm">
            Your account has been suspended. If you believe this is an error, please contact support.
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-destructive font-semibold">Access Denied</p>
          <p className="text-muted-foreground text-sm">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
