'use strict';

function text(value) { return value === null || value === undefined ? '' : String(value); }
function own(object, key) { return object !== null && typeof object === 'object' && Object.prototype.hasOwnProperty.call(object, key); }

function parseIndex(value) {
  const match = /^(\d+)(?:\]|$)/.exec(value);
  return match ? Number(match[1]) : null;
}
function resolveResumePath(resume, path) {
  const source = resume && typeof resume === 'object' ? resume : null;
  if (!source || typeof path !== 'string' || !path.startsWith('resume.')) return null;
  const rest = path.slice('resume.'.length);
  let match;
  if ((match = /^personal\.([a-z]+)$/.exec(rest))) return own(source.personal, match[1]) ? source.personal[match[1]] : null;
  if (rest === 'summary') return own(source, 'summary') ? source.summary : null;
  if ((match = /^skills\[(\d+)\]$/.exec(rest))) return Array.isArray(source.skills) && source.skills[Number(match[1])] !== undefined ? source.skills[Number(match[1])] : null;
  if ((match = /^(experience|projects|certifications|education)\[(\d+)\]\.(.+)$/.exec(rest))) {
    const collection = source[match[1]]; const entry = Array.isArray(collection) ? collection[Number(match[2])] : null;
    if (!entry || typeof entry !== 'object') return null;
    const field = match[3];
    const itemMatch = /^(bullets|technologies|details)\[(\d+)\]$/.exec(field);
    if (itemMatch) return Array.isArray(entry[itemMatch[1]]) && entry[itemMatch[1]][Number(itemMatch[2])] !== undefined ? entry[itemMatch[1]][Number(itemMatch[2])] : null;
    return own(entry, field) ? entry[field] : null;
  }
  return null;
}
function resolveJDPath(jobDescription, path) {
  const source = jobDescription && typeof jobDescription === 'object' ? jobDescription : null;
  const match = typeof path === 'string' && /^jobDescription\.requirements\[(\d+)\]$/.exec(path);
  if (!source || !match || !Array.isArray(source.requirements)) return null;
  return source.requirements[Number(match[1])] || null;
}
function validRequirementIds(jobDescription) { return new Set(Array.isArray(jobDescription && jobDescription.requirements) ? jobDescription.requirements.map((item) => text(item && item.id)).filter(Boolean) : []); }
function verifyMatchTraceability(resume, jobDescription, matchResult) {
  const errors = []; const ids = validRequirementIds(jobDescription); const matches = Array.isArray(matchResult && matchResult.matches) ? matchResult.matches : [];
  if (!matchResult || typeof matchResult !== 'object' || !Array.isArray(matchResult.matches)) return { valid: false, errors: ['matchResult.matches must be an array.'] };
  matches.forEach((match) => {
    if (!ids.has(text(match.requirementId))) errors.push(`Unknown requirementId: ${text(match.requirementId)}`);
    const jd = resolveJDPath(jobDescription, match.jdEvidence && match.jdEvidence.sourcePath);
    if (!jd || text(jd.sourceText) !== text(match.jdEvidence && match.jdEvidence.sourceText)) errors.push(`Invalid JD evidence for ${text(match.requirementId)}.`);
    (Array.isArray(match.evidence) ? match.evidence : []).forEach((item) => { const actual = resolveResumePath(resume, item.sourcePath); if (actual === null || text(actual) !== text(item.sourceText)) errors.push(`Invalid resume evidence path or text: ${text(item.sourcePath)}.`); });
  });
  return { valid: errors.length === 0, errors };
}
module.exports = { resolveResumePath, resolveJDPath, verifyMatchTraceability, validRequirementIds };
