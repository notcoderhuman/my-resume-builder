'use strict';

const MATCH_VERSION = 1;
const MATCH_SCHEMA_VERSION = 1;
const STATUS = Object.freeze({ SUPPORTED: 'supported', PARTIAL: 'partial', NOT_DEMONSTRATED: 'not-demonstrated' });

const ALIASES = new Map([
  ['javascript', ['javascript', 'js']], ['java', ['java']], ['python', ['python']],
  ['node.js', ['node.js', 'nodejs', 'node']], ['kubernetes', ['kubernetes', 'k8s']],
  ['github', ['github']], ['react', ['react', 'react.js']], ['sql', ['sql']],
  ['sqlite', ['sqlite']], ['c++', ['c++']], ['c', ['c']], ['aws', ['aws', 'amazon web services']],
  ['docker', ['docker']], ['git', ['git']], ['linux', ['linux']], ['typescript', ['typescript']],
  ['graphql', ['graphql']], ['rest apis', ['rest apis', 'restful apis']], ['siem', ['siem']]
]);

function text(value) { return value === null || value === undefined ? '' : String(value).trim(); }
function normalizeTerm(value) {
  const raw = text(value).toLowerCase().replace(/\s+/g, ' ').trim();
  for (const [canonical, aliases] of ALIASES) if (aliases.includes(raw)) return canonical;
  return raw.replace(/[.]/g, '');
}
function escapeRegex(value) { return text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function hasTerm(source, term) {
  const canonical = normalizeTerm(term);
  const aliases = ALIASES.get(canonical) || [canonical];
  return aliases.some((alias) => new RegExp(`(^|[^a-z0-9+#])${escapeRegex(alias)}(?=$|[^a-z0-9+#])`, 'i').test(source));
}
function termsFromText(source) {
  const value = text(source);
  const found = [];
  for (const [canonical, aliases] of ALIASES) if (aliases.some((alias) => hasTerm(value, alias))) found.push(canonical);
  return [...new Set(found)];
}
function addEvidence(index, sourcePath, sourceText) {
  const value = text(sourceText); if (!value) return;
  index.push({ sourcePath, sourceText: value, normalizedTerms: termsFromText(value) });
}
function buildEvidenceIndex(resume) {
  const source = resume && typeof resume === 'object' && !Array.isArray(resume) ? resume : {};
  const index = [];
  const personal = source.personal && typeof source.personal === 'object' ? source.personal : {};
  ['headline', 'role'].forEach((field) => addEvidence(index, `resume.personal.${field}`, personal[field]));
  addEvidence(index, 'resume.summary', source.summary);
  (Array.isArray(source.skills) ? source.skills : []).forEach((value, i) => addEvidence(index, `resume.skills[${i}]`, value));
  (Array.isArray(source.experience) ? source.experience : []).forEach((entry, i) => {
    if (!entry || typeof entry !== 'object') return;
    addEvidence(index, `resume.experience[${i}].role`, entry.role);
    addEvidence(index, `resume.experience[${i}].company`, entry.company);
    (Array.isArray(entry.bullets) ? entry.bullets : []).forEach((value, j) => addEvidence(index, `resume.experience[${i}].bullets[${j}]`, value));
  });
  (Array.isArray(source.projects) ? source.projects : []).forEach((entry, i) => {
    if (!entry || typeof entry !== 'object') return;
    ['name', 'title', 'description'].forEach((field) => addEvidence(index, `resume.projects[${i}].${field}`, entry[field]));
    (Array.isArray(entry.technologies) ? entry.technologies : []).forEach((value, j) => addEvidence(index, `resume.projects[${i}].technologies[${j}]`, value));
    (Array.isArray(entry.bullets) ? entry.bullets : []).forEach((value, j) => addEvidence(index, `resume.projects[${i}].bullets[${j}]`, value));
  });
  (Array.isArray(source.certifications) ? source.certifications : []).forEach((entry, i) => { if (entry && typeof entry === 'object') { addEvidence(index, `resume.certifications[${i}].name`, entry.name); addEvidence(index, `resume.certifications[${i}].issuer`, entry.issuer); } });
  (Array.isArray(source.education) ? source.education : []).forEach((entry, i) => { if (entry && typeof entry === 'object') { addEvidence(index, `resume.education[${i}].degree`, entry.degree); (Array.isArray(entry.details) ? entry.details : [entry.details]).forEach((value, j) => addEvidence(index, `resume.education[${i}].details[${j}]`, value)); } });
  return index;
}
function requirementTerms(requirement) {
  const source = `${text(requirement.name)} ${text(requirement.sourceText)}`;
  const canonical = normalizeTerm(requirement.name);
  const terms = [canonical];
  termsFromText(source).forEach((term) => { if (!terms.includes(term)) terms.push(term); });
  return terms.filter(Boolean);
}
function matchOne(requirement, evidenceIndex) {
  const terms = requirementTerms(requirement);
  const direct = evidenceIndex.filter((item) => terms.some((term) => item.normalizedTerms.includes(term) || hasTerm(item.sourceText, term)));
  if (direct.length) return { status: STATUS.SUPPORTED, matchType: 'direct', evidence: direct, confidence: 1, explanation: { type: 'direct-normalized-term', text: `Direct normalized term match: ${terms[0]}` } };
  const sourceTerms = termsFromText(text(requirement.sourceText));
  const contextualWords = text(requirement.sourceText).toLowerCase().match(/[a-z][a-z-]{4,}/g) || [];
  const contextual = evidenceIndex.filter((item) => {
    return sourceTerms.some((term) => term !== normalizeTerm(requirement.name) && (item.normalizedTerms.includes(term) || hasTerm(item.sourceText, term))) || contextualWords.some((word) => !['experience', 'required', 'preferred', 'knowledge', 'years', 'with', 'using'].includes(word) && hasTerm(item.sourceText, word));
  });
  if (contextual.length) return { status: STATUS.PARTIAL, matchType: 'partial', evidence: contextual, confidence: 0.5, explanation: { type: 'partial-explicit-term', text: `Partial explicit term match: ${sourceTerms.find((term) => term !== normalizeTerm(requirement.name)) || contextualWords[0] || terms[0]}` } };
  return { status: STATUS.NOT_DEMONSTRATED, matchType: 'none', evidence: [], confidence: 0, explanation: { type: 'no-evidence', text: 'No supporting resume evidence was found.' } };
}
function emptyBreakdown() { return { total: 0, supported: 0, partial: 0, notDemonstrated: 0 }; }
function scoreGroup(matches, importance) {
  const group = emptyBreakdown(); group.total = matches.filter((m) => m.importance === importance).length;
  matches.filter((m) => m.importance === importance).forEach((match) => { if (match.status === STATUS.SUPPORTED) group.supported += 1; else if (match.status === STATUS.PARTIAL) group.partial += 1; else group.notDemonstrated += 1; });
  return group;
}
function matchResumeToJob(resume, jobDescription) {
  const sourceResume = resume && typeof resume === 'object' && !Array.isArray(resume) ? resume : {};
  const sourceJob = jobDescription && typeof jobDescription === 'object' && !Array.isArray(jobDescription) ? jobDescription : {};
  const requirements = Array.isArray(sourceJob.requirements) ? sourceJob.requirements : [];
  const evidenceIndex = buildEvidenceIndex(sourceResume);
  const matches = requirements.filter((req) => req && typeof req === 'object' && text(req.id)).map((req) => { const result = matchOne(req, evidenceIndex); return { id: `match_${req.id}`, requirementId: req.id, requirement: text(req.name), category: text(req.category), importance: req.importance === 'preferred' ? 'preferred' : 'required', status: result.status, matchType: result.matchType, jdEvidence: { sourcePath: text(req.sourcePath) || `jobDescription.requirements[${requirements.indexOf(req)}]`, sourceText: text(req.sourceText) }, evidence: result.evidence.map(({ sourcePath, sourceText, normalizedTerms }) => ({ sourcePath, sourceText, normalizedTerms })), explanation: result.explanation, confidence: result.confidence }; });
  const required = scoreGroup(matches, 'required'); const preferred = scoreGroup(matches, 'preferred');
  const weightedTotal = required.total + preferred.total; const weightedEarned = required.supported + required.partial * 0.5 + preferred.supported + preferred.partial * 0.5;
  const score = weightedTotal ? weightedEarned / weightedTotal : 0;
  return { version: MATCH_VERSION, schemaVersion: MATCH_SCHEMA_VERSION, resumeVersion: Number(sourceResume.version || sourceResume.schemaVersion || 1), jobDescriptionVersion: Number(sourceJob.version || sourceJob.schemaVersion || 1), summary: { score, scorePercent: Math.round(score * 100), required, preferred }, matches, quality: { level: 'baseline', notes: 'Deterministic lexical matching; not semantic or AI matching.' } };
}
function validateMatchInput(resume, jobDescription) {
  const errors = [];
  if (!resume || typeof resume !== 'object' || Array.isArray(resume)) errors.push('resume must be an object.');
  if (!jobDescription || typeof jobDescription !== 'object' || Array.isArray(jobDescription)) errors.push('jobDescription must be an object.');
  if (resume && (resume.version !== 1 && resume.schemaVersion !== 1)) errors.push('resume version is unsupported.');
  if (jobDescription && (jobDescription.version !== 1 && jobDescription.schemaVersion !== 1)) errors.push('jobDescription version is unsupported.');
  if (jobDescription && !Array.isArray(jobDescription.requirements)) errors.push('jobDescription.requirements must be an array.');
  if (jobDescription && Array.isArray(jobDescription.requirements) && jobDescription.requirements.some((req) => !req || typeof req !== 'object' || !text(req.id) || !text(req.name))) errors.push('Every job requirement must include id and name.');
  return { valid: errors.length === 0, errors };
}
function filterMatches(matches, filters = {}) { return (Array.isArray(matches) ? matches : []).filter((match) => (!filters.status || match.status === filters.status) && (!filters.importance || match.importance === filters.importance)); }
function reverseEvidenceLookup(matches) { const reverse = new Map(); (Array.isArray(matches) ? matches : []).forEach((match) => (match.evidence || []).forEach((evidence) => { if (!reverse.has(evidence.sourcePath)) reverse.set(evidence.sourcePath, { ...evidence, supports: [] }); reverse.get(evidence.sourcePath).supports.push({ requirementId: match.requirementId, requirement: match.requirement, status: match.status }); })); return [...reverse.values()]; }
module.exports = { MATCH_VERSION, STATUS, normalizeTerm, buildEvidenceIndex, matchResumeToJob, validateMatchInput, hasTerm, filterMatches, reverseEvidenceLookup };
