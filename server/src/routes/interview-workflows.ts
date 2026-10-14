import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { latestUIResults } from '../ai/results';
import prisma from '../prisma';
import { adminOnly } from '../middleware/adminOnly';
import { structuredAI, WorkflowError } from '../services/structured-ai';
import {
  planInputSchema,
  planSchema,
  evaluationSchema,
  observationResponseSchema,
} from '../services/workflow-schemas';

export function createInterviewWorkflowRouter(
  ai: typeof structuredAI = structuredAI,
) {
  const router = Router();
  router.use(adminOnly);
  const wrap =
    (handler: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => {
      void handler(req, res).catch(next);
    };
  async function owned(req: Request) {
    const interview = await prisma.interview.findFirst({
      where: { id: Number(req.params.id), interviewerId: req.user!.id },
      include: {
        questions: { include: { question: true } },
        submissions: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!interview)
      throw new WorkflowError(
        'Interview not found or assigned to another interviewer',
        404,
      );
    return interview;
  }
  function planQuestionId(skill: string, question: string) {
    let hash = 5381;
    for (const char of `${skill}:${question}`)
      hash = (Math.imul(hash, 33) ^ char.charCodeAt(0)) | 0;
    return -(Math.abs(hash) || 1);
  }
  function validateDuration(
    sections: z.infer<typeof planSchema>['sections'],
    duration: number,
    skills: string[],
  ) {
    if (
      skills.some(
        (skill) =>
          !sections.some(
            (s) => s.skill.trim().toLowerCase() === skill.trim().toLowerCase(),
          ),
      )
    )
      throw new WorkflowError(
        'The plan must include a section for every required skill',
      );
    if (sections.reduce((total, s) => total + s.minutes, 0) !== duration)
      throw new WorkflowError(
        'Section minutes must add up to the interview duration',
      );
  }
  router.get(
    '/:id/ai-results',
    wrap(async (req, res) => {
      const interview = await owned(req);
      const jobs = await prisma.aIJob.findMany({
        where: { interviewId: interview.id, authorId: req.user!.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      res.json({
        results: await latestUIResults(interview.id, req.user!.id),
        jobs,
        configured: !!process.env.OPENAI_API_KEY && !!process.env.REDIS_URL,
      });
    }),
  );
  router.get(
    '/:id/plan',
    wrap(async (req, res) => {
      const i = await owned(req);
      res.json(
        await prisma.interviewPlan.findUnique({ where: { interviewId: i.id } }),
      );
    }),
  );
  router.post(
    '/:id/plan/generate',
    wrap(async (req, res) => {
      const i = await owned(req);
      const input = planInputSchema.parse(req.body);
      const result = await ai(
        'interview_plan',
        planSchema,
        'Create an interview plan tailored to the job, candidate experience and required skills. Allocate positive whole minutes to every section; the total must equal durationMinutes. Cover all required skills, practical problems and follow-ups. Give concrete questions and evaluation objectives.',
        input,
      );
      validateDuration(
        result.sections,
        input.durationMinutes,
        input.requiredSkills,
      );
      const plan = await prisma.$transaction(async (tx) => {
        await tx.interview.update({
          where: { id: i.id },
          data: { timeLimitMinutes: input.durationMinutes },
        });
        return tx.interviewPlan.upsert({
          where: { interviewId: i.id },
          create: { interviewId: i.id, ...input, sections: result.sections },
          update: { ...input, sections: result.sections },
        });
      });
      res.json(plan);
    }),
  );
  router.put(
    '/:id/plan',
    wrap(async (req, res) => {
      const i = await owned(req);
      const input = planInputSchema.merge(planSchema).parse(req.body);
      validateDuration(
        input.sections,
        input.durationMinutes,
        input.requiredSkills,
      );
      const plan = await prisma.$transaction(async (tx) => {
        await tx.interview.update({
          where: { id: i.id },
          data: { timeLimitMinutes: input.durationMinutes },
        });
        return tx.interviewPlan.upsert({
          where: { interviewId: i.id },
          create: { interviewId: i.id, ...input },
          update: input,
        });
      });
      res.json(plan);
    }),
  );
  router.get(
    '/:id/evaluations',
    wrap(async (req, res) => {
      const i = await owned(req);
      res.json(
        await prisma.interviewEvaluation.findMany({
          where: { interviewId: i.id },
          orderBy: { updatedAt: 'desc' },
        }),
      );
    }),
  );
  router.put(
    '/:id/evaluations',
    wrap(async (req, res) => {
      const i = await owned(req);
      const input = evaluationSchema.parse(req.body);
      const plan = await prisma.interviewPlan.findUnique({
        where: { interviewId: i.id },
      });
      const planQuestions = plan
        ? (plan.sections as z.infer<typeof planSchema>['sections']).flatMap(
            (s) =>
              s.questions.map((question) => ({
                id: planQuestionId(s.skill, question),
                title: `${s.skill} discussion`,
                statement: question,
              })),
          )
        : [];
      const prompt =
        i.questions.find((q) => q.questionId === input.questionId)?.question ??
        planQuestions.find((q) => q.id === input.questionId);
      if (!prompt)
        throw new WorkflowError(
          'Choose a bank or plan question assigned to this interview',
        );
      if (
        new Set(input.skills.map((s) => s.skill.toLowerCase())).size !==
        input.skills.length
      )
        throw new WorkflowError('Each skill may only be rated once');
      if (
        input.status === 'final' &&
        input.skills.some((s) => s.rating === null || !s.rationale.trim())
      )
        throw new WorkflowError(
          'Provide a rating and supporting rationale for each skill before finalizing',
        );
      const latest = i.submissions.find(
        (s) => s.questionId === input.questionId,
      );
      const questionSnapshot = {
        title: prompt.title,
        statement: prompt.statement,
      };
      const executionResults = latest
        ? {
            questionSnapshot,
            submissionId: latest.id,
            score: latest.score,
            results: JSON.parse(latest.results),
            judgeMode: process.env.JUDGE_MODE === 'live' ? 'live' : 'mock',
          }
        : {
            questionSnapshot,
            results: [],
            judgeMode: process.env.JUDGE_MODE === 'live' ? 'live' : 'mock',
          };
      const key = {
        interviewId: i.id,
        questionId: input.questionId,
        authorId: req.user!.id,
      };
      const existing = await prisma.interviewEvaluation.findUnique({
        where: { interviewId_questionId_authorId: key },
      });
      const unchanged =
        existing &&
        existing.candidateAnswer === input.candidateAnswer &&
        existing.candidateCode === input.candidateCode &&
        existing.notes === input.notes &&
        JSON.stringify(existing.executionResults) ===
          JSON.stringify(executionResults);
      res.json(
        await prisma.interviewEvaluation.upsert({
          where: { interviewId_questionId_authorId: key },
          create: { ...key, ...input, executionResults, observations: [] },
          update: {
            ...input,
            executionResults,
            observations: unchanged ? existing.observations! : [],
            revision: { increment: 1 },
          },
        }),
      );
    }),
  );
  router.post(
    '/:id/evaluations/:evaluationId/observe',
    wrap(async (req, res) => {
      const i = await owned(req);
      const evaluation = await prisma.interviewEvaluation.findFirst({
        where: {
          id: Number(req.params.evaluationId),
          interviewId: i.id,
          authorId: req.user!.id,
        },
      });
      if (!evaluation) throw new WorkflowError('Evaluation not found', 404);
      const sourceText = {
        answer: evaluation.candidateAnswer,
        code: evaluation.candidateCode,
        execution: JSON.stringify(evaluation.executionResults),
        notes: evaluation.notes,
      };
      if (
        !sourceText.answer.trim() &&
        !sourceText.code.trim() &&
        !sourceText.notes.trim()
      )
        throw new WorkflowError(
          'Record the candidate response before requesting observations',
        );
      const question =
        (evaluation.executionResults as any).questionSnapshot ??
        i.questions.find((q) => q.questionId === evaluation.questionId)
          ?.question;
      const result = await ai(
        'interview_observations',
        observationResponseSchema,
        'Provide tentative skill observations using only the recorded evidence. Each observation needs exact verbatim quotes from named source strings. Never invent candidate statements or execution results. Do not describe mock verdicts as proof of correctness. Return no observations for skills with insufficient evidence. Do not make a hiring decision.',
        { question, skills: evaluation.skills, sources: sourceText },
      );
      const skills = (evaluation.skills as { skill: string }[]).map((s) =>
        s.skill.toLowerCase(),
      );
      if (
        result.observations.some(
          (o) =>
            !skills.includes(o.skill.toLowerCase()) ||
            o.evidence.some((e) => !sourceText[e.source].includes(e.quote)),
        )
      )
        throw new WorkflowError(
          'AI returned unsupported evidence. No observations were saved; please retry.',
          502,
        );
      const update = await prisma.interviewEvaluation.updateMany({
        where: { id: evaluation.id, revision: evaluation.revision },
        data: { observations: result.observations },
      });
      if (!update.count)
        throw new WorkflowError(
          'Evaluation changed during AI analysis. Retry with the saved revision.',
          409,
        );
      res.json(
        await prisma.interviewEvaluation.findUniqueOrThrow({
          where: { id: evaluation.id },
        }),
      );
    }),
  );
  return router;
}
export default createInterviewWorkflowRouter();
