export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A full email address or an "@domain" that allows everyone on that domain
export const EMAIL_OR_DOMAIN_RE = /^(@[a-z0-9.-]+\.[a-z]{2,}|[^\s@]+@[^\s@]+\.[^\s@]+)$/i;
