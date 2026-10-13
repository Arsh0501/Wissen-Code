import { callGroq } from '../core/openai-client';

/**
 * Resume-Based Interview Question Generator Agent.
 * 
 * Takes a candidate's resume text, job role, and experience level,
 * then generates 5 targeted interview questions with short pinpoint answers.
 */
export class ResumeQuestionAgent {
  async generate(params: {
    resume: string;
    jobRole: string;
    experienceLevel: string;
    skills?: string[];
  }): Promise<any> {
    console.log(`[ResumeAgent] Generating interview questions for role: ${params.jobRole}`);

    const systemPrompt = `You are an expert technical interviewer.
You will be given a candidate's resume and a job role.
Analyze the resume carefully and generate exactly 5 targeted interview questions.

Each question should:
- Be specific to something mentioned in the resume (a project, technology, or claim)
- Test real depth of knowledge, not surface-level understanding
- Be answerable in a technical interview setting

For each question, provide a pinpoint expected answer in 2-3 lines maximum.

Respond with ONLY a valid JSON object:
{
  "jobRole": "${params.jobRole}",
  "experienceLevel": "${params.experienceLevel}",
  "questions": [
    {
      "id": 1,
      "question": "The interview question text",
      "expectedAnswer": "2-3 line pinpoint answer",
      "category": "one of: project-based, technical-depth, system-design, behavioral-technical, problem-solving",
      "resumeReference": "Which part of the resume this question targets"
    }
  ]
}`;

    const userMessage = `Resume:\n${params.resume}\n\nJob Role: ${params.jobRole}\nExperience Level: ${params.experienceLevel}${params.skills ? `\nKey Skills to Focus On: ${params.skills.join(', ')}` : ''}`;

    const response = await callGroq(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      { jsonMode: true, maxTokens: 2048 }
    );

    try {
      return JSON.parse(response);
    } catch {
      return { raw: response, error: 'Failed to parse response as JSON' };
    }
  }

  /**
   * Analyzes resume text to automatically deduce job role, experience level,
   * key technical skills, and key projects if not manually provided.
   */
  async analyze(resume: string): Promise<ResumeAnalysis> {
    console.log('[ResumeAgent] Analyzing resume text to extract profile...');

    const systemPrompt = `You are an expert technical interviewer and resume analyst.
Analyze the candidate's resume and extract structured profile data.
Infer the primary role, experience level (strictly one of: junior, mid, senior), top technical skills, and key projects.

Respond with ONLY a valid JSON object:
{
  "jobRole": "Primary job title or role (e.g. Senior Backend Engineer, Full Stack Developer, DevOps Engineer)",
  "experienceLevel": "junior | mid | senior",
  "skills": ["Array", "of", "top", "skills", "mentioned"],
  "keyProjects": ["1-3 key project names or highlight areas"],
  "summary": "2-3 sentence overview of the candidate's background and core competencies"
}`;

    const userMessage = `Resume content:\n${resume.slice(0, 4000)}`;

    const response = await callGroq(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      { jsonMode: true, maxTokens: 800 }
    );

    try {
      const parsed = JSON.parse(response);
      return {
        jobRole: parsed.jobRole || 'Software Engineer',
        experienceLevel: ['junior', 'mid', 'senior'].includes(parsed.experienceLevel?.toLowerCase())
          ? parsed.experienceLevel.toLowerCase()
          : 'mid',
        skills: Array.isArray(parsed.skills) ? parsed.skills : [],
        keyProjects: Array.isArray(parsed.keyProjects) ? parsed.keyProjects : [],
        summary: parsed.summary || '',
      };
    } catch {
      return {
        jobRole: 'Software Engineer',
        experienceLevel: 'mid',
        skills: [],
        keyProjects: [],
        summary: '',
      };
    }
  }
}

export interface ResumeAnalysis {
  jobRole: string;
  experienceLevel: 'junior' | 'mid' | 'senior';
  skills: string[];
  keyProjects: string[];
  summary: string;
}

