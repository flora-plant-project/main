/**
 * Flatten a ZodError into { fieldName: firstMessage } for inline form display.
 * @param {import('zod').ZodError} zodError
 * @returns {Record<string, string>}
 */
export function fieldErrors(zodError) {
  const errors = {};
  for (const issue of zodError.issues) {
    const key = String(issue.path[0] ?? '_form');
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
