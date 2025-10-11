import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Users, Plus, Trash2, Lock } from 'lucide-react';
import { toast } from 'sonner';

interface UserProfile {
  id: string;
  full_name: string;
  pin: string;
  active: boolean;
  role?: 'admin' | 'worker';
}

const UsersManagement = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    pin: '',
    role: 'worker' as 'worker' | 'admin'
  });

  useEffect(() => {
    loadUsers();

    // Set up real-time subscription
    const channel = supabase
      .channel('users-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => {
          loadUsers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadUsers = async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Get roles for each user
      const usersWithRoles = await Promise.all(
        (profiles || []).map(async (profile) => {
          const { data: roles } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', profile.id)
            .limit(1);

          return {
            ...profile,
            role: roles && roles.length > 0 ? roles[0].role : 'worker',
          };
        })
      );

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Ошибка загрузки пользователей');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (formData.pin.length !== 3) {
      toast.error('PIN должен быть 3 цифры');
      return;
    }

    if (!formData.fullName.trim()) {
      toast.error('Введите имя пользователя');
      return;
    }

    setLoading(true);
    try {
      // Call edge function to create user
      const { data, error } = await supabase.functions.invoke('create-worker', {
        body: {
          fullName: formData.fullName.trim(),
          pin: formData.pin,
          role: formData.role,
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      if (data && data.error) {
        throw new Error(data.error);
      }

      toast.success('Пользователь создан');
      setShowForm(false);
      setFormData({
        fullName: '',
        pin: '',
        role: 'worker'
      });
      loadUsers();
    } catch (error: any) {
      console.error('Error creating user:', error);
      const errorMessage = error.message || String(error);
      
      if (errorMessage.includes('уже существует')) {
        toast.error(errorMessage);
      } else if (errorMessage.includes('PIN must be')) {
        toast.error('PIN должен состоять из 3 цифр');
      } else if (errorMessage.includes('Missing required fields')) {
        toast.error('Заполните все обязательные поля');
      } else {
        toast.error(`Ошибка создания пользователя: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (user: UserProfile) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ active: !user.active })
        .eq('id', user.id);

      if (error) throw error;

      toast.success(user.active ? 'Пользователь деактивирован' : 'Пользователь активирован');
      loadUsers();
    } catch (error) {
      console.error('Error toggling user:', error);
      toast.error('Ошибка изменения статуса');
    }
  };

  const handleDelete = async (userId: string) => {
    try {
      // Check if user has shifts
      const { data: shifts, error: shiftsError } = await supabase
        .from('shifts')
        .select('id')
        .eq('user_id', userId)
        .limit(1);

      if (shiftsError) throw shiftsError;

      if (shifts && shifts.length > 0) {
        toast.error('Нельзя удалить пользователя со сменами');
        return;
      }

      // Delete user roles first
      const { error: rolesError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (rolesError) throw rolesError;

      // Delete profile
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (profileError) throw profileError;

      // Delete auth user (using admin API through edge function would be better, but for now we skip this)
      toast.success('Пользователь удалён');
      loadUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('Ошибка удаления пользователя');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-semibold">Управление пользователями</h1>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Добавить
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        {showForm && (
          <Card className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Полное имя (будет использоваться как логин)</Label>
                <Input
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="Иванов Иван"
                  required
                  maxLength={100}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Это имя сотрудник будет вводить при входе
                </p>
              </div>

              <div>
                <Label>PIN-код (3 цифры)</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={formData.pin}
                    onChange={(e) => {
                      const numbers = e.target.value.replace(/\D/g, '').slice(0, 3);
                      setFormData({ ...formData, pin: numbers });
                    }}
                    placeholder="•••"
                    className="pl-10 text-center tracking-widest"
                    maxLength={3}
                    required
                  />
                </div>
              </div>

              <div>
                <Label>Роль</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant={formData.role === 'worker' ? 'default' : 'outline'}
                    onClick={() => setFormData({ ...formData, role: 'worker' })}
                  >
                    Сотрудник
                  </Button>
                  <Button
                    type="button"
                    variant={formData.role === 'admin' ? 'default' : 'outline'}
                    onClick={() => setFormData({ ...formData, role: 'admin' })}
                  >
                    Администратор
                  </Button>
                </div>
              </div>

              <div className="flex gap-3">
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? 'Создание...' : 'Сохранить'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Отмена
                </Button>
              </div>
            </form>
          </Card>
        )}

        <div className="space-y-4">
          {users.map((user) => (
            <Card key={user.id} className={`p-6 ${!user.active ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold">
                      {user.full_name[0]}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">{user.full_name}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          user.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-accent/10 text-accent'
                        }`}>
                          {user.role === 'admin' ? 'Администратор' : 'Сотрудник'}
                        </span>
                        <span>PIN: •••</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={user.active ? 'outline' : 'default'}
                    size="sm"
                    onClick={() => handleToggleActive(user)}
                  >
                    {user.active ? 'Деактивировать' : 'Активировать'}
                  </Button>
                  {user.pin !== '777' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(user.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}

          {users.length === 0 && !showForm && (
            <Card className="p-12 text-center">
              <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Нет пользователей</p>
              <Button onClick={() => setShowForm(true)} className="mt-4">
                Добавить первого пользователя
              </Button>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default UsersManagement;
