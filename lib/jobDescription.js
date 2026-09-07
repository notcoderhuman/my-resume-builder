'use strict';

const JD_VERSION = 1;
const JD_SCHEMA_VERSION = 1;

const KNOWN_TERMS = [
  ['javascript', ['javascript', 'js'], 'tool/technology'],
  ['typescript', ['typescript'], 'tool/technology'],
  ['python', ['python'], 'tool/technology'],
  ['java', ['java'], 'tool/technology'],
  ['c++', ['c++'], 'tool/technology'],
  ['c#', ['c#', 'c sharp'], 'tool/technology'],
  ['rust', ['rust'], 'tool/technology'],
  ['go', ['golang'], 'tool/technology'],
  ['sql', ['sql'], 'tool/technology'],
  ['rest apis', ['rest apis', 'restful apis'], 'tool/technology'],
  ['graphql', ['graphql'], 'tool/technology'],
  ['node.js', ['node.js', 'nodejs', 'node'], 'tool/technology'],
  ['react', ['react', 'react.js'], 'tool/technology'],
  ['next.js', ['next.js', 'nextjs'], 'tool/technology'],
  ['docker', ['docker'], 'tool/technology'],
  ['kubernetes', ['kubernetes', 'k8s'], 'tool/technology'],
  ['git', ['git'], 'tool/technology'],
  ['github', ['github'], 'tool/technology'],
  ['aws', ['aws', 'amazon web services'], 'tool/technology'],
  ['azure', ['azure'], 'tool/technology'],
  ['gcp', ['gcp', 'google cloud'], 'tool/technology'],
  ['linux', ['linux'], 'tool/technology'],
  ['siem', ['siem'], 'tool/technology']
];

function text(value) { return value === null || value === undefined ? '' : String(value).trim(); }
function normalizeTerm(value) {
  return text(value).toLowerCase().replace(/[.]/g, '').replace(/\s+/g, ' ').trim();
}
function normalizeTerms(values) { return [...new Set((Array.isArray(values) ? values : []).map(normalizeTerm).filter(Boolean))]; }
function deterministicId(prefix, index, source) {
  let hash = 2166136261;
  const input = `${prefix}:${index}:${source}`;
  for (let i = 0; i < input.length; i += 1) { hash ^= input.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return `${prefix}_${(hash >>> 0).toString(36)}_${index}`;
}
function createDefaultJobDescription() {
  return { version: JD_VERSION, schemaVersion: JD_SCHEMA_VERSION, metadata: { title: '', company: '', location: '', employmentType: '' }, sourceText: '', requirements: [], responsibilities: [], qualifications: [], keywords: [], skills: { required: [], preferred: [] }, experienceRequirements: [], educationRequirements: [], quality: { level: 'empty', confidence: 0, notes: 'No job description has been analyzed.' } };
}
function isStructuredJobDescription(value) { return Boolean(value && typeof value === 'object' && !Array.isArray(value) && (value.version === JD_VERSION || value.schemaVersion === JD_SCHEMA_VERSION)); }
function contains(textValue, term) { return new RegExp(`(^|[^a-z0-9+#])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9+#])`, 'i').test(textValue); }
function findTerms(line) {
  return KNOWN_TERMS.filter(([, aliases]) => aliases.some((alias) => contains(line, alias))).map(([canonical]) => canonical);
}
function headingKind(line) {
  const value = text(line).replace(/[:：]\s*$/, '').toLowerCase();
  if (/^(responsibilities|what you('ll| will) do|duties|key responsibilities)$/.test(value)) return 'responsibilities';
  if (/^(qualifications?|what you bring|your background)$/.test(value)) return 'qualifications';
  if (/^(requirements?|required|must have|skills?|technologies|technical skills?)$/.test(value)) return 'requirements';
  if (/^(preferred|nice to have|bonus|desirable|preferred qualifications?)$/.test(value)) return 'preferred';
  if (/^(experience|professional experience)$/.test(value)) return 'experience';
  if (/^(education|educational requirements?)$/.test(value)) return 'education';
  return '';
}
function importanceFor(line, section) {
  const value = normalizeTerm(line);
  if (section === 'preferred' || /\b(preferred|nice to have|bonus|plus|desirable|would be nice)\b/.test(value)) return 'preferred';
  if (/\b(required|must have|mandatory|essential|minimum|required)\b/.test(value)) return 'required';
  return section === 'requirements' || section === 'qualifications' || section === 'experience' || section === 'education' ? 'required' : 'required';
}
function categoryFor(line, terms, section) {
  if (terms.length) return 'tool/technology';
  if (section === 'responsibilities') return 'responsibility';
  if (section === 'experience' || /\b(years? of|experience with|experience in)\b/i.test(line)) return 'experience requirement';
  if (section === 'education' || /\b(bachelor|master|degree|university|college|phd|education)\b/i.test(line)) return 'education requirement';
  if (section === 'qualifications') return 'qualification';
  return 'keyword';
}
function cleanBullet(line) { return text(line).replace(/^(?:[-*•▪]|\d+[.)])\s+/, '').trim(); }
function sourceLines(sourceText) { return text(sourceText).replace(/\r/g, '').split('\n'); }
function normalizeJobDescription(value) {
  const source = value && typeof value === 'object' ? value : {};
  const normalized = createDefaultJobDescription();
  normalized.sourceText = text(source.sourceText);
  if (source.metadata && typeof source.metadata === 'object') Object.keys(normalized.metadata).forEach((key) => { normalized.metadata[key] = text(source.metadata[key]); });
  normalized.requirements = Array.isArray(source.requirements) ? source.requirements.filter((item) => item && typeof item === 'object').map((item, index) => ({ id: text(item.id) || deterministicId('req', index, item.sourceText || item.name), category: text(item.category) || 'keyword', name: text(item.name), importance: item.importance === 'preferred' ? 'preferred' : 'required', sourceText: text(item.sourceText), sourcePath: text(item.sourcePath) || `jobDescription.requirements[${index}]`, normalizedTerms: normalizeTerms(item.normalizedTerms), confidence: typeof item.confidence === 'number' ? Math.max(0, Math.min(1, item.confidence)) : 0.5 })) : [];
  normalized.responsibilities = Array.isArray(source.responsibilities) ? source.responsibilities.filter(Boolean).map((item, index) => typeof item === 'string' ? ({ id: deterministicId('resp', index, item), text: text(item), sourceText: text(item), sourcePath: `jobDescription.responsibilities[${index}]` }) : ({ id: text(item.id) || deterministicId('resp', index, item.sourceText), text: text(item.text), sourceText: text(item.sourceText || item.text), sourcePath: text(item.sourcePath) || `jobDescription.responsibilities[${index}]` })) : [];
  normalized.qualifications = Array.isArray(source.qualifications) ? source.qualifications.filter(Boolean).map((item, index) => typeof item === 'string' ? ({ id: deterministicId('qual', index, item), text: text(item), sourceText: text(item), sourcePath: `jobDescription.qualifications[${index}]` }) : ({ id: text(item.id) || deterministicId('qual', index, item.sourceText), text: text(item.text), sourceText: text(item.sourceText || item.text), sourcePath: text(item.sourcePath) || `jobDescription.qualifications[${index}]` })) : [];
  normalized.keywords = normalizeTerms(source.keywords);
  normalized.skills = { required: normalizeTerms(source.skills && source.skills.required), preferred: normalizeTerms(source.skills && source.skills.preferred) };
  normalized.experienceRequirements = normalizeTerms(source.experienceRequirements);
  normalized.educationRequirements = normalizeTerms(source.educationRequirements);
  normalized.quality = source.quality && typeof source.quality === 'object' ? { level: text(source.quality.level) || 'baseline', confidence: Math.max(0, Math.min(1, Number(source.quality.confidence) || 0)), notes: text(source.quality.notes) } : normalized.quality;
  return normalized;
}
function validateJobDescription(value) {
  const errors = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) errors.schema = 'Job description must be an object.';
  else {
    if (!isStructuredJobDescription(value)) errors.version = `Unsupported job description version. Expected ${JD_VERSION}.`;
    if (typeof value.sourceText !== 'string') errors.sourceText = 'sourceText must be a string.';
    ['requirements', 'responsibilities', 'qualifications', 'keywords', 'experienceRequirements', 'educationRequirements'].forEach((field) => { if (value[field] !== undefined && !Array.isArray(value[field])) errors[field] = `${field} must be an array.`; });
    if (value.skills !== undefined && (!value.skills || typeof value.skills !== 'object' || Array.isArray(value.skills))) errors.skills = 'skills must be an object.';
  }
  return { valid: Object.keys(errors).length === 0, errors, jobDescription: normalizeJobDescription(value) };
}
function parseJobDescription(sourceText) {
  const source = text(sourceText);
  if (!source) return createDefaultJobDescription();
  const lines = sourceLines(source);
  let section = 'general';
  const requirements = []; const responsibilities = []; const qualifications = []; const experienceRequirements = []; const educationRequirements = []; const keywords = [];
  const seen = new Map(); const seenResponsibilities = new Set(); const seenQualifications = new Set();
  lines.forEach((rawLine, lineIndex) => {
    const raw = text(rawLine); if (!raw) return;
    const heading = headingKind(raw); if (heading) { section = heading; return; }
    const item = cleanBullet(raw); const isListItem = item !== raw;
    const terms = findTerms(item); const importance = importanceFor(item, section);
    if (section === 'responsibilities' && (isListItem || item.length > 20)) { const key = normalizeTerm(item); if (!seenResponsibilities.has(key)) { seenResponsibilities.add(key); responsibilities.push({ id: deterministicId('resp', lineIndex, item), text: item, sourceText: item, sourcePath: `jobDescription.responsibilities[${responsibilities.length}]` }); } return; }
    if (section === 'qualifications' && (isListItem || item.length > 15)) { const key = normalizeTerm(item); if (!seenQualifications.has(key)) { seenQualifications.add(key); qualifications.push({ id: deterministicId('qual', lineIndex, item), text: item, sourceText: item, sourcePath: `jobDescription.qualifications[${qualifications.length}]` }); } }
    if (!isListItem && !terms.length && !/\b(required|preferred|experience|degree|must|mandatory|plus|nice to have)\b/i.test(item)) return;
    if (terms.length) terms.forEach((term) => { const key = `${term}|${importance}`; if (seen.has(key)) { const existing = seen.get(key); if (!existing.sourceText.includes(item)) existing.sourceReferences.push(item); return; } const record = { id: deterministicId('req', requirements.length, item + term), category: categoryFor(item, [term], section), name: term, importance, sourceText: item, sourcePath: `jobDescription.requirements[${requirements.length}]`, normalizedTerms: [normalizeTerm(term)], confidence: 1, sourceReferences: [] }; seen.set(key, record); requirements.push(record); keywords.push(term); });
    if (/\b(years? of|experience with|experience in|minimum .* experience)\b/i.test(item)) experienceRequirements.push(item);
    if (/\b(bachelor|master|degree|university|college|phd|education)\b/i.test(item)) educationRequirements.push(item);
    if (!terms.length && (isListItem || section === 'requirements' || section === 'qualifications')) { const name = item; const key = `${normalizeTerm(name)}|${importance}`; if (!seen.has(key)) { const record = { id: deterministicId('req', requirements.length, name), category: categoryFor(item, [], section), name, importance, sourceText: item, sourcePath: `jobDescription.requirements[${requirements.length}]`, normalizedTerms: [normalizeTerm(name)], confidence: 0.7, sourceReferences: [] }; seen.set(key, record); requirements.push(record); } }
  });
  const result = normalizeJobDescription({ sourceText: source, requirements, responsibilities, qualifications, keywords, skills: { required: requirements.filter((r) => r.importance === 'required' && r.category === 'tool/technology').map((r) => r.name), preferred: requirements.filter((r) => r.importance === 'preferred' && r.category === 'tool/technology').map((r) => r.name) }, experienceRequirements: [...new Set(experienceRequirements)], educationRequirements: [...new Set(educationRequirements)], quality: { level: requirements.length || responsibilities.length || qualifications.length ? 'baseline' : 'no-results', confidence: requirements.length ? 0.85 : 0.25, notes: 'Deterministic lexical baseline; not semantic or AI analysis.' } });
  result.keywords = normalizeTerms(result.keywords);
  return result;
}
module.exports = { JD_VERSION, JD_SCHEMA_VERSION, createDefaultJobDescription, normalizeJobDescription, validateJobDescription, parseJobDescription, normalizeTerm, deterministicId, isStructuredJobDescription };
