import type { InterviewStatus, Observation, Recommendation } from '../types';

export const INTERVIEW_STATUS_LABELS: Record<InterviewStatus, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
};

export const RECOMMENDATION_LABELS: Record<Exclude<Recommendation, ''>, string> = {
  strong_hire: 'Strong hire',
  hire: 'Hire',
  no_hire: 'No hire',
  strong_no_hire: 'Strong no hire',
};

export const SENTIMENT_LABELS: Record<Observation['sentiment'], string> = {
  positive: 'Strength',
  neutral: 'Note',
  concern: 'Concern',
};

export const EVIDENCE_LABELS: Record<Observation['evidence'][number]['source'], string> = {
  answer: 'Answer',
  code: 'Code',
  execution: 'Execution',
  notes: 'Notes',
};

// Skills always offered for rating, on top of the interview's own skills
export const DEFAULT_EXTRA_SKILLS = ['Problem Solving', 'Communication'];
