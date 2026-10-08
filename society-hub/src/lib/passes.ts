import { db } from './db';
import { ApiError, z, parse } from './errors';
import { randomCode } from './crypto';
import { passDto } from './dto';

export const passInclude = { flat: true, createdBy: true } as const;

export async function uniquePassCode(): Promise<string> {
  for (;;) {
    const code = randomCode(8);
    if (!(await db.visitorPass.findUnique({ where: { code } }))) return code;
  }
}

export const REASONS: Record<string, string> = {
  AWAITING_APPROVAL: 'Still waiting for the resident to approve',
  REJECTED: 'The resident declined this visitor',
  CHECKED_IN: 'Already inside. This pass was used',
  CHECKED_OUT: 'This pass was already used',
  CANCELLED: 'The resident cancelled this pass',
  EXPIRED: 'This pass has expired',
};

// A guard can only ever see their own society's passes.
export async function findPass(societyId: number, input: unknown) {
  const b = parse(z.object({ code: z.string().trim().toUpperCase().optional(), passId: z.coerce.number().int().optional() }), input);
  if (!b.code && !b.passId) throw new ApiError(400, 'Enter the pass code', 'VALIDATION');
  const row = await db.visitorPass.findFirst({
    where: { societyId, ...(b.code ? { code: b.code } : { id: b.passId }) },
    include: passInclude,
  });
  if (!row) throw new ApiError(404, 'No pass found with that code', 'NOT_FOUND');
  return passDto(row);
}
