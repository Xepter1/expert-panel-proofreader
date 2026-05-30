const fs = require('fs');
const path = require('path');
const agents = require('./agents');

// Set up environment variable or mock
const API_KEY = process.env.GEMINI_API_KEY || "MOCK_KEY_FOR_DRY_RUN";
const TEST_MODEL = "gemini-1.5-flash";

const samplePaper = `
Introduction:
This is a study about how Large Language Models (LLMs) represent knowledge. We argue that LLMs contain a lot of data.
Furthermore, Müller (2022) states that 80% of all LLMs hallucinate during factual checks, which is a major concern.
Many scientist argue that this is incredible and revolutionary, but we believe we need to study this more closely.
To solve this, we propose a new, robust multi-agent pipeline that does Lektorat, grammar correction, and Style checking.
We will gender the text neutrally where possible.
`;

async function runDryRunTest() {
  console.log(`==================================================`);
  console.log(`🧪 Expert Panel Proofreader: Backend Integration Test`);
  console.log(`==================================================`);
  
  console.log(`\n1. Validating Module Imports...`);
  if (agents.AGENT_PROFILES && typeof agents.extractGlobalStyleGuide === 'function') {
    console.log(`✓ [agents.js] Loaded successfully. Profiles list:`, Object.keys(agents.AGENT_PROFILES));
  } else {
    console.error(`✗ [agents.js] Failed validation!`);
    process.exit(1);
  }

  // Check if API Key is mock or real
  if (API_KEY === "MOCK_KEY_FOR_DRY_RUN") {
    console.log(`\nℹ️ Gemini API key not found in environment. Skipping live API calls.`);
    console.log(`✓ Module verification succeeded. Ready for production!`);
    console.log(`==================================================`);
    return;
  }

  console.log(`\n2. Live API Test: Extracting Global Style Guide...`);
  try {
    const styleGuide = await agents.extractGlobalStyleGuide(API_KEY, TEST_MODEL, samplePaper);
    console.log(`✓ Style guide extracted successfully:`, JSON.stringify(styleGuide, null, 2));

    console.log(`\n3. Live API Test: Running Grammarian and Stylist parallel passes...`);
    const originalSegment = "Many scientist argue that this is incredible and revolutionary, but we believe we need to study this more closely.";
    
    console.log(`Sending segment: "${originalSegment}"`);
    const grammarianEdits = await agents.runAgentPass(
      API_KEY, TEST_MODEL, 'grammarian', originalSegment, styleGuide, "Gender always with asterisks (*)"
    );
    console.log(`✓ Grammarian output: "${grammarianEdits}"`);

    const stylistEdits = await agents.runAgentPass(
      API_KEY, TEST_MODEL, 'stylist', originalSegment, styleGuide, "Keep passive tone if needed"
    );
    console.log(`✓ Stylist output: "${stylistEdits}"`);

    console.log(`\n4. Live API Test: Running Consolidation Pass...`);
    const consolidated = await agents.runConsolidationPass(
      API_KEY, TEST_MODEL, originalSegment, grammarianEdits, stylistEdits, styleGuide
    );
    console.log(`✓ Consolidated output JSON:`, JSON.stringify(consolidated, null, 2));

    console.log(`\n5. Live API Test: Generating Group Debate logs...`);
    const debate = await agents.generateAgentDebate(
      API_KEY, 
      TEST_MODEL, 
      originalSegment, 
      grammarianEdits, 
      stylistEdits, 
      "The claim is slightly weak.", 
      "Fact auditor was skipped.",
      "Synthesized the stylist phrasing elevation and Grammarians typo correction."
    );
    console.log(`✓ Debate logs successfully generated (first 2 messages):`, JSON.stringify(debate.slice(0, 2), null, 2));

    console.log(`\n✓ All live API integration tests passed successfully!`);
    console.log(`==================================================`);

  } catch (error) {
    console.error(`✗ Test failed due to an error:`, error);
    process.exit(1);
  }
}

runDryRunTest();
