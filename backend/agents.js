const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdfParser = require('./pdf-parser');

// Initialize Gemini Client helper
function getGenAIModel(apiKey, modelName = "gemini-1.5-flash", isJson = false) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const config = isJson ? { responseMimeType: "application/json" } : {};
  return genAI.getGenerativeModel({ model: modelName, generationConfig: config });
}

// Default Agent Descriptions and Custom Instructions
const AGENT_PROFILES = {
  orchestrator: {
    name: "The Orchestrator",
    role: "Global Conductor",
    avatar: "/avatars/orchestrator.png"
  },
  grammarian: {
    name: "The Grammarian",
    role: "Linguistics Expert",
    avatar: "/avatars/grammarian.png",
    defaultInstructions: "Focus purely on spelling, deep grammar, punctuation, and consistent typography. Correct any typo, comma error, or formatting issue. Ensure gender guidelines are strictly followed as instructed."
  },
  stylist: {
    name: "The Academic Stylist",
    role: "Academic Rhetoric Expert",
    avatar: "/avatars/stylist.png",
    defaultInstructions: "Elevate the text to high-level academic prose. Remove passive voice where active sounds stronger, eliminate colloquial language, remove repetitive adjectives, and improve flow and vocabulary precision."
  },
  critic: {
    name: "Reviewer 2",
    role: "Peer Reviewer & Critic",
    avatar: "/avatars/critic.png",
    defaultInstructions: "Act as a highly skeptical peer reviewer. Question methodological rigor, point out unsubstantiated claims, identify logical leaps, and challenge statistical or deductive assertions constructively."
  },
  reference_auditor: {
    name: "The Reference Auditor",
    role: "Fact & Source Detective",
    avatar: "/avatars/reference_auditor.png",
    defaultInstructions: "Cross-check references. Ensure citations are formatted correctly, look for citations that are missing bibliographic entries, and audit the validity of cited claims."
  },
  plagiarism_sentinel: {
    name: "The Plagiarism Sentinel",
    role: "Academic Integrity Officer",
    avatar: "/avatars/plagiarism_sentinel.png",
    defaultInstructions: "Examine texts to find identical patterns or paraphrased text that mimic sources closely without proper attribution. Highlight exact matching sentences."
  }
};

/**
 * Phase 1: Extract global style guideline.
 */
async function extractGlobalStyleGuide(apiKey, modelName, documentText) {
  const model = getGenAIModel(apiKey, modelName, true);
  
  // Extract a sample of the paper (first 3000 tokens)
  const sample = documentText.substring(0, 10000);
  
  const prompt = `
    You are the Style Orchestrator for a premium academic editing system.
    Analyze the following excerpt from a scientific paper and extract its global writing parameters.
    Format your response as a JSON object with the following fields:
    {
      "language": "German or English",
      "spellingStyle": "e.g., Neue deutsche Rechtschreibung, American English, British English",
      "citationFormat": "e.g., APA, IEEE, Harvard, Vancouver, or Noticed Style",
      "oxfordComma": "true/false/not-applicable",
      "tone": "e.g., active, passive-heavy, neutral, very formal",
      "commonAbbreviations": ["list of common terms found"],
      "recommendedGenderStyle": "e.g., Neutral forms, Sternchen (*), Doppelpunkt (:), or Generic Masculine"
    }

    Excerpt:
    """
    ${sample}
    """
  `;

  try {
    const result = await model.generateContent(prompt);
    const jsonText = result.response.text();
    return JSON.parse(jsonText);
  } catch (error) {
    console.error("[Backend Agents] Style guide extraction failed, using defaults:", error);
    return {
      language: "German",
      spellingStyle: "Neue deutsche Rechtschreibung",
      citationFormat: "APA",
      oxfordComma: "false",
      tone: "formal",
      commonAbbreviations: [],
      recommendedGenderStyle: "Generic Masculine"
    };
  }
}

/**
 * Invokes a specific agent to critique or correct a paragraph/chapter.
 */
async function runAgentPass(apiKey, modelName, agentKey, text, globalStyle, customInstructions = "") {
  const model = getGenAIModel(apiKey, modelName, false);
  const profile = AGENT_PROFILES[agentKey];
  const defaultInst = profile ? profile.defaultInstructions : "";
  
  const systemPrompt = `
    You are ${AGENT_PROFILES[agentKey].name}, the ${AGENT_PROFILES[agentKey].role}.
    Your profile characteristics:
    - Default Focus: ${defaultInst}
    - Custom User Instructions: ${customInstructions || "No additional rules provided."}

    The project is locked to the following Style Guide:
    - Language: ${globalStyle.language}
    - Punctuation & Style: ${globalStyle.spellingStyle}
    - Gender Rule: ${globalStyle.recommendedGenderStyle}
    - Citation: ${globalStyle.citationFormat}
    - Tone expectation: ${globalStyle.tone}

    Read the input text and perform your evaluation. Keep your edits highly professional.
    Output only your corrected text/criticism. Do not add intro or outro pleasantries.
  `;

  const userPrompt = `
    Analyze and process this text segment.
    
    Text:
    """
    ${text}
    """
  `;

  const result = await model.generateContent([systemPrompt, userPrompt]);
  return result.response.text().trim();
}

/**
 * Phase 3: The Consolidator merges Grammarian and Stylist inputs, outputting the final corrected text.
 */
async function runConsolidationPass(apiKey, modelName, originalText, grammarianCorrected, stylistCorrected, globalStyle) {
  const model = getGenAIModel(apiKey, modelName, true);

  const prompt = `
    You are the Consolidation Editor.
    Your task is to merge the corrections made by two specialists:
    1. The Grammarian (fixed typos, grammar, and gender rules).
    2. The Academic Stylist (elevated academic vocabulary and phrasing).

    Your goal is to synthesize these edits into a single, flawless, highly consistent academic text.
    You must respect the Project Style Guide:
    - Language: ${globalStyle.language}
    - Citation format: ${globalStyle.citationFormat}
    - Gender Style: ${globalStyle.recommendedGenderStyle}

    Format your output strictly as a JSON object:
    {
      "finalText": "Flawless merged text block here.",
      "changes": [
        {
          "original": "original word or subphrase",
          "replacement": "replaced word or subphrase",
          "reason": "Why the change was merged (e.g. Grammar correction, Stylistic upgrade, Gender alignment)"
        }
      ]
    }

    Inputs:
    - Original text: "${originalText.replace(/"/g, '\\"')}"
    - Grammarian edits: "${grammarianCorrected.replace(/"/g, '\\"')}"
    - Academic Stylist edits: "${stylistCorrected.replace(/"/g, '\\"')}"
  `;

  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text());
}

/**
 * Phase 2 Component: Simulates a high-transparency conversation/debate between the agents.
 */
async function generateAgentDebate(apiKey, modelName, originalText, grammarianEdits, stylistEdits, criticFeedback, factFeedback, finalEditReasoning) {
  const model = getGenAIModel(apiKey, modelName, true);

  const prompt = `
    You are the Orchestration Debate Recorder.
    Generate a dynamic, transparent chat log (WhatsApp/Slack-style conversation) between the academic expert subagents about how they corrected a specific paragraph.
    
    Characters:
    1. "The Grammarian" (focused on typos, spelling, gendering)
    2. "The Academic Stylist" (focused on vocabulary, flow, tone)
    3. "Reviewer 2" (skeptical, points out logical weaknesses)
    4. "The Reference Auditor" (audits citations and facts against sources)
    5. "The Orchestrator" (the final editor who consolidates and explains the merged output)

    Make the dialogue professional, logical, and show their direct arguments/debates about this paragraph:
    Original: "${originalText.replace(/"/g, '\\"')}"

    Edits made:
    - Grammarian: "${grammarianEdits.replace(/"/g, '\\"')}"
    - Stylist: "${stylistEdits.replace(/"/g, '\\"')}"
    - Reviewer 2 critique: "${criticFeedback.replace(/"/g, '\\"')}"
    - Reference Auditor factcheck: "${factFeedback.replace(/"/g, '\\"')}"
    
    The Orchestrator decided to merge the edits because: "${finalEditReasoning.replace(/"/g, '\\"')}"

    Format your output strictly as a JSON list of chat messages:
    [
      {
        "sender": "The Grammarian | The Academic Stylist | Reviewer 2 | The Reference Auditor | The Orchestrator",
        "message": "The chat message content detailing their analysis of the text segment.",
        "timestamp": "e.g., 20:05"
      }
    ]
  `;

  const result = await model.generateContent(prompt);
  return JSON.parse(result.response.text());
}

/**
 * Checks a specific claim against a set of uploaded reference PDFs.
 */
async function auditReferenceClaims(paragraph, citationKey, pdfFilesList) {
  if (!pdfFilesList || pdfFilesList.length === 0) {
    return {
      status: "yellow",
      message: "No reference library PDFs uploaded. Citation could not be fact-checked.",
      matchSnippet: ""
    };
  }

  // Find matching PDF file by citation key in filename (e.g. "Müller" in "Müller_2022.pdf")
  const normKey = citationKey.toLowerCase().replace(/[^a-z0-9]/g, '');
  const matchedFile = pdfFilesList.find(file => {
    const filename = file.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return filename.includes(normKey);
  });

  if (!matchedFile) {
    return {
      status: "yellow",
      message: `No matching reference PDF file found for citation key "${citationKey}" in library.`,
      matchSnippet: ""
    };
  }

  try {
    const parsedPdf = await pdfParser.parsePDF(matchedFile.path);
    const searchResult = pdfParser.searchInText(parsedPdf.text, paragraph);

    if (searchResult && searchResult.match) {
      if (searchResult.score > 0.8) {
        return {
          status: "green",
          message: `Fact verified. Found highly matching claim in source document "${matchedFile.name}".`,
          matchSnippet: searchResult.snippet
        };
      } else {
        return {
          status: "yellow",
          message: `Caution: Citation found in "${matchedFile.name}", but the phrasing/numbers differ slightly. Check for potential misinterpretation.`,
          matchSnippet: searchResult.snippet
        };
      }
    } else {
      return {
        status: "red",
        message: `Warning: Citation found, but could NOT locate any text in "${matchedFile.name}" supporting this specific claim. Possibility of miscitation.`,
        matchSnippet: ""
      };
    }
  } catch (error) {
    return {
      status: "yellow",
      message: `Error parsing reference PDF "${matchedFile.name}": ${error.message}`,
      matchSnippet: ""
    };
  }
}

/**
 * Isolated Plagiarism Audit against reference library.
 */
async function auditPlagiarism(paragraphText, pdfFilesList) {
  if (!pdfFilesList || pdfFilesList.length === 0) {
    return {
      score: 0,
      status: "green",
      message: "No reference library PDFs uploaded. No plagiarism checks can be made against sources.",
      snippets: []
    };
  }

  const results = [];
  for (const file of pdfFilesList) {
    try {
      const parsedPdf = await pdfParser.parsePDF(file.path);
      const searchResult = pdfParser.searchInText(parsedPdf.text, paragraphText, 250);
      if (searchResult && searchResult.match) {
        results.push({
          sourceName: file.name,
          score: searchResult.score,
          snippet: searchResult.snippet
        });
      }
    } catch (e) {
      console.error(`Plagiarism check failed on file ${file.name}:`, e);
    }
  }

  // Sort by highest similarity
  results.sort((a, b) => b.score - a.score);

  if (results.length > 0) {
    const highest = results[0];
    const status = highest.score > 0.8 ? "red" : "yellow";
    const msg = highest.score > 0.8 
      ? `High plagiarism risk! Matches text in source "${highest.sourceName}" closely (${Math.round(highest.score * 100)}% match).`
      : `Moderate similarity found in source "${highest.sourceName}" (${Math.round(highest.score * 100)}% match). Verify paraphrasing.`;

    return {
      score: highest.score,
      status,
      message: msg,
      snippets: results
    };
  }

  return {
    score: 0,
    status: "green",
    message: "No plagiarism patterns found. Writing style matches references within acceptable academic parameters.",
    snippets: []
  };
}

module.exports = {
  AGENT_PROFILES,
  extractGlobalStyleGuide,
  runAgentPass,
  runConsolidationPass,
  generateAgentDebate,
  auditReferenceClaims,
  auditPlagiarism
};
