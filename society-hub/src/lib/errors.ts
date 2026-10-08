import { z } from 'zod';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Validate with zod and throw a clean 400 with the first problem.
// The return type comes from the schema, so handlers get fully typed bodies.
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.join('.');
    throw new ApiError(400, field ? `${field}: ${issue.message}` : issue.message, 'VALIDATION');
  }
  return result.data;
}

export { z };

export const errMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
