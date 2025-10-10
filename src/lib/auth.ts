import { db, User } from './db';

export const AUTH_KEY = 'geotime_current_user';

export async function login(pin: string): Promise<User | null> {
  const user = await db.users.where('pin').equals(pin).and(u => u.active).first();
  if (user) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    return user;
  }
  return null;
}

export function logout() {
  localStorage.removeItem(AUTH_KEY);
}

export function getCurrentUser(): User | null {
  const stored = localStorage.getItem(AUTH_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  return null;
}

export function isAdmin(): boolean {
  const user = getCurrentUser();
  return user?.role === 'admin';
}

export function isAuthenticated(): boolean {
  return getCurrentUser() !== null;
}
