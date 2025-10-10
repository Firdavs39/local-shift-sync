import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getCurrentUser, logout } from '@/lib/auth';
import { db, Shift, Site } from '@/lib/db';
import { getCurrentPosition, isWithinRadius } from '@/lib/geo';
import { getShiftStatus, formatTime, formatDate, calculateMinutesWorked } from '@/lib/time';
import { Clock, MapPin, LogOut, Play, Square, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';

const Me = () => {
  const navigate = useNavigate();
  const user = getCurrentUser();
  const [wakeLockEnabled, setWakeLockEnabled] = useState(false);
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const sites = useLiveQuery(() => db.sites.where('active').equals(1).toArray());

  useEffect(() => {
    if (!user || user.role !== 'worker') {
      navigate('/login');
      return;
    }

    // Check for active shift
    db.shifts
      .where('userId')
      .equals(user.id!)
      .and((shift) => !shift.endedAt)
      .first()
      .then(setActiveShift);

    // Update time every minute
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, [user, navigate]);

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
        if (isWithinRadius(latitude, longitude, site.lat, site.lon, site.radiusM)) {
          nearestSite = site;
          isWithinSite = true;
          break;
        }
      }

      if (!nearestSite) {
        nearestSite = sites[0]; // Default to first site if none found
      }

      const now = new Date();
      const status = getShiftStatus(now, nearestSite.expectedStart, isWithinSite);
      const minutesLate = status === 'late' ? parseInt(formatTime(now).split(':')[0]) * 60 + parseInt(formatTime(now).split(':')[1]) - 
                          parseInt(nearestSite.expectedStart.split(':')[0]) * 60 - parseInt(nearestSite.expectedStart.split(':')[1]) : 0;

      const shiftId = await db.shifts.add({
        userId: user!.id!,
        siteId: nearestSite.id!,
        startedAt: now,
        startLat: latitude,
        startLon: longitude,
        status,
        minutesLate,
        createdAt: now,
      });

      const shift = await db.shifts.get(shiftId);
      setActiveShift(shift || null);

      toast.success(`Смена начата на объекте "${nearestSite.name}"`);
    } catch (error) {
      toast.error('Не удалось получить геолокацию');
    }
  };

  const handleEndShift = async () => {
    if (!activeShift) return;

    try {
      const position = await getCurrentPosition();
      const { latitude, longitude } = position.coords;
      const now = new Date();

      const minutesWorked = calculateMinutesWorked(new Date(activeShift.startedAt), now);

      await db.shifts.update(activeShift.id!, {
        endedAt: now,
        endLat: latitude,
        endLon: longitude,
        minutesWorked,
      });

      setActiveShift(null);
      toast.success(`Смена завершена. Отработано: ${Math.floor(minutesWorked / 60)}ч ${minutesWorked % 60}м`);
    } catch (error) {
      toast.error('Не удалось получить геолокацию');
    }
  };

  const handleLogout = () => {
    if (wakeLock) {
      wakeLock.release();
    }
    logout();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-10 backdrop-blur-sm bg-card/80">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold">
              {user.fullName[0]}
            </div>
            <div>
              <h1 className="font-semibold">{user.fullName}</h1>
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
                <span className="font-medium">{formatTime(new Date(activeShift.startedAt))}</span>
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
                   activeShift.status === 'late' ? `Опоздание ${activeShift.minutesLate} мин` :
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
              {sites.map((site) => (
                <div key={site.id} className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                  <div>
                    <div className="font-medium">{site.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {site.expectedStart} - {site.expectedEnd}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    ±{site.radiusM}м
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Me;
