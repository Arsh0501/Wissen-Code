export function candidateRestrictionError(
  email: string,
  assessment: { allowedEmails: string; allowedDomains: string },
): string | null {
  const emails: string[] = JSON.parse(assessment.allowedEmails);
  const domains: string[] = JSON.parse(assessment.allowedDomains);
  if (!emails.length && !domains.length) return null;
  const normalized = email.toLowerCase();
  return emails.includes(normalized) || domains.includes(normalized.split('@')[1])
    ? null
    : 'This assessment is restricted to eligible candidate emails or domains';
}
