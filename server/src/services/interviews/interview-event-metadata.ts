/** Historical events retain metadata for live activity and AI evidence, not editor snapshots. */
export function interviewEventMetadata(payload: Record<string, unknown>) {
  const {
    code: _code,
    starterCode: _starterCode,
    codeSnapshot: _codeSnapshot,
    ...metadata
  } = payload;
  return metadata;
}
