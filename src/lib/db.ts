import Dexie, { Table } from 'dexie';

export interface User {
  id?: number;
  fullName: string;
  role: 'admin' | 'worker';
  pin: string;
  active: boolean;
  createdAt: Date;
}

export interface Site {
  id?: number;
  name: string;
  lat: number;
  lon: number;
  radiusM: number;
  expectedStart: string; // 'HH:mm'
  expectedEnd: string; // 'HH:mm'
  tz: string;
  active: boolean;
  createdAt: Date;
}

export interface Shift {
  id?: number;
  userId: number;
  siteId: number;
  startedAt: Date;
  endedAt?: Date;
  startLat: number;
  startLon: number;
  endLat?: number;
  endLon?: number;
  status: 'early' | 'on_time' | 'late' | 'offsite';
  minutesLate: number;
  minutesWorked?: number;
  createdAt: Date;
}

export interface Settings {
  id: string;
  maxUsers: number;
  purgePolicyDays: number;
}

export class GeoTimeDB extends Dexie {
  users!: Table<User>;
  sites!: Table<Site>;
  shifts!: Table<Shift>;
  settings!: Table<Settings>;

  constructor() {
    super('GeoTimeDB');
    this.version(1).stores({
      users: '++id, role, active, pin',
      sites: '++id, active',
      shifts: '++id, userId, siteId, startedAt, status',
      settings: 'id',
    });
  }
}

export const db = new GeoTimeDB();

// Initialize default settings
db.on('ready', async () => {
  const settings = await db.settings.get('app');
  if (!settings) {
    await db.settings.add({
      id: 'app',
      maxUsers: 20,
      purgePolicyDays: 365,
    });
  }
});
