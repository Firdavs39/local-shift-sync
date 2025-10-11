import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getCurrentUser, logout } from '@/lib/supabase-auth';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentPosition, isWithinRadius, getDistance } from '@/lib/geo';
import { getShiftStatus, formatTime, formatDate, calculateMinutesWorked } from '@/lib/time';
import { Clock, MapPin, LogOut, Play, Square, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

interface Site {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radius_m: number;
  expected_start: string;
  expected_end: string;
  timezone: string;
  active: boolean;
}

interface Shift {
  id: string;
  user_id: string;
  site_id: string;
  started_at: string;
  ended_at?: string;
  start_lat: number;
  start_lon: number;
  end_lat?: number;
  end_lon?: number;
  status: 'early' | 'on_time' | 'late' | 'offsite';
  minutes_late: number;
  minutes_worked?: number;
}

const Me = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [wakeLockEnabled, setWakeLockEnabled] = useState(false);
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [sites, setSites] = useState<Site[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const currentUser = await getCurrentUser();
      if (!currentUser || currentUser.role !== 'worker') {
        navigate('/auth');
        return;
      }
      setUser(currentUser);
    };

    checkAuth();

    // Update time every minute
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, [navigate]);

  useEffect(() => {
    if (!user) return;

    // Load sites
    const loadSites = async () => {
      const { data, error } = await supabase
        .from('sites')
        .select('*')
        .eq('active', true);

      if (error) {
        console.error('Error loading sites:', error);
        toast.error('Ошибка загрузки объектов');
      } else {
        setSites(data || []);
      }
    };

    // Load active shift
    const loadActiveShift = async () => {
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('user_id', user.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error loading shift:', error);
      } else if (data && data.length > 0) {
        setActiveShift(data[0]);
      }
    };

    // Get current location
    getCurrentPosition()
      .then(position => {
        setUserLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      })
      .catch(error => {
        console.error('Error getting location:', error);
      });

    loadSites();
    loadActiveShift();

    // Set up real-time subscription for shifts
    const channel = supabase
      .channel('shifts-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shifts',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadActiveShift();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const toggleWakeLock = async () => {
    try {
      if (!wakeLockEnabled && 'wakeLock' in navigator) {
        const lock = await navigator.wakeLock.request('screen');
        setWakeLock(lock);
        setWakeLockEnabled(true);
        toast.success('Экран не будет гаснуть во время смены');
      } else if (wakeLock) {
        await wakeLock.release();
        setWakeLock(null);
        setWakeLockEnabled(false);
        toast.info('WakeLock отключен');
      }
    } catch (error) {
      toast.error('Не удалось активировать WakeLock');
    }
  };

  const handleStartShift = async () => {
    if (!sites || sites.length === 0) {
      toast.error('Нет доступных объектов');
      return;
    }

    try {
      const position = await getCurrentPosition();
      const { latitude, longitude } = position.coords;

      // Find nearest site
      let nearestSite: Site | null = null;
      let isWithinSite = false;

      for (const site of sites) {
        if (isWithinRadius(latitude, longitude, site.lat, site.lon, site.radius_m)) {
          nearestSite = site;
          isWithinSite = true;
          break;
        }
      }

      if (!nearestSite) {
        nearestSite = sites[0]; // Default to first site if none found
      }

      const now = new Date();
      const status = getShiftStatus(now, nearestSite.expected_start, isWithinSite);
      const minutesLate = status === 'late' ? 
        parseInt(formatTime(now).split(':')[0]) * 60 + parseInt(formatTime(now).split(':')[1]) - 
        parseInt(nearestSite.expected_start.split(':')[0]) * 60 - parseInt(nearestSite.expected_start.split(':')[1]) : 0;

      const { data, error } = await supabase
        .from('shifts')
        .insert({
          user_id: user.id,
          site_id: nearestSite.id,
          started_at: now.toISOString(),
          start_lat: latitude,
          start_lon: longitude,
          status,
          minutes_late: minutesLate,
        })
        .select()
        .single();

      if (error) {
        toast.error('Ошибка начала смены');
        console.error(error);
      } else {
        setActiveShift(data);
        toast.success(`Смена начата на объекте "${nearestSite.name}"`);
      }
    } catch (error) {
      toast.error('Не удалось получить геолокацию');
      console.error(error);
    }
  };

  const handleEndShift = async () => {
    if (!activeShift) return;

    try {
      const position = await getCurrentPosition();
      const { latitude, longitude } = position.coords;
      const now = new Date();

      const minutesWorked = calculateMinutesWorked(new Date(activeShift.started_at), now);

      const { error } = await supabase
        .from('shifts')
        .update({
          ended_at: now.toISOString(),
          end_lat: latitude,
          end_lon: longitude,
          minutes_worked: minutesWorked,
        })
        .eq('id', activeShift.id);

      if (error) {
        toast.error('Ошибка завершения смены');
        console.error(error);
      } else {
        setActiveShift(null);
        toast.success(`Смена завершена. Отработано: ${Math.floor(minutesWorked / 60)}ч ${minutesWorked % 60}м`);
      }
    } catch (error) {
      toast.error('Не удалось получить геолокацию');
      console.error(error);
    }
  };

  const handleLogout = async () => {
    if (wakeLock) {
      wakeLock.release();
    }
    await logout();
    navigate('/auth');
  };

  const getSiteDistance = (site: Site) => {
    if (!userLocation) return null;
    const distance = getDistance(userLocation.lat, userLocation.lon, site.lat, site.lon);
    return Math.round(distance);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-10 backdrop-blur-sm bg-card/80">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold">
              {user.full_name[0]}
            </div>
            <div>
              <h1 className="font-semibold">{user.full_name}</h1>
              <p className="text-xs text-muted-foreground">Сотрудник</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        {/* Current Time */}
        <Card className="p-6 text-center">
          <Clock className="w-12 h-12 mx-auto mb-4 text-primary" />
          <div className="text-4xl font-bold mb-2">{formatTime(currentTime)}</div>
          <div className="text-muted-foreground">{formatDate(currentTime)}</div>
        </Card>

        {/* Shift Control */}
        {activeShift ? (
          <Card className="p-6 space-y-4 border-2 border-accent">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-3 h-3 rounded-full bg-accent animate-pulse" />
              <h2 className="text-lg font-semibold">Смена идёт</h2>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Начало:</span>
                <span className="font-medium">{formatTime(new Date(activeShift.started_at))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Статус:</span>
                <span className={`font-medium ${
                  activeShift.status === 'on_time' ? 'text-accent' :
                  activeShift.status === 'late' ? 'text-destructive' :
                  activeShift.status === 'early' ? 'text-primary' :
                  'text-muted-foreground'
                }`}>
                  {activeShift.status === 'on_time' ? 'Вовремя' :
                   activeShift.status === 'late' ? `Опоздание ${activeShift.minutes_late} мин` :
                   activeShift.status === 'early' ? 'Раньше времени' :
                   'Вне объекта'}
                </span>
              </div>
            </div>

            <Button
              onClick={handleEndShift}
              className="w-full bg-gradient-to-r from-destructive to-destructive/80"
              size="lg"
            >
              <Square className="w-5 h-5 mr-2" />
              Закончить смену
            </Button>
          </Card>
        ) : (
          <Card className="p-6 space-y-4">
            <h2 className="text-lg font-semibold">Начать смену</h2>
            <p className="text-sm text-muted-foreground">
              При начале смены будет определена ваша геолокация и ближайший объект
            </p>
            <Button
              onClick={handleStartShift}
              className="w-full bg-gradient-to-r from-primary to-accent"
              size="lg"
            >
              <Play className="w-5 h-5 mr-2" />
              Начать смену
            </Button>
          </Card>
        )}

        {/* WakeLock Toggle */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-muted-foreground" />
              <div>
                <h3 className="font-medium">Экран не гаснет</h3>
                <p className="text-xs text-muted-foreground">Держать экран активным во время смены</p>
              </div>
            </div>
            <Button
              variant={wakeLockEnabled ? 'default' : 'outline'}
              size="sm"
              onClick={toggleWakeLock}
            >
              {wakeLockEnabled ? 'Включено' : 'Выключено'}
            </Button>
          </div>
        </Card>

        {/* Sites Info */}
        {sites && sites.length > 0 && (
          <Card className="p-6 space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Доступные объекты
            </h2>
            <div className="space-y-3">
              {sites.map((site) => {
                const distance = getSiteDistance(site);
                return (
                  <div key={site.id} className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                    <div>
                      <div className="font-medium">{site.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {site.expected_start} - {site.expected_end}
                      </div>
                      {distance !== null && (
                        <div className="text-xs text-muted-foreground mt-1">
                          📍 {distance}м от вас
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ±{site.radius_m}м
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {sites.length === 0 && (
          <Card className="p-6 text-center">
            <MapPin className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Нет доступных объектов</p>
            <p className="text-sm text-muted-foreground mt-2">
              Администратор ещё не добавил объекты
            </p>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Me;
