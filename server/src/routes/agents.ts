import { Router, Request, Response } from 'express';
import { orchestrator } from '../agents';
import { authenticate } from '../middleware/auth';

const router = Router();

// POST /api/agents/generate-question
// We can use the authenticate middleware if we only want logged-in users (like admins) to use this.
router.post('/generate-question', async (req: Request, res: Response) => {
  try {
    const { topic, difficulty, questionType, skills, experienceLevel } = req.body;

    if (!topic || !difficulty || !questionType || !skills || !experienceLevel) {
      return res.status(400).json({ 
        error: 'Missing required parameters: topic, difficulty, questionType, skills, experienceLevel' 
      });
    }

    console.log(`[API] Received request to generate question for topic: ${topic}`);

    // Call the orchestrator
    const result = await orchestrator.runQuestionGeneration({
      topic,
      difficulty,
      questionType,
      skills,
      experienceLevel
    });

    res.json({ success: true, result });
  } catch (error: any) {
    console.error('[API] Error generating question:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
});

export default router;
