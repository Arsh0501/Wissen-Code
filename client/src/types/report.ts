// Candidate report and submissions views

export interface FailedCase {
  testcase_id: number;
  expected_output: string;
  actual_output: string;
  status: string;
}

export interface ReportQuestion {
  question_id: number;
  title: string;
  language: string;
  testcases_passed: number;
  testcases_total: number;
  score: number;
  marks: number;
  marks_obtained: number;
  attempted: boolean;
  code: string;
  type?: 'coding' | 'mcq';
  mcq?: { statement: string; options: { id: string; text: string }[]; correct: string[]; selected: string[] } | null;
  failed_cases: FailedCase[];
}

export interface ReportDataType {
  candidate: { id: string; name: string; email: string | null };
  assessment: { id: number; title: string; duration_minutes: number; submitted_at: string };
  overall_score: { passed: number; total: number; percentage: number };
  marks: {
    obtained: number;
    total: number;
    percentage: number;
    passing_score: number;
    passed: boolean;
    time_taken_seconds: number | null;
    questions_attempted: number;
    questions_total: number;
  };
  questions: ReportQuestion[];
  attempt?: number;
  previous_attempts?: { attempt: number; percentage: number; passed: boolean; finished_at: string | null }[];
  cohort: {
    rank: number | null;
    completed_count: number;
    percentile: number | null;
    average_score: number | null;
    highest_score: number | null;
    pass_rate: number | null;
  } | null;
  tab_switches: {
    count: number;
    limit: number;
    limit_exceeded: boolean;
    total_duration_ms: number;
    events: { duration_ms: number; occurred_at: string }[];
  };
  paste_events: {
    count: number;
    total_chars: number;
    large_count: number;
    large_threshold: number;
    events: { question_id: number; question_title: string; char_count: number; line_count: number; occurred_at: string }[];
  };
}

export type SubmissionSortKey = 'score' | 'name' | 'submitted';
