import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { QuestionCreationPipeline, ResumeQuestionAgent } from '../agents';
import { extractTextFromPdf } from '../services/resume-parser';
import { authenticate } from '../middleware/auth';

const router = Router();
const pipeline = new QuestionCreationPipeline();
const resumeAgent = new ResumeQuestionAgent();

// ─────────────────────────────────────────────────────────────────
// Multer Configuration (In-Memory Buffer for PDF)
// ─────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB maximum
  },
  fileFilter: (_req, file, cb) => {
    const isPdf =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF (.pdf) files are supported.'));
    }
  },
});

// Middleware that handles 'resume' or 'file' field and formats errors cleanly
const uploadResumePdf = (req: Request, res: Response, next: NextFunction) => {
  const handler = upload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ]);

  handler(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, error: 'File too large. Maximum size is 10MB.' });
      }
      return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ success: false, error: err.message || 'File upload failed' });
    }
    next();
  });
};

function getUploadedResumeFile(req: Request): Express.Multer.File | undefined {
  if (req.file) return req.file;
  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  if (files?.resume?.[0]) return files.resume[0];
  if (files?.file?.[0]) return files.file[0];
  return undefined;
}

// ─────────────────────────────────────────────────────────────────
// POST /api/agents/generate-question
// Generates a DSA/Coding assessment question with test cases & starter code
// ─────────────────────────────────────────────────────────────────
router.post('/generate-question', async (req: Request, res: Response) => {
  try {
    const { topic, difficulty, questionType, skills, experienceLevel } = req.body;

    if (!topic || !difficulty || !questionType || !skills || !experienceLevel) {
      return res.status(400).json({ 
        error: 'Missing required parameters: topic, difficulty, questionType, skills, experienceLevel' 
      });
    }

    console.log(`[API] Generating DSA question for topic: ${topic}`);

    const result = await pipeline.run({
      category: 'assessment',
      topic,
      difficulty,
      questionType,
      skills,
      experienceLevel,
    });

    res.json({ success: true, result });
  } catch (error: any) {
    console.error('[API] Error generating question:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/agents/generate-resume-questions
// Takes a resume and generates 5 targeted interview questions
// with pinpoint 2-3 line answers
// ─────────────────────────────────────────────────────────────────
router.post('/generate-resume-questions', async (req: Request, res: Response) => {
  try {
    const { resume, jobRole, experienceLevel, skills } = req.body;

    if (!resume || !jobRole || !experienceLevel) {
      return res.status(400).json({ 
        error: 'Missing required parameters: resume, jobRole, experienceLevel' 
      });
    }

    console.log(`[API] Generating resume-based questions for role: ${jobRole}`);

    const result = await resumeAgent.generate({
      resume,
      jobRole,
      experienceLevel,
      skills,
    });

    res.json({ success: true, result });
  } catch (error: any) {
    console.error('[API] Error generating resume questions:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// NEW OPTION 1: POST /api/agents/upload-resume-pdf
// Takes a PDF file via multipart/form-data, extracts plain text in-memory,
// and auto-analyzes the candidate profile (jobRole, experienceLevel, skills).
// ─────────────────────────────────────────────────────────────────
router.post('/upload-resume-pdf', uploadResumePdf, async (req: Request, res: Response) => {
  try {
    const file = getUploadedResumeFile(req);
    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No PDF file uploaded. Please upload a file with field name "resume" or "file".',
      });
    }

    console.log(`[API] Extracting text from PDF: ${file.originalname} (${file.size} bytes)`);
    const { text, numPages, info } = await extractTextFromPdf(file.buffer);

    if (!text || text.length < 20) {
      return res.status(400).json({
        success: false,
        error: 'Could not extract readable text from the uploaded PDF. Please make sure the PDF is not an image scan.',
      });
    }

    // Auto-analyze profile from the extracted text
    const profile = await resumeAgent.analyze(text);

    res.json({
      success: true,
      filename: file.originalname,
      numPages,
      textLength: text.length,
      extractedText: text,
      profile,
      info,
    });
  } catch (error: any) {
    console.error('[API] Error parsing resume PDF:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to parse resume PDF' });
  }
});

// ─────────────────────────────────────────────────────────────────
// NEW OPTION 2: POST /api/agents/generate-from-resume-file
// One-click endpoint: Takes a PDF via multipart/form-data, extracts text,
// auto-fills missing fields (jobRole, experienceLevel, skills), and immediately
// generates targeted interview questions (or coding assessment questions).
// ─────────────────────────────────────────────────────────────────
router.post('/generate-from-resume-file', uploadResumePdf, async (req: Request, res: Response) => {
  try {
    const file = getUploadedResumeFile(req);
    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'No PDF file uploaded. Please upload a file with field name "resume" or "file".',
      });
    }

    console.log(`[API] Processing resume file: ${file.originalname}`);
    const { text, numPages } = await extractTextFromPdf(file.buffer);

    if (!text || text.length < 20) {
      return res.status(400).json({
        success: false,
        error: 'Could not extract readable text from the uploaded PDF. Please ensure the PDF has selectable text.',
      });
    }

    // Parse optional form-data fields
    let { jobRole, experienceLevel, skills, targetType = 'interview' } = req.body;

    // Parse skills if passed as JSON string or comma-separated string
    let parsedSkills: string[] | undefined;
    if (typeof skills === 'string') {
      try {
        parsedSkills = JSON.parse(skills);
      } catch {
        parsedSkills = skills.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
    } else if (Array.isArray(skills)) {
      parsedSkills = skills;
    }

    // If jobRole or experienceLevel are missing, auto-detect them
    let profile = null;
    if (!jobRole || !experienceLevel || !parsedSkills || parsedSkills.length === 0) {
      profile = await resumeAgent.analyze(text);
      if (!jobRole) jobRole = profile.jobRole;
      if (!experienceLevel) experienceLevel = profile.experienceLevel;
      if (!parsedSkills || parsedSkills.length === 0) parsedSkills = profile.skills;
    }

    console.log(`[API] Generating questions for role: "${jobRole}", level: "${experienceLevel}", targetType: "${targetType}"`);

    // Target: Coding assessment question
    if (targetType === 'assessment') {
      const topic = parsedSkills?.[0] || 'Data Structures & Algorithms';
      const difficulty = experienceLevel === 'senior' ? 'hard' : experienceLevel === 'junior' ? 'easy' : 'medium';

      const result = await pipeline.run({
        category: 'assessment',
        topic,
        difficulty,
        questionType: 'Coding',
        skills: parsedSkills && parsedSkills.length > 0 ? parsedSkills : ['Programming'],
        experienceLevel,
        context: profile ? `Candidate Profile Summary: ${profile.summary}` : undefined,
      });

      return res.json({
        success: true,
        source: { filename: file.originalname, numPages },
        extractedProfile: { jobRole, experienceLevel, skills: parsedSkills },
        result,
      });
    }

    // Target: Resume-based interview questions (default)
    const result = await resumeAgent.generate({
      resume: text,
      jobRole,
      experienceLevel,
      skills: parsedSkills,
    });

    res.json({
      success: true,
      source: { filename: file.originalname, numPages },
      extractedProfile: { jobRole, experienceLevel, skills: parsedSkills },
      result,
    });
  } catch (error: any) {
    console.error('[API] Error generating questions from resume file:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
});

export default router;

