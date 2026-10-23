import { z } from 'zod';

/** Provider output failures are recoverable; invalid requests and credentials are not. */
export function isGeneratedSchemaError(error: unknown): boolean {
  if (error instanceof z.ZodError || error instanceof SyntaxError) return true;
  const value = error as { status?: number; code?: string; message?: string; error?: { code?: string; message?: string; failed_generation?: unknown } };
  if (value?.status !== 400) return false;
  return /json_validate_failed|failed_generation|jsonschema:|missing properties|generated.*(?:schema|json)|json.*does not match.*schema/i.test(
    [value.code, value.message, value.error?.code, value.error?.message, value.error?.failed_generation === undefined ? '' : 'failed_generation'].join(' '),
  );
}

export function generationErrorHint(error: unknown): string {
  return (error instanceof z.ZodError ? z.prettifyError(error) : error instanceof Error ? error.message : 'Generated output was invalid').slice(0, 1200);
}
