const fs = require('fs');
const pdf = require('pdf-parse');

/**
 * Extracts raw text from a PDF file.
 * @param {string} filePath - Absolute path to the PDF file.
 * @returns {Promise<{text: string, numPages: number, info: any}>}
 */
async function parsePDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    return {
      text: data.text,
      numPages: data.numpages,
      info: data.info
    };
  } catch (error) {
    console.error(`[PDF Parser] Error parsing PDF at ${filePath}:`, error);
    throw error;
  }
}

/**
 * Performs semantic or exact phrase matching on parsed text to verify citation claims or check plagiarism.
 * @param {string} text - The raw text of the reference PDF.
 * @param {string} claim - The sentence or paragraph to match.
 * @param {number} windowSize - The length of the snippet to return.
 * @returns {{match: boolean, snippet: string, score: number} | null}
 */
function searchInText(text, claim, windowSize = 400) {
  if (!claim || claim.trim().length < 10) return null;

  const normalizedText = text.toLowerCase().replace(/\s+/g, ' ');
  const normalizedClaim = claim.toLowerCase().replace(/[.,;:!?()]/g, '').replace(/\s+/g, ' ').trim();

  // 1. Direct Substring Check
  const directIndex = normalizedText.indexOf(normalizedClaim);
  if (directIndex !== -1) {
    const startIdx = Math.max(0, directIndex - windowSize / 2);
    const endIdx = Math.min(text.length, directIndex + normalizedClaim.length + windowSize / 2);
    return {
      match: true,
      snippet: text.substring(startIdx, endIdx).trim(),
      score: 1.0
    };
  }

  // 2. Multi-word Partial Matching (Fuzzy search for paraphrases)
  const words = normalizedClaim.split(' ');
  if (words.length >= 6) {
    // Extract overlapping sub-phrases of length 6
    const phraseLen = 6;
    for (let i = 0; i <= words.length - phraseLen; i++) {
      const subphrase = words.slice(i, i + phraseLen).join(' ');
      const subIdx = normalizedText.indexOf(subphrase);
      if (subIdx !== -1) {
        const startIdx = Math.max(0, subIdx - windowSize / 2);
        const endIdx = Math.min(text.length, subIdx + subphrase.length + windowSize / 2);
        
        // Calculate similarity score roughly based on match size
        return {
          match: true,
          snippet: text.substring(startIdx, endIdx).trim(),
          score: parseFloat((phraseLen / words.length).toFixed(2))
        };
      }
    }
  }

  return null;
}

module.exports = {
  parsePDF,
  searchInText
};
