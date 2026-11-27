# Restarting a candidate's assessment

In the admin UI, open **Assessments**, select an assessment, choose **Results**, then select **Restart assessment** beside the candidate.

Enter a reason and confirm. If the assessment has closed, explicitly check the option allowing this candidate to restart the closed test. Draft, archived, and future assessments cannot be restarted. Other candidates' availability is unchanged.

The candidate returns to the assessment and starts a fresh attempt. The timer begins on Start. Saved answers, tab-switch counts, and paste events start empty. Their account, password, login session, and other assessments are retained. Resetting an attempt does not log the candidate out of other devices; use the existing Team Access session action separately if needed.

Admins may repeat the reset without a limit. Each reset supersedes any unconsumed replacement permission, allowing exactly one fresh attempt at a time. The global assessment attempt limit stays unchanged.

Previous attempts, drafts, submissions, and grading results stay in the database with an invalidation timestamp. Current results, exports, and dashboard statistics exclude those attempts. The restart history records the administrator, time, reason, explicit closed-test permission, and invalidated attempt IDs. Old attempt IDs reject reads and writes; grading remains tied to its original attempt ID.

## Deployment

This change requires both frontend and backend deployment plus the additive Prisma migration `20261125120000_assessment_restarts`. Deploy the migration before starting the new API and workers. The AWS compose migration service applies pending migrations during the normal deployment sequence. For a manual backend deployment, run `npx prisma migrate deploy` from `server` with the production environment configured. Do not use database reset commands.

The feature is available locally after applying the migration and regenerating the Prisma client; it does not update AWS or Vercel automatically.
