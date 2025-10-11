import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, MapPin, Plus, Trash2, Navigation } from 'lucide-react';
import { toast } from 'sonner';
import { getDistance } from '@/lib/geo';
import { supabase } from '@/integrations/supabase/client';

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
  created_at: string;
}

const SitesManagement = () => {
  const navigate = useNavigate();
  const [sites, setSites] = useState<Site[]>([]);
  
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    lat: '',
    lon: '',
    radiusM: '100',
    expectedStart: '09:00',
    expectedEnd: '18:00',
    tz: 'Europe/Moscow'
  });
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    loadSites();
    
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lon: position.coords.longitude
          });
        },
        (error) => {
          console.error('Geolocation error:', error);
        }
      );
    }
  }, []);

  const loadSites = async () => {
    const { data, error } = await supabase
      .from('sites')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error loading sites:', error);
      toast.error('Ошибка загрузки объектов');
      return;
    }
    
    setSites(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const lat = parseFloat(formData.lat);
    const lon = parseFloat(formData.lon);
    const radiusM = parseInt(formData.radiusM);

    if (isNaN(lat) || isNaN(lon) || isNaN(radiusM)) {
      toast.error('Неверные координаты или радиус');
      return;
    }

    const { error } = await supabase
      .from('sites')
      .insert({
        name: formData.name,
        lat,
        lon,
        radius_m: radiusM,
        expected_start: formData.expectedStart,
        expected_end: formData.expectedEnd,
        timezone: formData.tz,
        active: true
      });

    if (error) {
      console.error('Error adding site:', error);
      toast.error('Ошибка добавления объекта');
      return;
    }

    toast.success('Объект добавлен');
    setShowForm(false);
    setFormData({
      name: '',
      lat: '',
      lon: '',
      radiusM: '100',
      expectedStart: '09:00',
      expectedEnd: '18:00',
      tz: 'Europe/Moscow'
    });
    loadSites();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('sites')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting site:', error);
      toast.error('Ошибка удаления объекта');
      return;
    }

    toast.success('Объект удалён');
    loadSites();
  };

  const handleUseCurrentLocation = () => {
    if (userLocation) {
      setFormData({
        ...formData,
        lat: userLocation.lat.toFixed(6),
        lon: userLocation.lon.toFixed(6)
      });
      toast.success('Координаты установлены');
    } else {
      toast.error('Геолокация недоступна');
    }
  };

  const getDistanceToSite = (site: Site) => {
    if (!userLocation) return null;
    const distance = getDistance(
      userLocation.lat,
      userLocation.lon,
      site.lat,
      site.lon
    );
    return Math.round(distance);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <header className="bg-card border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-semibold">Управление объектами</h1>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Добавить
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        {userLocation && (
          <Card className="p-4 bg-primary/5 border-primary/20">
            <div className="flex items-center gap-2 text-sm">
              <Navigation className="w-4 h-4 text-primary" />
              <span className="font-medium">Ваша геолокация:</span>
              <span className="text-muted-foreground">
                {userLocation.lat.toFixed(6)}, {userLocation.lon.toFixed(6)}
              </span>
            </div>
          </Card>
        )}

        {showForm && (
          <Card className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Название объекта</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Широта</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    value={formData.lat}
                    onChange={(e) => setFormData({ ...formData, lat: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Долгота</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    value={formData.lon}
                    onChange={(e) => setFormData({ ...formData, lon: e.target.value })}
                    required
                  />
                </div>
              </div>

              <Button type="button" variant="outline" onClick={handleUseCurrentLocation} className="w-full">
                <Navigation className="w-4 h-4 mr-2" />
                Использовать текущую геолокацию
              </Button>

              <div>
                <Label>Радиус (метры)</Label>
                <Input
                  type="number"
                  value={formData.radiusM}
                  onChange={(e) => setFormData({ ...formData, radiusM: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Начало смены</Label>
                  <Input
                    type="time"
                    value={formData.expectedStart}
                    onChange={(e) => setFormData({ ...formData, expectedStart: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Конец смены</Label>
                  <Input
                    type="time"
                    value={formData.expectedEnd}
                    onChange={(e) => setFormData({ ...formData, expectedEnd: e.target.value })}
                    required
                  />
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
          {sites.map((site) => {
            const distance = getDistanceToSite(site);
            const isNearby = distance !== null && distance <= site.radius_m;

            return (
              <Card key={site.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <MapPin className={`w-5 h-5 ${isNearby ? 'text-green-500' : 'text-muted-foreground'}`} />
                      <h3 className="text-lg font-semibold">{site.name}</h3>
                      {distance !== null && (
                        <span className={`text-sm px-2 py-1 rounded ${isNearby ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
                          {distance}м {isNearby && '✓'}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>📍 {site.lat.toFixed(6)}, {site.lon.toFixed(6)}</p>
                      <p>⭕ Радиус: {site.radius_m}м</p>
                      <p>🕒 {site.expected_start} - {site.expected_end}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(site.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            );
          })}

          {sites.length === 0 && !showForm && (
            <Card className="p-12 text-center">
              <MapPin className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Нет объектов</p>
              <Button onClick={() => setShowForm(true)} className="mt-4">
                Добавить первый объект
              </Button>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default SitesManagement;
