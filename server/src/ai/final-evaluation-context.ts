import prisma from '../prisma';
import { compactInterviewContext } from './context-budget';

type SavedEvaluation = { id: number; questionId: number; revision: number; skills: unknown };
export function buildFinalEvaluationContext(interview: { id: number; title: string; status: string }, evaluations: SavedEvaluation[], maxChars = 12000) {
  const groups = new Map<string, { skill: string; rows: { rating: number; rationale: string; questionId: number }[] }>();
  for (const evaluation of evaluations) for (const item of Array.isArray(evaluation.skills) ? evaluation.skills : []) {
    if (typeof item?.skill !== 'string' || !item.skill.trim() || !Number.isInteger(item.rating) || item.rating < 1 || item.rating > 5 || typeof item.rationale !== 'string' || !item.rationale.trim()) continue;
    const name = item.skill.trim(), key = name.toLowerCase();
    if (!groups.has(key)) groups.set(key, { skill: name, rows: [] });
    groups.get(key)!.rows.push({ rating: item.rating, rationale: item.rationale.trim(), questionId: evaluation.questionId });
  }
  if (!groups.size) throw Object.assign(new Error('Finalize at least one Evaluation by skill with ratings and supporting feedback before generating the final summary.'), { status: 409 });
  const base = compactInterviewContext({ ...interview, currentQuestionId: null, currentCode: '', questions: [], submissions: [], notes: [], events: [] }, maxChars);
  const context = { ...base, interview: { ...base.interview, skillEvaluations: [] as { skill: string; sourceId: string }[] }, coverage: { ...base.coverage, finalizedEvaluations: evaluations.length, ratedSkills: groups.size, rationaleExcerpts: true } };
  const entries = [...groups.values()];
  // Numeric aggregates include every saved rating; rationale excerpts cover latest, lowest and highest feedback.
  let rationaleLimit = 600;
  while (true) {
    context.interview.skillEvaluations = [];
    context.sources = {};
    for (const [index, group] of entries.entries()) {
      const sourceId = `skill-evaluation:${index}`;
      const ratings = group.rows.map((row) => row.rating);
      const average = Math.round(ratings.reduce((total, rating) => total + rating, 0) / ratings.length * 100) / 100;
      const lowest = group.rows.reduce((a, b) => a.rating <= b.rating ? a : b);
      const highest = group.rows.reduce((a, b) => a.rating >= b.rating ? a : b);
      const representative = [...new Set([group.rows[0], lowest, highest])];
      const feedback = rationaleLimit ? representative.map((row) => `Question ${row.questionId}: ${row.rating}/5 — ${row.rationale.slice(0, rationaleLimit)}`).join('\n') : '';
      context.sources[sourceId] = `${group.skill}: interviewer mean ${average}/5; range ${Math.min(...ratings)}–${Math.max(...ratings)}; ${ratings.length} rating(s).${feedback ? `\nInterviewer feedback:\n${feedback}` : ''}`;
      context.interview.skillEvaluations.push({ skill: group.skill, sourceId });
    }
    if (JSON.stringify(context).length <= maxChars) return context;
    if (!rationaleLimit) throw Object.assign(new Error('Too many distinct skills for the final summary. Consolidate duplicate skill names before generating it.'), { status: 409 });
    rationaleLimit = Math.floor(rationaleLimit / 2);
  }
}

export async function finalEvaluationContext(id: number, authorId: number, maxChars = 12000) {
  const interview = await prisma.interview.findFirst({ where: { id, interviewerId: authorId }, select: { id: true, title: true, status: true } });
  if (!interview) throw Object.assign(new Error('Assigned interview not found'), { status: 404 });
  if (interview.status !== 'completed') throw Object.assign(new Error('End the interview before generating the final summary'), { status: 409 });
  const evaluations = await prisma.interviewEvaluation.findMany({ where: { interviewId: id, authorId, status: 'final' }, select: { id: true, questionId: true, revision: true, skills: true }, orderBy: { updatedAt: 'desc' } });
  return buildFinalEvaluationContext(interview, evaluations, maxChars);
}
