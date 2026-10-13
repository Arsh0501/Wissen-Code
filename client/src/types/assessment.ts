// Assessment dashboard and creation wizard

export type DashboardTab = 'all' | 'draft' | 'active' | 'completed' | 'expired';

export type WizardStepKey = 'details' | 'questions' | 'config' | 'review' | 'generate' | 'publish';

export type ReadinessIssue = { step: WizardStepKey; level: 'error' | 'warn'; text: string };
