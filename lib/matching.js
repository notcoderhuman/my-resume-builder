'use strict';

// This module deliberately uses only explicit text matches. It does not infer
// that related technologies (for example SQL and PostgreSQL) are equivalent.
const aliases = {
  js: 'javascript',
  node: 'node.js',
  'rest api': 'rest apis',
  api: 'apis'
};

// "Cloud" can be relevant to a named cloud provider, but it is not proof that
// the provider was used. This creates an unverified result, never a direct one.
const ambiguousRelatedTerms = {
  aws: ['cloud'],
  azure: ['cloud'],
  gcp: ['cloud']
};

function normalizeText(value) {
  const text = String(value || '').toLowerCase().trim().replace(/\s+/g, ' ');
  return aliases[text] || text;
}

function containsTerm(text, requirement) {
  if (!text || !requirement) return false;
  const escaped = requirement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`).test(text);
}

function evidenceId(evidence) {
  return typeof evidence.id === 'string' && evidence.id ? evidence.id : null;
}

function requirementText(requirement) {
  return normalizeText(requirement && (requirement.skill || requirement.text || requirement.title || requirement.name));
}

function matchEvidence(requirement, evidence) {
  const normalizedRequirement = requirementText(requirement);
  const skills = Array.isArray(evidence.skills) ? evidence.skills.map(normalizeText) : [];
  const title = normalizeText(evidence.title);
  const description = normalizeText(evidence.description);
  const exactSkill = skills.some((skill) => skill === normalizedRequirement);
  const descriptionMatch = containsTerm(description, normalizedRequirement);
  const titleMatch = containsTerm(title, normalizedRequirement);
  const score = Math.min(1, (exactSkill ? 0.60 : 0) + (descriptionMatch ? 0.20 : 0) + (titleMatch ? 0.10 : 0));
  const relatedTerms = ambiguousRelatedTerms[normalizedRequirement] || [];
  const ambiguousTerm = relatedTerms.find((term) => skills.includes(term) || containsTerm(title, term) || containsTerm(description, term));

  return { evidence, id: evidenceId(evidence), exactSkill, descriptionMatch, titleMatch, ambiguousTerm, score };
}

function getReasons(requirement, matches) {
  const label = String(requirement && (requirement.skill || requirement.text || requirement.title || requirement.name) || '').trim();
  const reasons = [];
  matches.forEach((match) => {
    const title = String(match.evidence.title || 'this evidence').trim();
    if (match.exactSkill) reasons.push(`${label} is explicitly listed as a demonstrated skill in "${title}".`);
    if (match.descriptionMatch) reasons.push(`${label} is mentioned in the description of "${title}".`);
    if (match.titleMatch) reasons.push(`${label} is mentioned in the title "${title}".`);
    if (match.ambiguousTerm && !match.score) {
      reasons.push(`${match.ambiguousTerm} is mentioned in "${title}", but it does not explicitly establish ${label}.`);
    }
  });
  return [...new Set(reasons)];
}

function matchRequirement(requirement, evidence) {
  const requirementId = requirement && requirement.id;
  const items = Array.isArray(evidence) ? evidence.filter((item) => item && typeof item === 'object') : [];
  const candidates = items.map((item) => matchEvidence(requirement, item));
  const directMatches = candidates.filter((match) => match.id && match.score > 0);
  const ambiguousMatches = candidates.filter((match) => match.id && match.score === 0 && match.ambiguousTerm);

  if (!directMatches.length && !ambiguousMatches.length) {
    return { requirementId, status: 'unsupported', score: 0, evidenceIds: [], reasons: [] };
  }

  if (!directMatches.length) {
    return {
      requirementId,
      status: 'unverified',
      score: 0,
      evidenceIds: ambiguousMatches.map((match) => match.id),
      reasons: getReasons(requirement, ambiguousMatches)
    };
  }

  // Select the strongest direct evidence rather than summing similar evidence
  // items. This keeps the score bounded and makes the explanation focused.
  const strongestScore = Math.max(...directMatches.map((match) => match.score));
  const strongestMatches = directMatches.filter((match) => match.score === strongestScore);
  const hasDirectSkill = strongestMatches.some((match) => match.exactSkill);
  // An explicitly listed skill is direct evidence even when it is the only
  // available signal; context/title-only matches use the stated score bands.
  const status = strongestScore >= 0.75 || hasDirectSkill
    ? 'supported'
    : strongestScore >= 0.40 ? 'partial' : 'unsupported';

  return {
    requirementId,
    status,
    score: Math.min(1, strongestScore),
    evidenceIds: strongestMatches.map((match) => match.id),
    reasons: getReasons(requirement, strongestMatches)
  };
}

module.exports = { matchRequirement, normalizeText, getReasons };
