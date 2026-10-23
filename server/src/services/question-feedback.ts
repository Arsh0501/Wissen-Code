export function questionNoteData(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch {}
  return raw ? { discussionNotes: raw } : {};
}

export function questionFeedback(raw?: string): string {
  const value = questionNoteData(raw ?? '').interviewerFeedback;
  return typeof value === 'string' ? value : '';
}

export function reviewedTranscript(raw?: string): { text: string; segmentIds: string[]; reviewedAt: string } | null {
  const value = questionNoteData(raw ?? '').transcriptEvidence as any;
  return value && typeof value.text === 'string' && value.text.trim() && Array.isArray(value.segmentIds) && value.segmentIds.length && value.segmentIds.every((id: unknown) => typeof id === 'string') && typeof value.reviewedAt === 'string'
    ? { text: value.text, segmentIds: value.segmentIds, reviewedAt: value.reviewedAt } : null;
}
