import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, RefreshCw, Users } from 'lucide-react';
import { formatTime, formatDate } from '@/lib/time';
import { toast } from 'sonner';

interface ShiftReport {
  id: string;
  user_id: string;
  user_name: string;
  site_id: string;
  site_name: string;
  started_at: string;
  ended_at?: string;
  status: 'early' | 'on_time' | 'late' | 'offsite';
  minutes_late: number;
  minutes_worked?: number;
}

const Reports = () => {
  const navigate = useNavigate();
  const [shifts, setShifts] = useState<ShiftReport[]>([]);
  const [loading, setLoading] = useState(true);

  const loadShifts = async () => {
    setLoading(true);
    try {
      const { data: shiftsData, error } = await supabase
        .from('shifts')
        .select(`
          id,
          user_id,
          site_id,
          started_at,
          ended_at,
          status,
          minutes_late,
          minutes_worked
        `)
        .order('started_at', { ascending: false });

      if (error) throw error;

      // Load user names
      const userIds = [...new Set(shiftsData?.map(s => s.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);

      // Load site names
      const siteIds = [...new Set(shiftsData?.map(s => s.site_id) || [])];
      const { data: sites } = await supabase
        .from('sites')
        .select('id, name')
        .in('id', siteIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p.full_name]));
      const siteMap = new Map(sites?.map(s => [s.id, s.name]));

      const enrichedShifts: ShiftReport[] = (shiftsData || []).map(shift => ({
        ...shift,
        user_name: profileMap.get(shift.user_id) || 'Неизвестно',
        site_name: siteMap.get(shift.site_id) || 'Неизвестно',
      }));

      setShifts(enrichedShifts);
    } catch (error) {
      console.error('Error loading shifts:', error);
      toast.error('Ошибка загрузки отчётов');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShifts();
  }, []);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-semibold">Отчёты по сменам</h1>
          </div>
          <Button variant="outline" size="icon" onClick={loadShifts} disabled={loading}>
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Card className="p-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : shifts.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Нет данных о сменах</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Сотрудник</TableHead>
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
                    <TableRow 
                      key={shift.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/admin/workers/${shift.user_id}`)}
                    >
                      <TableCell className="font-medium">{shift.user_name}</TableCell>
                      <TableCell>{shift.site_name}</TableCell>
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
                          <span className="text-muted-foreground">В процессе</span>
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

export default Reports;
