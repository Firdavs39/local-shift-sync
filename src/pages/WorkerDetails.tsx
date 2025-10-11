import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, User, Calendar } from 'lucide-react';
import { formatTime, formatDate } from '@/lib/time';
import { toast } from 'sonner';

interface WorkerProfile {
  id: string;
  full_name: string;
  pin: string;
  active: boolean;
  email?: string;
}

interface ShiftDetail {
  id: string;
  site_id: string;
  site_name: string;
  started_at: string;
  ended_at?: string;
  status: 'early' | 'on_time' | 'late' | 'offsite';
  minutes_late: number;
  minutes_worked?: number;
}

const WorkerDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [worker, setWorker] = useState<WorkerProfile | null>(null);
  const [shifts, setShifts] = useState<ShiftDetail[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const loadWorkerData = async () => {
      setLoading(true);
      try {
        // Load worker profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', id)
          .single();

        if (profileError) throw profileError;
        setWorker(profile);

        // Load worker shifts
        const { data: shiftsData, error: shiftsError } = await supabase
          .from('shifts')
          .select('*')
          .eq('user_id', id)
          .order('started_at', { ascending: false });

        if (shiftsError) throw shiftsError;

        // Load site names
        const siteIds = [...new Set(shiftsData?.map(s => s.site_id) || [])];
        const { data: sites } = await supabase
          .from('sites')
          .select('id, name')
          .in('id', siteIds);

        const siteMap = new Map(sites?.map(s => [s.id, s.name]));

        const enrichedShifts: ShiftDetail[] = (shiftsData || []).map(shift => ({
          ...shift,
          site_name: siteMap.get(shift.site_id) || 'Неизвестно',
        }));

        setShifts(enrichedShifts);
      } catch (error) {
        console.error('Error loading worker data:', error);
        toast.error('Ошибка загрузки данных сотрудника');
      } finally {
        setLoading(false);
      }
    };

    loadWorkerData();
  }, [id]);

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'on_time': return 'Вовремя';
      case 'late': return 'Опоздание';
      case 'early': return 'Раньше';
      case 'offsite': return 'Вне объекта';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on_time': return 'text-green-600';
      case 'late': return 'text-red-600';
      case 'early': return 'text-blue-600';
      case 'offsite': return 'text-gray-600';
      default: return '';
    }
  };

  const calculateTotalStats = () => {
    const totalMinutesWorked = shifts.reduce((sum, shift) => sum + (shift.minutes_worked || 0), 0);
    const totalMinutesLate = shifts.reduce((sum, shift) => sum + shift.minutes_late, 0);
    const completedShifts = shifts.filter(s => s.ended_at).length;
    const activeShifts = shifts.filter(s => !s.ended_at).length;

    return {
      totalHours: Math.floor(totalMinutesWorked / 60),
      totalMinutes: totalMinutesWorked % 60,
      totalLateMinutes: totalMinutesLate,
      completedShifts,
      activeShifts,
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!worker) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <User className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Сотрудник не найден</p>
          <Button className="mt-4" onClick={() => navigate('/admin/reports')}>
            Вернуться к отчётам
          </Button>
        </Card>
      </div>
    );
  }

  const stats = calculateTotalStats();

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/reports')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-semibold">Информация о сотруднике</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Worker Info Card */}
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-2xl font-bold">
              {worker.full_name[0]}
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold mb-2">{worker.full_name}</h2>
              <div className="space-y-1 text-sm text-muted-foreground">
                {worker.email && <p>Email: {worker.email}</p>}
                <p>PIN: {worker.pin}</p>
                <p>
                  Статус: {' '}
                  <span className={worker.active ? 'text-green-600' : 'text-red-600'}>
                    {worker.active ? 'Активен' : 'Неактивен'}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Statistics Cards */}
        <div className="grid md:grid-cols-4 gap-4">
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-primary">{stats.completedShifts}</div>
            <div className="text-sm text-muted-foreground">Завершённых смен</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-accent">{stats.activeShifts}</div>
            <div className="text-sm text-muted-foreground">Активных смен</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-primary">
              {stats.totalHours}ч {stats.totalMinutes}м
            </div>
            <div className="text-sm text-muted-foreground">Всего отработано</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{stats.totalLateMinutes} мин</div>
            <div className="text-sm text-muted-foreground">Всего опозданий</div>
          </Card>
        </div>

        {/* Shifts History */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            История смен
          </h3>
          
          {shifts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Нет данных о сменах</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Объект</TableHead>
                    <TableHead>Начало</TableHead>
                    <TableHead>Конец</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Опоздание</TableHead>
                    <TableHead>Отработано</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shifts.map((shift) => (
                    <TableRow key={shift.id}>
                      <TableCell className="font-medium">{shift.site_name}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{formatDate(new Date(shift.started_at))}</div>
                          <div className="text-muted-foreground">{formatTime(new Date(shift.started_at))}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {shift.ended_at ? (
                          <div className="text-sm">
                            <div>{formatDate(new Date(shift.ended_at))}</div>
                            <div className="text-muted-foreground">{formatTime(new Date(shift.ended_at))}</div>
                          </div>
                        ) : (
                          <span className="text-accent font-medium">В процессе</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={getStatusColor(shift.status)}>
                          {getStatusLabel(shift.status)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {shift.minutes_late > 0 ? `${shift.minutes_late} мин` : '-'}
                      </TableCell>
                      <TableCell>
                        {shift.minutes_worked 
                          ? `${Math.floor(shift.minutes_worked / 60)}ч ${shift.minutes_worked % 60}м`
                          : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
};

export default WorkerDetails;
