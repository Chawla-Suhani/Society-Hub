import { ApiError, z } from './errors';

export const phone = z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number');
export const email = z.string().trim().toLowerCase().email('Enter a valid email');
export const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .regex(/[A-Za-z]/, 'Add at least one letter')
  .regex(/\d/, 'Add at least one number');
export const pin = z.string().regex(/^\d{6}$/, 'PIN must be 6 digits');
export const residentType = z.enum(['owner', 'tenant', 'family']);
export const id = z.coerce.number().int().positive();

export const idParam = (v: string | undefined): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(404, 'Not found', 'NOT_FOUND');
  return n;
};
