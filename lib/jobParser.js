'use strict';

const skills = [
  ['REST APIs', 'technical_skill'], ['GraphQL', 'technical_skill'],
  ['JavaScript', 'programming_language'], ['TypeScript', 'programming_language'],
  ['Python', 'programming_language'], ['Java', 'programming_language'], ['C++', 'programming_language'],
  ['C#', 'programming_language'], ['Rust', 'programming_language'], ['PHP', 'programming_language'],
  ['SQL', 'programming_language'], ['HTML', 'programming_language'], ['CSS', 'programming_language'],
  ['Go', 'programming_language'], ['C', 'programming_language'],
  ['Next.js', 'framework'], ['Node.js', 'framework'], ['React', 'framework'], ['Vue', 'framework'],
  ['Angular', 'framework'], ['Django', 'framework'], ['Flask', 'framework'], ['Express', 'framework'],
  ['Kubernetes', 'tool'], ['Docker', 'tool'], ['GitHub', 'tool'], ['Git', 'tool'],
  ['AWS', 'tool'], ['Azure', 'tool'], ['GCP', 'tool']
];

function normalizeRequirement(text) {
  return String(text || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function detectPriority(text) {
  const normalized = normalizeRequirement(text);
  if (/\b(preferred|nice to have|bonus|plus|desirable)\b/.test(normalized)) return 'preferred';
  if (/\b(required|must have|must|essential|mandatory|minimum)\b/.test(normalized)) return 'required';
  return 'required';
}

function classifyRequirement(text) {
  const normalized = normalizeRequirement(text);
  const skill = skills.find(([name]) => containsSkill(normalized, name));
  if (skill) return skill[1];
  if (/\b(years?|experience)\b/.test(normalized)) return 'experience';
  if (/\b(degree|university|college)\b/.test(normalized)) return 'education';
  if (/\b(certification|certified)\b/.test(normalized)) return 'certification';
  if (/\b(responsible|lead|manage|collaborate|build)\b/.test(normalized)) return 'responsibility';
  return 'other';
}

function containsSkill(text, skill) {
  const normalizedSkill = normalizeRequirement(skill);
  const escaped = normalizedSkill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i').test(text);
}

function isPreferredHeading(text) {
  return /^(nice to have|preferred|bonus|desirable|plus)\s*:?$/i.test(text.trim());
}

function isRequirementHeading(text) {
  return /^(requirements?|qualifications?|responsibilities?)\s*:?$/i.test(text.trim());
}

function candidateLines(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const candidates = [];
  let sectionPriority = 'required';

  lines.forEach((rawLine) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return;
    if (isPreferredHeading(trimmed)) {
      sectionPriority = 'preferred';
      return;
    }
    if (isRequirementHeading(trimmed)) {
      sectionPriority = 'required';
      return;
    }

    const bullet = trimmed.replace(/^(?:[-*•]|\d+[.)])\s+/, '');
    const isBullet = bullet !== trimmed;
    const sentences = isBullet ? [bullet] : bullet.split(/(?<=[.!?])\s+/);
    sentences.forEach((sentence) => {
      const sourceText = sentence.trim();
      if (!sourceText) return;
      const explicitSkill = skills.some(([name]) => containsSkill(sourceText, name));
      const requirementSignal = /\b(required|must have|must|essential|mandatory|minimum|preferred|nice to have|bonus|plus|desirable)\b/i.test(sourceText);
      if (isBullet || explicitSkill || requirementSignal) {
        candidates.push({ sourceText, priority: sectionPriority === 'preferred' ? 'preferred' : detectPriority(sourceText) });
      }
    });
  });
  return candidates;
}

function parseJobDescription(text) {
  const byKey = new Map();
  candidateLines(text).forEach((candidate) => {
    const normalizedSource = normalizeRequirement(candidate.sourceText);
    const foundSkills = skills
      .filter(([name]) => containsSkill(candidate.sourceText, name))
      .sort(([first], [second]) => normalizedSource.indexOf(normalizeRequirement(first)) - normalizedSource.indexOf(normalizeRequirement(second)));
    const entries = foundSkills.length ? foundSkills : [[null, classifyRequirement(candidate.sourceText)]];

    entries.forEach(([skill, category]) => {
      const key = skill ? normalizeRequirement(skill) : normalizeRequirement(candidate.sourceText);
      const requirement = {
        // Each explicit skill is its own requirement; sourceText retains the
        // complete sentence or bullet that established it.
        text: skill || candidate.sourceText,
        skill,
        category,
        priority: candidate.priority,
        sourceText: candidate.sourceText
      };
      const existing = byKey.get(key);
      if (!existing || (existing.priority === 'preferred' && requirement.priority === 'required') || requirement.sourceText.length > existing.sourceText.length) {
        byKey.set(key, requirement);
      }
    });
  });

  return {
    requirements: [...byKey.values()].map((requirement, index) => ({
      id: `req_${String(index + 1).padStart(3, '0')}`,
      ...requirement
    }))
  };
}

module.exports = { parseJobDescription, normalizeRequirement, classifyRequirement, detectPriority };
