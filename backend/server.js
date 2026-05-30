const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const agents = require('./agents');

const app = express();
const PORT = process.env.PORT || 5001;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Ensure upload folders exist
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PAPERS_DIR = path.join(UPLOADS_DIR, 'papers');
const REFERENCES_DIR = path.join(UPLOADS_DIR, 'references');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(PAPERS_DIR, { recursive: true });
fs.mkdirSync(REFERENCES_DIR, { recursive: true });

// Configure Multer for file storage
const paperStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PAPERS_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname)
});

const referenceStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, REFERENCES_DIR),
  filename: (req, file, cb) => cb(null, file.originalname) // keep same name for citation matching
});

const uploadPaper = multer({ storage: paperStorage });
const uploadReferences = multer({ storage: referenceStorage });

// In-Memory configurations for active session
let activeSession = {
  paperText: "",
  referenceFiles: [],
  globalStyle: null,
  agentCustomInstructions: {
    grammarian: "",
    stylist: "",
    critic: "",
    reference_auditor: "",
    plagiarism_sentinel: ""
  }
};

/**
 * Endpoint 1: Upload Paper (supports .txt, .md)
 */
app.post('/api/upload-paper', uploadPaper.single('paper'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No paper file uploaded.' });
  }

  try {
    const text = fs.readFileSync(req.file.path, 'utf-8');
    activeSession.paperText = text;
    
    // Clear old references on new paper upload to reset state
    activeSession.referenceFiles = [];
    
    return res.json({
      message: 'Paper successfully uploaded.',
      filename: req.file.originalname,
      textLength: text.length,
      sample: text.substring(0, 1000)
    });
  } catch (error) {
    return res.status(500).json({ error: `Failed to read paper file: ${error.message}` });
  }
});

/**
 * Endpoint 2: Upload Reference Library PDFs
 */
app.post('/api/upload-references', uploadReferences.array('references'), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No reference files uploaded.' });
  }

  const uploadedFiles = req.files.map(file => ({
    name: file.originalname,
    path: file.path,
    size: file.size
  }));

  activeSession.referenceFiles = [...activeSession.referenceFiles, ...uploadedFiles];

  return res.json({
    message: 'Reference library updated.',
    filesCount: activeSession.referenceFiles.length,
    files: activeSession.referenceFiles.map(f => f.name)
  });
});

/**
 * Endpoint 3: Clear reference files
 */
app.post('/api/clear-references', (req, res) => {
  activeSession.referenceFiles = [];
  return res.json({ message: 'Reference library cleared.' });
});

/**
 * Endpoint 4: Get Current Session State
 */
app.get('/api/session-state', (req, res) => {
  return res.json({
    hasPaper: activeSession.paperText.length > 0,
    referenceFiles: activeSession.referenceFiles.map(f => f.name),
    globalStyle: activeSession.globalStyle,
    agentCustomInstructions: activeSession.agentCustomInstructions,
    profiles: agents.AGENT_PROFILES
  });
});

/**
 * Endpoint 5: Configure Custom Instructions
 */
app.post('/api/configure-instructions', (req, res) => {
  const { instructions } = req.body;
  if (!instructions) {
    return res.status(400).json({ error: 'Instructions configuration required.' });
  }

  activeSession.agentCustomInstructions = {
    ...activeSession.agentCustomInstructions,
    ...instructions
  };

  return res.json({
    message: 'Agent configurations successfully saved.',
    instructions: activeSession.agentCustomInstructions
  });
});

/**
 * Endpoint 6: Run Style Analysis (Phase 1)
 */
app.post('/api/extract-style', async (req, res) => {
  const apiKey = req.headers['x-api-key'] || process.env.GEMINI_API_KEY;
  const modelName = req.body.model || 'gemini-1.5-flash';
  
  if (!apiKey) {
    return res.status(401).json({ error: 'Gemini API Key is missing. Please enter it in the dashboard.' });
  }

  const textToAnalyze = req.body.text || activeSession.paperText;
  if (!textToAnalyze) {
    return res.status(400).json({ error: 'No paper text available for analysis.' });
  }

  try {
    const styleGuide = await agents.extractGlobalStyleGuide(apiKey, modelName, textToAnalyze);
    activeSession.globalStyle = styleGuide;
    return res.json({ styleGuide });
  } catch (error) {
    return res.status(500).json({ error: `Failed to extract style: ${error.message}` });
  }
});

/**
 * Endpoint 7: Process Segment (Phase 2 & 3 & Debate)
 */
app.post('/api/process-segment', async (req, res) => {
  const apiKey = req.headers['x-api-key'] || process.env.GEMINI_API_KEY;
  const modelName = req.body.model || 'gemini-1.5-flash';
  const { segmentText, citationKey } = req.body;

  if (!apiKey) {
    return res.status(401).json({ error: 'Gemini API Key is missing. Please enter it in the dashboard.' });
  }
  if (!segmentText) {
    return res.status(400).json({ error: 'Segment text is required.' });
  }

  // Ensure we have a global style guide
  let styleGuide = activeSession.globalStyle;
  if (!styleGuide) {
    styleGuide = {
      language: "German",
      spellingStyle: "Neue deutsche Rechtschreibung",
      citationFormat: "APA",
      oxfordComma: "false",
      tone: "formal",
      recommendedGenderStyle: "Generic Masculine"
    };
  }

  try {
    console.log(`[Server] Processing segment: "${segmentText.substring(0, 50)}..."`);

    // 1. Run Specialist Pass 1: Grammarian (Lektorat)
    const grammarianEdits = await agents.runAgentPass(
      apiKey, modelName, 'grammarian', segmentText, styleGuide, activeSession.agentCustomInstructions.grammarian
    );

    // 2. Run Specialist Pass 2: Stylist
    const stylistEdits = await agents.runAgentPass(
      apiKey, modelName, 'stylist', segmentText, styleGuide, activeSession.agentCustomInstructions.stylist
    );

    // 3. Run Specialist Pass 3: Reviewer 2 (Critic)
    const criticFeedback = await agents.runAgentPass(
      apiKey, modelName, 'critic', segmentText, styleGuide, activeSession.agentCustomInstructions.critic
    );

    // 4. Run Specialist Pass 4: Reference Auditor
    let referenceAudit = { status: "green", message: "No references cited in this segment.", matchSnippet: "" };
    if (citationKey) {
      referenceAudit = await agents.auditReferenceClaims(segmentText, citationKey, activeSession.referenceFiles);
    } else {
      // Try to auto-detect inline citation if any
      const matchCitation = segmentText.match(/\(([^)]+)\)/) || segmentText.match(/\[([^\]]+)\]/);
      if (matchCitation && matchCitation[1]) {
        referenceAudit = await agents.auditReferenceClaims(segmentText, matchCitation[1], activeSession.referenceFiles);
      }
    }

    // 5. Run Consolidator (Phase 3)
    const consolidationResult = await agents.runConsolidationPass(
      apiKey, modelName, segmentText, grammarianEdits, stylistEdits, styleGuide
    );

    // 6. Generate WhatsApp-style debate logs (Transparency Feature!)
    const reasoning = `Merged style refinement ('${stylistEdits.substring(0, 30)}...') and grammar check ('${grammarianEdits.substring(0, 30)}...'). Citation status is ${referenceAudit.status}.`;
    const debateLog = await agents.generateAgentDebate(
      apiKey,
      modelName,
      segmentText,
      grammarianEdits,
      stylistEdits,
      criticFeedback,
      referenceAudit.message,
      reasoning
    );

    return res.json({
      originalText: segmentText,
      finalText: consolidationResult.finalText,
      changes: consolidationResult.changes,
      criticFeedback,
      referenceAudit,
      debateLog
    });

  } catch (error) {
    console.error("[Server] Error processing segment:", error);
    return res.status(500).json({ error: `Segment processing failed: ${error.message}` });
  }
});

/**
 * Endpoint 8: Standalone Plagiarism Check
 */
app.post('/api/plagiarism-check', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Text content is required for plagiarism check.' });
  }

  try {
    const auditResult = await agents.auditPlagiarism(text, activeSession.referenceFiles);
    return res.json(auditResult);
  } catch (error) {
    return res.status(500).json({ error: `Plagiarism scan failed: ${error.message}` });
  }
});

// Serve static frontend assets in production (ideal for Docker & Portainer single-container deployment)
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(distPath)) {
  console.log(`[Server] Production build found at ${distPath}. Serving static frontend.`);
  app.use(express.static(distPath));
  
  // Serve React App on all non-API paths
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  console.log(`[Server] No frontend dist folder found. Running in API-only dev mode.`);
}

// Start Server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 Expert Panel Backend active on http://localhost:${PORT}`);
  console.log(`==================================================`);
});
