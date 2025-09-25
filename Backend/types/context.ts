// Tipos para el contexto de Hono
export interface BusinessContext {
  id: string;
  name: string;
  subscription_status: string;
  trial_ends_at: string;
  settings: Record<string, unknown>;
  created_at: string;
}

export interface EmployeeContext {
  id: string;
  role: 'owner' | 'admin' | 'seller';
  is_active: boolean;
  business_id: string;
  created_at: string;
}

export interface UserContext {
  id: string;
  email: string;
  // Otros campos de usuario según Supabase
}

import { Context } from "hono";

// Helper functions para acceder al contexto de forma segura
export function getBusinessFromContext(c: Context): BusinessContext | null {
  const business = c.get('business');
  return business ? business as unknown as BusinessContext : null;
}

export function getEmployeeFromContext(c: Context): EmployeeContext | null {
  const employee = c.get('employee');
  return employee ? employee as unknown as EmployeeContext : null;
}

export function getUserFromContext(c: Context): UserContext | null {
  const user = c.get('user');
  return user ? user as unknown as UserContext : null;
} 