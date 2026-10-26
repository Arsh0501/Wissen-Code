import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../prisma';
import { adminOnly } from '../middleware/adminOnly';
import { structuredAI, WorkflowError } from '../services/structured-ai';
import {
  generationSchema,
  questionContentSchema,
  questionGenerationSchema,
  starterCodesFrom,
  validationSchema,
} from '../services/workflow-schemas';
import { executeCode, isMockMode } from '../services/judge0';
import pdfParse from 'pdf-parse';

export function createAIWorkflowRouter(
  dependencies: {
    ai?: typeof structuredAI;
    execute?: typeof executeCode;
    mockMode?: typeof isMockMode;
  } = {},
) {
  const ai = dependencies.ai ?? structuredAI;
  const execute = dependencies.execute ?? executeCode;
  const mockMode = dependencies.mockMode ?? isMockMode;
  const router = Router();
  router.use(adminOnly);
  const wrap =
    (handler: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => {
      void handler(req, res).catch(next);
    };
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Prompts carry a short excerpt per existing question; exact-duplicate checks use full text.
  const excerpt = (q: { title: string; statement: string }) => ({
    title: q.title,
    statement: q.statement.length > 240 ? `${q.statement.slice(0, 240)}…` : q.statement,
  });
  const serialize = (d: any) => ({
    ...d,
    content: questionContentSchema.parse(d.content),
  });

  router.get('/status', (_req, res) =>
    res.json({
      configured: !!process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      canVerify: !mockMode(),
    }),
  );
  router.get(
    '/drafts',
    wrap(async (_req, res) => {
      res.json(
        (
          await prisma.aIQuestionDraft.findMany({
            orderBy: { updatedAt: 'desc' },
            take: 200,
          })
        ).map(serialize),
      );
    }),
  );
  async function generateDrafts(
    input: z.infer<typeof generationSchema>,
    authorId: number,
  ) {
    const bank = (
      await prisma.question.findMany({
        select: { title: true, statement: true },
        orderBy: { id: 'desc' },
        take: 150,
      })
    ).map(excerpt);
    const output = await ai(
      'generated_questions',
      z.object({ questions: z.array(questionGenerationSchema) }),
      'Generate original, unambiguous coding/debugging questions matching every requested constraint. Include at least one sample and one hidden edge case, exact stdin/stdout specifications, a correct Python reference solution and explanation. Provide starter code that reads stdin and prints stdout in Python (starterCodePython), C++ (starterCodeCpp), Java (starterCodeJava, class Main) and JavaScript (starterCodeJavaScript, Node.js). Do not repeat supplied bank questions. Return exactly the requested count.',
      { ...input, existingQuestions: bank, _authorId: authorId },
    );
    if (
      output.questions.length !== input.count ||
      output.questions.some(
        (q) =>
          q.difficulty !== input.difficulty ||
          q.questionType !== input.questionType,
      )
    )
      throw new WorkflowError(
        'AI output did not match the requested count, type or difficulty. Retry generation.',
        502,
      );
    return prisma.$transaction(
      output.questions.map((content) =>
        prisma.aIQuestionDraft.create({ data: { authorId, content } }),
      ),
    );
  }
  router.post(
    '/generate',
    wrap(async (req, res) => {
      const drafts = await generateDrafts(
        generationSchema.parse(req.body),
        req.user!.id,
      );
      res.status(201).json(drafts.map(serialize));
    }),
  );
  // One click: generate, validate every draft and move the passing ones into the bank.
  router.post(
    '/auto',
    wrap(async (req, res) => {
      const drafts = await generateDrafts(
        generationSchema.parse(req.body),
        req.user!.id,
      );
      const added: { id: number; questionId: number; title: string; verified: boolean }[] = [];
      const needsReview: { id: number; title: string; failed: string[]; reason: string }[] = [];
      for (const draft of drafts) {
        const title = questionContentSchema.parse(draft.content).title;
        try {
          const validated = await validateDraftRecord(draft);
          const validation = validated.validation as any;
          if (!validation?.passed) {
            needsReview.push({
              id: draft.id,
              title,
              failed: validation?.checks?.filter((c: any) => !c.passed).map((c: any) => c.key) ?? [],
              reason: validation?.feedback ?? 'Validation did not pass.',
            });
            continue;
          }
          const approved = await approveDraftRecord(draft.id, validated.revision, req.user!.id);
          added.push({
            id: draft.id,
            questionId: approved.questionId!,
            title,
            verified: validation.executionVerified === true,
          });
        } catch (error: any) {
          needsReview.push({
            id: draft.id,
            title,
            failed: [],
            reason: error instanceof WorkflowError ? error.message : 'Validation failed. Open the draft and retry.',
          });
        }
      }
      res.status(201).json({
        drafts: (
          await prisma.aIQuestionDraft.findMany({ where: { id: { in: drafts.map((d) => d.id) } } })
        ).map(serialize),
        added,
        needsReview,
      });
    }),
  );
  router.post(
    '/drafts',
    wrap(async (req, res) => {
      const content = questionContentSchema.parse(req.body);
      res
        .status(201)
        .json(
          serialize(
            await prisma.aIQuestionDraft.create({
              data: { authorId: req.user!.id, content },
            }),
          ),
        );
    }),
  );
  router.put(
    '/drafts/:id',
    wrap(async (req, res) => {
      const input = z
        .object({
          content: questionContentSchema,
          revision: z.number().int().positive(),
        })
        .parse(req.body);
      const updated = await prisma.aIQuestionDraft.updateMany({
        where: {
          id: Number(req.params.id),
          revision: input.revision,
          status: { not: 'approved' },
        },
        data: {
          content: input.content,
          status: 'draft',
          validation: undefined,
          validatedRevision: null,
          revision: { increment: 1 },
        },
      });
      if (!updated.count)
        throw new WorkflowError(
          'This draft changed or is approved. Reload before editing.',
          409,
        );
      res.json(
        serialize(
          await prisma.aIQuestionDraft.findUniqueOrThrow({
            where: { id: Number(req.params.id) },
          }),
        ),
      );
    }),
  );
  async function validateDraftRecord(draft: {
    id: number;
    revision: number;
    status: string;
    content: unknown;
  }) {
    if (draft.status === 'approved')
      throw new WorkflowError('Approved questions cannot be revalidated', 409);
    const content = questionContentSchema.parse(draft.content);
    const bank = await prisma.question.findMany({
      select: { id: true, title: true, statement: true },
    });
    const duplicates = bank.filter(
      (q) =>
        normalize(q.title) === normalize(content.title) ||
        normalize(q.statement) === normalize(content.statement),
    );
    const otherDrafts = await prisma.aIQuestionDraft.findMany({
      where: { id: { not: draft.id }, status: { not: 'approved' } },
      select: { id: true, content: true },
    });
    const draftDuplicates = otherDrafts.filter((d) => {
      const q = questionContentSchema.parse(d.content);
      return (
        normalize(q.title) === normalize(content.title) ||
        normalize(q.statement) === normalize(content.statement)
      );
    });
    const result = await ai(
      'question_validation',
      validationSchema,
      'Independently validate all seven checks exactly once: duplicate, correctness, ambiguity, difficulty, testCases, expectedSolution, edgeCases. A passed duplicate check means no duplicate. Solve the problem and examine every expected output and reference solution. Compare to existing questions for semantic duplicates. Cite concrete evidence for each check; any uncertainty must fail that check.',
      {
        question: content,
        bank: bank.map(excerpt),
        otherDrafts: otherDrafts
          .slice(0, 20)
          .map((d) => excerpt(questionContentSchema.parse(d.content))),
      },
    );
    const keys = [
      'duplicate',
      'correctness',
      'ambiguity',
      'difficulty',
      'testCases',
      'expectedSolution',
      'edgeCases',
    ];
    if (
      new Set(result.checks.map((c) => c.key)).size !== 7 ||
      result.checks.length !== 7 ||
      !keys.every((k) => result.checks.some((c) => c.key === k))
    )
      throw new WorkflowError('Validator omitted checks. Please retry.', 502);
    if (duplicates.length || draftDuplicates.length) {
      const check = result.checks.find((c) => c.key === 'duplicate')!;
      check.passed = false;
      check.evidence = `Exact duplicate detected: bank IDs ${duplicates.map((q) => q.id).join(', ')}; draft IDs ${draftDuplicates.map((q) => q.id).join(', ')}`;
    }
    const sampleAndHidden =
      content.testCases.some((t) => t.isSample) &&
      content.testCases.some((t) => !t.isSample);
    const executions: { index: number; passed: boolean; status: string }[] = [];
    if (!mockMode()) {
      for (const [index, tc] of content.testCases.entries()) {
        const run = await execute({
          sourceCode: content.expectedSolutionPython,
          languageId: 71,
          stdin: tc.input,
          expectedOutput: tc.expectedOutput,
          cpuTimeLimit: 5,
          memoryLimit: 256000,
        });
        executions.push({
          index,
          passed:
            run.status.id === 3 &&
            (run.stdout || '').trim() === tc.expectedOutput.trim(),
          status: run.status.description,
        });
      }
    }
    const verified =
      executions.length === content.testCases.length &&
      executions.every((e) => e.passed);
    // Without a live judge the reference solution cannot be executed. The AI review still
    // decides; the question then enters the bank tagged "unverified" for a later real run.
    const verificationPending = mockMode();
    for (const key of ['testCases', 'expectedSolution']) {
      const check = result.checks.find((c) => c.key === key)!;
      if (!sampleAndHidden) {
        check.passed = false;
        check.evidence += ' Sample and hidden test cases are both required.';
      } else if (verificationPending) {
        check.evidence +=
          ' Not executed (mock judge): the question is added as unverified until a live judge confirms the reference solution.';
      } else if (!verified) {
        check.passed = false;
        check.evidence += ' Reference execution failed.';
      }
    }
    const validation = {
      ...result,
      executions,
      executionVerified: verified,
      verificationPending,
      passed: result.checks.every((c) => c.passed),
      revision: draft.revision,
    };
    const update = await prisma.aIQuestionDraft.updateMany({
      where: {
        id: draft.id,
        revision: draft.revision,
        status: { not: 'approved' },
      },
      data: {
        validation,
        validatedRevision: draft.revision,
        status: validation.passed ? 'validated' : 'needs_changes',
      },
    });
    if (!update.count)
      throw new WorkflowError(
        'Draft was edited during validation. Validate the new revision.',
        409,
      );
    return prisma.aIQuestionDraft.findUniqueOrThrow({ where: { id: draft.id } });
  }
  router.post(
    '/drafts/:id/validate',
    wrap(async (req, res) => {
      const draft = await prisma.aIQuestionDraft.findUnique({
        where: { id: Number(req.params.id) },
      });
      if (!draft) throw new WorkflowError('Draft not found', 404);
      res.json(serialize(await validateDraftRecord(draft)));
    }),
  );
  // ---- Resume → tailored assessment -------------------------------------------------
  const resumeAssessmentSchema = z.object({
    resumeText: z.string().max(60000).optional(),
    resumePdfBase64: z.string().max(12_000_000).optional(),
    fileName: z.string().max(200).optional(),
    role: z.string().trim().max(300).optional(),
    questionCount: z.number().int().min(1).max(8).default(4),
    difficulty: z.enum(['mixed', 'easy', 'medium', 'hard']).default('mixed'),
    timeLimitMinutes: z.number().int().min(10).max(240).optional(),
    candidateEmail: z.string().email().max(254).optional(),
  });
  const resumeProfileSchema = z.object({
    candidateName: z.string(),
    experienceLevel: z.enum(['intern', 'junior', 'mid', 'senior', 'staff']),
    yearsOfExperience: z.number(),
    primaryLanguages: z.array(z.string()).max(6),
    skills: z.array(z.string()).max(20),
    summary: z.string(),
    assessmentName: z.string(),
    timeLimitMinutes: z.number().int(),
    plan: z
      .array(
        z.object({
          topic: z.string(),
          difficulty: z.enum(['easy', 'medium', 'hard']),
          rationale: z.string(),
        }),
      )
      .min(1)
      .max(8),
  });
  const MARKS: Record<string, number> = { easy: 10, medium: 20, hard: 30 };
  // Words too generic to tell one coding topic from another (languages, boilerplate tags).
  const GENERIC = new Set([
    'and', 'the', 'with', 'for', 'using', 'python', 'java', 'javascript', 'c++', 'cpp', 'go',
    'golang', 'sql', 'data', 'structures', 'structure', 'algorithms', 'algorithm', 'problem',
    'solving', 'coding', 'programming', 'ai-generated', 'unverified', 'basic', 'basics',
    'fundamentals', 'intro', 'introduction', 'medium', 'easy', 'hard', 'level',
  ]);
  const tokens = (text: string) =>
    text
      .toLowerCase()
      .split(/[^a-z0-9+#]+/)
      .filter((t) => t.length > 2 && !GENERIC.has(t));

  async function resumeTextFrom(input: z.infer<typeof resumeAssessmentSchema>) {
    if (input.resumeText?.trim()) return input.resumeText.trim().slice(0, 15000);
    if (input.resumePdfBase64) {
      const buffer = Buffer.from(input.resumePdfBase64.replace(/^data:[^,]*,/, ''), 'base64');
      if (buffer.length > 8 * 1024 * 1024)
        throw new WorkflowError('Resume PDF must be under 8 MB.', 413);
      try {
        const parsed = await pdfParse(buffer);
        return parsed.text.replace(/\s+\n/g, '\n').trim().slice(0, 15000);
      } catch {
        throw new WorkflowError('Could not read this PDF. Try exporting it again or paste the text.', 400);
      }
    }
    return '';
  }

  async function questionFromContent(
    q: z.infer<typeof questionContentSchema>,
    difficulty: 'easy' | 'medium' | 'hard',
    extra: Record<string, unknown>,
  ) {
    return prisma.question.create({
      data: {
        title: q.title,
        statement: q.statement,
        difficulty,
        questionType: q.questionType,
        tags: JSON.stringify([
          ...new Set([...q.topics, ...q.requiredSkills, 'ai-generated', 'unverified']),
        ]),
        settings: { aiGenerated: true, executionVerified: false, ...extra },
        testCases: { create: q.testCases },
        starterCodes: { create: starterCodesFrom(q) },
      },
    });
  }

  router.post(
    '/auto-assessment',
    wrap(async (req, res) => {
      const input = resumeAssessmentSchema.parse(req.body);
      const resume = await resumeTextFrom(input);
      if (resume.length < 80)
        throw new WorkflowError(
          'Upload a resume (PDF or text) or paste at least a few lines about the candidate.',
          400,
        );
      const bank = await prisma.question.findMany({
        where: { questionType: { in: ['coding', 'debugging'] } },
        select: { id: true, title: true, difficulty: true, tags: true },
        orderBy: { id: 'desc' },
        take: 400,
      });
      const bankTopics = [
        ...new Set(bank.flatMap((q) => JSON.parse(q.tags) as string[])),
      ].slice(0, 80);
      const profile = await ai(
        'resume_profile',
        resumeProfileSchema,
        `Read the resume and design a fair coding assessment for this candidate${input.role ? ` applying for: ${input.role}` : ''}. Return the candidate profile and a plan of exactly ${input.questionCount} coding question topics that test the skills the resume claims, ordered easy to hard. Each topic must be a specific, testable problem area (e.g. 'hash map frequency counting', 'topological sort with cycle detection', 'LRU cache with O(1) operations'), never a bare language or a generic phrase like 'data structures'${input.difficulty !== 'mixed' ? `, all ${input.difficulty}` : ''}. Prefer topics from the supplied bank topics when they fit. Suggest a realistic time limit in minutes (20-180) and a short assessment name including the role or level. Use only facts present in the resume; if the name is missing, use "Candidate".`,
        { resume, role: input.role ?? null, bankTopics, questionCount: input.questionCount },
      );
      const plan = profile.plan.slice(0, input.questionCount).map((item) => ({
        ...item,
        difficulty: input.difficulty === 'mixed' ? item.difficulty : input.difficulty,
      }));
      const used = new Set<number>();
      const chosen: { id: number; title: string; difficulty: string; source: 'bank' | 'generated'; topic: string }[] = [];
      const skipped: { topic: string; reason: string }[] = [];
      for (const item of plan) {
        const words = new Set(tokens(item.topic));
        const scored = bank
          .filter((q) => !used.has(q.id))
          .map((q) => {
            const haystack = [...(JSON.parse(q.tags) as string[]), q.title].flatMap(tokens);
            const overlap = haystack.filter((w) => words.has(w)).length;
            return { q, overlap, sameDifficulty: q.difficulty === item.difficulty };
          })
          .filter((m) => m.overlap > 0)
          .sort((a, b) => Number(b.sameDifficulty) - Number(a.sameDifficulty) || b.overlap - a.overlap);
        const match = scored[0];
        // Reuse a bank question only when it clearly covers the topic at the planned level.
        if (match && match.sameDifficulty && match.overlap >= 1) {
          used.add(match.q.id);
          chosen.push({ id: match.q.id, title: match.q.title, difficulty: match.q.difficulty, source: 'bank', topic: item.topic });
          continue;
        }
        let drafts: Awaited<ReturnType<typeof generateDrafts>>;
        try {
          drafts = await generateDrafts(
            {
              topic: `${item.topic} (${item.rationale})`,
              difficulty: item.difficulty,
              questionType: 'coding',
              count: 1,
              requiredSkills: profile.primaryLanguages.length ? profile.primaryLanguages.slice(0, 3) : ['Python'],
            },
            req.user!.id,
          );
        } catch (error) {
          // The model could not write this question: fall back to the closest bank question at
          // any difficulty, or leave the slot out and tell the admin, rather than failing the run.
          const fallback = scored[0];
          if (fallback) {
            used.add(fallback.q.id);
            chosen.push({ id: fallback.q.id, title: fallback.q.title, difficulty: fallback.q.difficulty, source: 'bank', topic: item.topic });
          } else {
            skipped.push({ topic: item.topic, reason: error instanceof Error ? error.message.slice(0, 160) : 'generation failed' });
          }
          continue;
        }
        const content = questionContentSchema.parse(drafts[0].content);
        const created = await questionFromContent(content, item.difficulty, {
          generatedFor: 'resume-assessment',
          topic: item.topic,
        });
        await prisma.aIQuestionDraft.update({
          where: { id: drafts[0].id },
          data: { status: 'approved', approvedBy: req.user!.id, approvedAt: new Date(), questionId: created.id },
        });
        used.add(created.id);
        chosen.push({ id: created.id, title: created.title, difficulty: item.difficulty, source: 'generated', topic: item.topic });
      }
      if (!chosen.length)
        throw new WorkflowError(
          `No questions could be prepared (${skipped[0]?.reason ?? 'unknown error'}). Try again or lower the question count.`,
          502,
        );
      const timeLimit = Math.min(
        240,
        Math.max(10, input.timeLimitMinutes ?? profile.timeLimitMinutes ?? 60),
      );
      const assessment = await prisma.assessment.create({
        data: {
          name: profile.assessmentName.slice(0, 140),
          description: `Tailored from ${profile.candidateName}'s resume (${profile.experienceLevel}, ${profile.yearsOfExperience} yrs). ${profile.summary}`.slice(0, 1000),
          timeLimitMinutes: timeLimit,
          passingScore: 60,
          status: 'draft',
          questionCount: chosen.length,
          difficulty: input.difficulty,
          questionTypes: JSON.stringify(['coding']),
          topics: JSON.stringify([]),
          requiredSkills: JSON.stringify(profile.skills.slice(0, 8)),
          allowedEmails: JSON.stringify(input.candidateEmail ? [input.candidateEmail.toLowerCase()] : []),
          requireCamera: true,
          questions: {
            create: chosen.map((q, i) => ({
              questionId: q.id,
              orderIndex: i,
              marks: MARKS[q.difficulty] ?? 20,
            })),
          },
        },
      });
      res.status(201).json({
        assessmentId: assessment.id,
        name: assessment.name,
        timeLimitMinutes: assessment.timeLimitMinutes,
        profile: {
          candidateName: profile.candidateName,
          experienceLevel: profile.experienceLevel,
          yearsOfExperience: profile.yearsOfExperience,
          primaryLanguages: profile.primaryLanguages,
          skills: profile.skills,
          summary: profile.summary,
        },
        plan,
        questions: chosen,
        skipped,
        resumeChars: resume.length,
      });
    }),
  );

  async function approveDraftRecord(draftId: number, revision: number, userId: number) {
    return prisma.$transaction(
      async (tx) => {
        const draft = await tx.aIQuestionDraft.findUnique({ where: { id: draftId } });
        if (!draft) throw new WorkflowError('Draft not found', 404);
        if (draft.status === 'approved') return draft;
        const validation = draft.validation as any;
        if (
          draft.status !== 'validated' ||
          draft.revision !== revision ||
          draft.validatedRevision !== revision ||
          !validation?.passed
        )
          throw new WorkflowError(
            'Save and successfully validate the latest revision before approving.',
            409,
          );
        const q = questionContentSchema.parse(draft.content);
        const bank = await tx.question.findMany({
          select: { title: true, statement: true },
        });
        if (
          bank.some(
            (b) =>
              normalize(b.title) === normalize(q.title) ||
              normalize(b.statement) === normalize(q.statement),
          )
        )
          throw new WorkflowError('This question already exists in the bank.', 409);
        const verified = validation.executionVerified === true;
        const created = await tx.question.create({
          data: {
            title: q.title,
            statement: q.statement,
            difficulty: q.difficulty,
            questionType: q.questionType,
            tags: JSON.stringify([
              ...new Set([
                ...q.topics,
                ...q.requiredSkills,
                'ai-generated',
                ...(verified ? [] : ['unverified']),
              ]),
            ]),
            settings: { aiGenerated: true, executionVerified: verified },
            testCases: { create: q.testCases },
            starterCodes: { create: starterCodesFrom(q) },
          },
        });
        return tx.aIQuestionDraft.update({
          where: { id: draft.id },
          data: {
            status: 'approved',
            approvedBy: userId,
            approvedAt: new Date(),
            questionId: created.id,
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }
  router.post(
    '/drafts/:id/approve',
    wrap(async (req, res) => {
      const revision = z
        .object({ revision: z.number().int().positive() })
        .parse(req.body).revision;
      res.json(
        serialize(await approveDraftRecord(Number(req.params.id), revision, req.user!.id)),
      );
    }),
  );
  return router;
}
export default createAIWorkflowRouter();
