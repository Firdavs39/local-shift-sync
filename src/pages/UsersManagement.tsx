import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { db, User } from '@/lib/db';
import { ArrowLeft, Users, Plus, Trash2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';

const UsersManagement = () => {
  const navigate = useNavigate();
  const users = useLiveQuery(() => db.users.toArray()) || [];
  
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    pin: '',
    role: 'worker' as 'worker' | 'admin'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.pin.length !== 3) {
      toast.error('PIN должен быть 3 цифры');
      return;
    }

    // Check if PIN already exists
    const existingUser = await db.users.where('pin').equals(formData.pin).first();
    if (existingUser) {
      toast.error('Этот PIN уже используется');
      return;
    }

    await db.users.add({
      fullName: formData.fullName,
      pin: formData.pin,
      role: formData.role,
      active: true,
      createdAt: new Date()
    });

    toast.success('Пользователь добавлен');
    setShowForm(false);
    setFormData({
      fullName: '',
      pin: '',
      role: 'worker'
    });
  };

  const handleToggleActive = async (user: User) => {
    if (user.id) {
      await db.users.update(user.id, { active: !user.active });
      toast.success(user.active ? 'Пользователь деактивирован' : 'Пользователь активирован');
    }
  };

  const handleDelete = async (id: number) => {
    // Check if user has shifts
    const shiftsCount = await db.shifts.where('userId').equals(id).count();
    if (shiftsCount > 0) {
      toast.error('Нельзя удалить пользователя со сменами');
      return;
    }

    await db.users.delete(id);
    toast.success('Пользователь удалён');
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
                <Label>Полное имя</Label>
                <Input
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="Иванов Иван Иванович"
                  required
                />
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
                <Button type="submit" className="flex-1">Сохранить</Button>
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
                      {user.fullName[0]}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">{user.fullName}</h3>
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
                      onClick={() => user.id && handleDelete(user.id)}
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
