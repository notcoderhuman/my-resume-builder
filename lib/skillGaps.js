'use strict';

const GAP_VERSION = 1;
const GAP_SCHEMA_VERSION = 1;
const VALID_STATUSES = new Set(['supported', 'partial', 'not-demonstrated']);

function text(value) { return value === null || value === undefined ? '' : String(value).trim(); }
function priorityFor(match) {
  if (match.status === 'supported') return 'none';
  return match.importance === 'required' ? 'high' : 'medium';
}
function recommendationFor(match) {
  if (match.status === 'partial') {
    return {
      type: 'add-evidence-only-if-genuine',
      text: `Add ${text(match.requirement)}-specific evidence only if that experience is genuine.`
    };
  }
  return {
    type: 'add-evidence-or-build-skill',
    text: `Add existing ${text(match.requirement)} evidence if you already have it, or build genuine ${text(match.requirement)} experience before claiming it.`
  };
}
function interpretationFor(match) {
  if (match.status === 'partial') return `Related evidence exists, but the current resume does not explicitly demonstrate ${text(match.requirement)}.`;
  return 'No supporting evidence was found in your current resume.';
}
function isValidMatch(match) {
  return match && typeof match === 'object' && text(match.requirementId) && text(match.requirement) && VALID_STATUSES.has(match.status) && (match.importance === 'required' || match.importance === 'preferred');
}
function analyzeSkillGaps(matchResult) {
  const matches = matchResult && Array.isArray(matchResult.matches) ? matchResult.matches : [];
  const gaps = matches.filter((match) => isValidMatch(match) && match.status !== 'supported').map((match) => ({
    id: `gap_${match.requirementId}`,
    requirementId: match.requirementId,
    name: text(match.requirement),
    category: text(match.category),
    importance: match.importance,
    priority: priorityFor(match),
    status: match.status,
    jdEvidence: { sourcePath: text(match.jdEvidence && match.jdEvidence.sourcePath), sourceText: text(match.jdEvidence && match.jdEvidence.sourceText) },
    resumeEvidence: Array.isArray(match.evidence) ? match.evidence.map((item) => ({ sourcePath: text(item.sourcePath), sourceText: text(item.sourceText), normalizedTerms: Array.isArray(item.normalizedTerms) ? item.normalizedTerms.slice() : [] })) : [],
    interpretation: interpretationFor(match),
    recommendation: recommendationFor(match)
  }));
  const summary = { demonstrated: matches.filter((m) => m && m.status === 'supported').length, partial: matches.filter((m) => m && m.status === 'partial').length, notDemonstrated: matches.filter((m) => m && m.status === 'not-demonstrated').length, requiredGaps: gaps.filter((g) => g.importance === 'required').length, preferredGaps: gaps.filter((g) => g.importance === 'preferred').length };
  return { version: GAP_VERSION, schemaVersion: GAP_SCHEMA_VERSION, summary, gaps, quality: { level: 'baseline', notes: 'Deterministic skill-gap analysis based on existing match evidence.' } };
}
function validateSkillGapInput(matchResult) {
  const errors = [];
  if (!matchResult || typeof matchResult !== 'object' || Array.isArray(matchResult)) errors.push('matchResult must be an object.');
  if (matchResult && !Array.isArray(matchResult.matches)) errors.push('matchResult.matches must be an array.');
  if (matchResult && Array.isArray(matchResult.matches) && matchResult.matches.some((match) => !isValidMatch(match))) errors.push('Every match must include a valid requirementId, requirement, importance, and status.');
  return { valid: errors.length === 0, errors };
}
function filterSkillGaps(gaps, filters = {}) { return (Array.isArray(gaps) ? gaps : []).filter((gap) => (!filters.status || gap.status === filters.status) && (!filters.importance || gap.importance === filters.importance) && (!filters.priority || gap.priority === filters.priority)); }
module.exports = { GAP_VERSION, GAP_SCHEMA_VERSION, analyzeSkillGaps, validateSkillGapInput, filterSkillGaps, priorityFor };
