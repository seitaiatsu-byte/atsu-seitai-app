import type { Database } from './database.types';

type Customer = Database['public']['Tables']['customers']['Row'];

export function getCustomerBirthDate(c: Customer): string | null {
  return c.birth_date || c.birthday || null;
}

export function calculateAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const today = new Date();
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
