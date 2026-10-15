import { z } from 'zod';
import { runAgent } from './gateway';
import { questionTools } from './question-tools';
import { interviewContext } from './context';
import {
  assistantSchema,
  notesSchema,
  reportSchema,
  validateEvidence,
} from './schemas';
import {
  generationSchema,
  questionContentSchema,
  validationSchema,
  planInputSchema,
  planSchema,
} from '../services/workflow-schemas';
export const agentKinds = [
  'question-generation',
  'question-validation',
  'interview-planner',
  'interview-assistant',
  'note-writer',
  'evaluation',
] as const;
export type AgentKind = (typeof agentKinds)[number];
export async function executeAgent(
  kind: AgentKind,
  input: any,
  authorId: number,
  interviewId?: number,
) {
  if (kind === 'question-generation') {
    const params = generationSchema
      .extend({ experienceLevel: z.string().max(500).optional() })
      .parse(input);
    const result = await runAgent(
      'generated_questions',
      z.object({ questions: z.array(questionContentSchema) }),
      'Generate original coding questions. Search and check duplicates first. Include exact input/output specifications, sample and hidden edge cases and correct Python reference solutions. Match count, difficulty, type and skills. Save only drafts, never publish.',
      params,
      questionTools(authorId),
    );
    if (
      result.questions.length !== params.count ||
      result.questions.some(
        (q) =>
          q.difficulty !== params.difficulty ||
          q.questionType !== params.questionType,
      )
    )
      throw new Error('Generated constraints do not match request');
    const save = questionTools(authorId).find(
      (t) => t.name === 'saveDraftQuestion',
    )!;
    const drafts = [];
    for (const question of result.questions)
      drafts.push(await save.execute({ question }));
    return { ...result, drafts };
  }
  if (kind === 'question-validation')
    return runAgent(
      'question_validation',
      validationSchema,
      'Validate correctness, duplicate, ambiguity, difficulty, testCases, expectedSolution and edgeCases. Return each of the seven checks exactly once with evidence. Never mark compiler verification successful if tool says unverified.',
      questionContentSchema.parse(input.question),
      questionTools(authorId).filter((t) => t.name !== 'saveDraftQuestion'),
    );
  if (!interviewId) throw new Error('An interview is required');
  const context = await interviewContext(interviewId, authorId);
  if (kind === 'interview-planner') {
    const params = planInputSchema
      .extend({ interviewType: z.string().max(100).optional() })
      .parse(input);
    const result = await runAgent(
      'interview_plan',
      planSchema,
      'Create practical questions, follow-ups and objectives for all required skills. Whole section minutes must sum exactly to durationMinutes. Tailor to job, experience and interview type.',
      params,
    );
    if (
      result.sections.reduce((n, s) => n + s.minutes, 0) !==
        params.durationMinutes ||
      params.requiredSkills.some(
        (skill) =>
          !result.sections.some(
            (s) => s.skill.toLowerCase() === skill.toLowerCase(),
          ),
      )
    )
      throw new Error('Invalid plan duration or skill coverage');
    const { default: prisma } = await import('../prisma');
    await prisma.$transaction(async (tx) => {
      await tx.interview.update({
        where: { id: interviewId },
        data: { timeLimitMinutes: params.durationMinutes },
      });
      await tx.interviewPlan.upsert({
        where: { interviewId },
        create: {
          interviewId,
          jobRequirements: params.jobRequirements,
          candidateExperience: params.candidateExperience,
          requiredSkills: params.requiredSkills,
          durationMinutes: params.durationMinutes,
          sections: result.sections,
        },
        update: {
          jobRequirements: params.jobRequirements,
          candidateExperience: params.candidateExperience,
          requiredSkills: params.requiredSkills,
          durationMinutes: params.durationMinutes,
          sections: result.sections,
        },
      });
    });
    return result;
  }
  if (kind === 'evaluation' && context.interview.status !== 'completed')
    throw new Error('End the interview before generating the final evaluation');
  const schema =
    kind === 'interview-assistant'
      ? assistantSchema
      : kind === 'note-writer'
        ? notesSchema
        : reportSchema;
  const instructions =
    kind === 'interview-assistant'
      ? 'Suggest useful follow-ups, observations and areas to probe based on the current question, previous questions, answer, code and execution. Each observation and follow-up needs exact quotes from supplied sources. The interviewer chooses what to ask.'
      : kind === 'note-writer'
        ? 'Write structured technical, coding, problem-solving and communication notes, key observations and event timeline. Cite exact evidence and valid event IDs. These are proposed notes requiring human acceptance.'
        : 'Evaluate recorded skills after the interview with assessment, confidence and exact evidence. Never invent conclusions or make hiring decisions. Distinguish mock execution from real evidence. Support summary with summaryEvidence.';
  const output = await runAgent(
    kind.replace(/-/g, '_'),
    schema,
    instructions,
    context,
  );
  validateEvidence(
    output,
    context.sources,
    context.interview.events.map((e) => e.id),
  );
  return output;
}
