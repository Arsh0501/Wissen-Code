/** Question content becomes available only after the interviewer starts the room. */
export function candidateRoomState<T extends { status: string }>(state: T) {
  if (state.status === 'in_progress') return state;
  return { ...state, currentQuestionId: null, currentQuestion: null, currentCandidateAnswer: '', currentCode: '', codeRevision: 0, currentLanguageId: 71, questions: [] };
}
