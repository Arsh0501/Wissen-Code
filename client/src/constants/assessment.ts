import { FileText, ListChecks, Settings2, Eye, Wand2, Rocket } from 'lucide-react';
import type { AssessmentInput, Availability, Lifecycle, WizardStepKey } from '../types';

// Default marks for a question added to an assessment, by difficulty
export const DEFAULT_MARKS: Record<string, number> = { easy: 10, medium: 20, hard: 30 };

export const WIZARD_STEPS: readonly { key: WizardStepKey; label: string; icon: typeof FileText }[] = [
  { key: 'details', label: 'Basic details', icon: FileText },
  { key: 'questions', label: 'Select questions', icon: ListChecks },
  { key: 'config', label: 'Configure', icon: Settings2 },
  { key: 'review', label: 'Review', icon: Eye },
  { key: 'generate', label: 'Generate', icon: Wand2 },
  { key: 'publish', label: 'Publish', icon: Rocket },
];

export const EMPTY_ASSESSMENT_FORM: AssessmentInput = {
  name: '',
  description: '',
  instructions: `- Read every question carefully before you start.
- Use **Run code** to test against sample cases; hidden test cases are used for final grading.
- Your work is auto-saved. The test is submitted automatically when the timer reaches zero.`,
  timeLimitMinutes: 60,
  passingScore: 60,
  status: 'draft',
  startAt: null,
  endAt: null,
  shuffleQuestions: false,
  allowedLanguages: [],
  showResults: true,
  difficulty: 'mixed',
  topics: [],
  questionTypes: ['coding'],
  questionCount: null,
  shuffleOptions: false,
  maxAttempts: 1,
  accessMode: 'anyone',
  allowedEmails: [],
  questions: [],
};

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  open: 'Live',
  upcoming: 'Scheduled',
  closed: 'Closed',
  draft: 'Draft',
  archived: 'Archived',
};

export const ASSESSMENT_FILTERS: { key: 'all' | Availability; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Live' },
  { key: 'upcoming', label: 'Scheduled' },
  { key: 'draft', label: 'Drafts' },
  { key: 'closed', label: 'Closed' },
  { key: 'archived', label: 'Archived' },
];

export const LIFECYCLE_LABELS: Record<Lifecycle, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  active: 'Active',
  expired: 'Expired',
  completed: 'Completed',
};

// Failed cases shown in a report before the "show all" toggle, so long lists don't dominate the page
export const FAILED_CASES_PREVIEW = 3;
