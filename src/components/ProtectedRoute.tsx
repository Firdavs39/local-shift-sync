import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { getCurrentUser, isAdmin } from '@/lib/supabase-auth';
import { supabase } from '@/integrations/supabase/client';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

interface CompanyStatus {
  active: boolean;
  plan_expires_at: string | null;
  plan: string;
}

export const ProtectedRoute = ({ children, requireAdmin = false }: ProtectedRouteProps) => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [company, setCompany] = useState<CompanyStatus | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);

        if (requireAdmin && currentUser) {
          const adminStatus = await isAdmin();
          setIsAdminUser(adminStatus);
        }

        if (currentUser?.company_id) {
          const { data } = await supabase
            .from('companies')
            .select('active, plan_expires_at, plan')
            .eq('id', currentUser.company_id)
            .single();
          if (data) setCompany(data);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [requireAdmin]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (requireAdmin && !isAdminUser) {
    return <Navigate to="/me" replace />;
  }

  // Company blocked by super-admin
  if (company && !company.active) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center space-y-4">
          <div className="text-5xl">🔒</div>
          <h1 className="text-xl font-bold">Аккаунт заблокирован</h1>
          <p className="text-muted-foreground text-sm">
            Ваша компания временно заблокирована. Для восстановления доступа свяжитесь с поддержкой.
          </p>
          <p className="text-xs text-muted-foreground">support@geotime.uz</p>
        </div>
      </div>
    );
  }

  // Subscription expired
  if (company?.plan_expires_at && new Date(company.plan_expires_at) < new Date()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center space-y-4">
          <div className="text-5xl">⏰</div>
          <h1 className="text-xl font-bold">Подписка истекла</h1>
          <p className="text-muted-foreground text-sm">
            Срок действия вашего тарифа закончился. Для продления свяжитесь с поддержкой.
          </p>
          <p className="text-xs text-muted-foreground">support@geotime.uz</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
