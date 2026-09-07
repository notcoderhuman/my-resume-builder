'use strict';

const crypto = require('crypto');
const express = require('express');
const path = require('path');
const { readStore, writeStore, ensureStorage } = require('./lib/storage');
const { validateEvidenceInput } = require('./lib/validation');
const { parseJobDescription } = require('./lib/jobParser');
const { parseJobDescription: parseStructuredJobDescription, validateJobDescription } = require('./lib/jobDescription');
const { matchRequirement } = require('./lib/matching');
const { matchResumeToJob, validateMatchInput } = require('./lib/matchingEngine');
const { analyzeSkillGaps, validateSkillGapInput } = require('./lib/skillGaps');
const { generateAIInsights, validateAIOutput } = require('./lib/aiIntelligence');
const { verifyMatchTraceability } = require('./lib/integrity');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '100kb' }));
app.disable('x-powered-by');
app.use((request, response, next) => { response.set({ 'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' }); next(); });
// The primary Resume Intelligence shell lives at the repository root; keep the
// older Evidence Vault static bundle available for its existing routes.
app.use(express.static(__dirname, { index: false }));
app.get('/', (request, response) => response.sendFile(path.join(__dirname, 'index.html')));
app.get('/api/ai-status', async (request, response) => {
  const provider = process.env.AI_PROVIDER || '';
  const model = process.env.AI_MODEL || (provider === 'ollama' ? 'qwen2.5:3b' : '');
  if (provider !== 'ollama') return response.json({ provider, model, available: false, reason: 'provider-not-ollama' });
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  try {
    const parsed = new URL(baseUrl); if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname.toLowerCase())) throw new Error('invalid-local-endpoint');
    const tags = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!tags.ok) return response.json({ provider, model, available: false, reason: 'ollama-unavailable' });
    const data = await tags.json(); const models = Array.isArray(data.models) ? data.models.map((item) => item && item.name).filter(Boolean) : [];
    response.json({ provider, model, available: models.includes(model), reachable: true, modelConfigured: models.includes(model) });
  } catch (_) { response.json({ provider, model, available: false, reachable: false, modelConfigured: false, reason: 'ollama-unavailable' }); }
});
app.use(express.static(path.join(__dirname, 'public')));

function sendStorageError(response, error) {
  console.error(error);
  response.status(500).json({ error: 'Unable to access evidence storage.' });
}

app.get('/api/evidence', async (request, response) => {
  try {
    const store = await readStore();
    response.json(store.evidence);
  } catch (error) {
    sendStorageError(response, error);
  }
});

app.get('/api/evidence/:id', async (request, response) => {
  try {
    const store = await readStore();
    const item = store.evidence.find((evidence) => evidence.id === request.params.id);
    if (!item) return response.status(404).json({ error: 'Evidence item not found.' });
    response.json(item);
  } catch (error) {
    sendStorageError(response, error);
  }
});

app.post('/api/evidence', async (request, response) => {
  const validation = validateEvidenceInput(request.body);
  if (!validation.valid) return response.status(400).json({ error: validation.error });

  try {
    const store = await readStore();
    const now = new Date().toISOString();
    const item = {
      id: `ev_${crypto.randomUUID()}`,
      ...validation.value,
      verification: { status: 'unverified', confidence: 0 },
      createdAt: now,
      updatedAt: now
    };
    store.evidence.push(item);
    await writeStore(store);
    response.status(201).json(item);
  } catch (error) {
    sendStorageError(response, error);
  }
});

app.put('/api/evidence/:id', async (request, response) => {
  const validation = validateEvidenceInput(request.body);
  if (!validation.valid) return response.status(400).json({ error: validation.error });

  try {
    const store = await readStore();
    const index = store.evidence.findIndex((evidence) => evidence.id === request.params.id);
    if (index === -1) return response.status(404).json({ error: 'Evidence item not found.' });

    const existing = store.evidence[index];
    const item = {
      id: existing.id,
      ...validation.value,
      verification: existing.verification || { status: 'unverified', confidence: 0 },
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    };
    store.evidence[index] = item;
    await writeStore(store);
    response.json(item);
  } catch (error) {
    sendStorageError(response, error);
  }
});

app.delete('/api/evidence/:id', async (request, response) => {
  try {
    const store = await readStore();
    const index = store.evidence.findIndex((evidence) => evidence.id === request.params.id);
    if (index === -1) return response.status(404).json({ error: 'Evidence item not found.' });
    store.evidence.splice(index, 1);
    await writeStore(store);
    response.status(204).send();
  } catch (error) {
    sendStorageError(response, error);
  }
});

app.post('/api/match-resume-job', (request, response) => {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) return response.status(400).json({ error: 'Request body must contain resume and jobDescription objects.' });
  if (JSON.stringify(request.body).length > 500000) return response.status(413).json({ error: 'Match payload is too large.' });
  const validation = validateMatchInput(request.body.resume, request.body.jobDescription);
  if (!validation.valid) return response.status(400).json({ error: validation.errors.join(' ') });
  try {
    const matchResult = matchResumeToJob(request.body.resume, request.body.jobDescription);
    const trace = verifyMatchTraceability(request.body.resume, request.body.jobDescription, matchResult);
    if (!trace.valid) return response.status(400).json({ error: 'Generated match failed evidence integrity validation.' });
    response.json({ matchResult });
  } catch (error) { console.error('Matching failed:', error.message); response.status(400).json({ error: 'Unable to match the supplied resume and job description.' }); }
});

app.post('/api/skill-gaps', (request, response) => {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) return response.status(400).json({ error: 'Request body must contain a matchResult object.' });
  if (JSON.stringify(request.body).length > 500000) return response.status(413).json({ error: 'Skill-gap payload is too large.' });
  const validation = validateSkillGapInput(request.body.matchResult);
  if (!validation.valid) return response.status(400).json({ error: validation.errors.join(' ') });
  try { response.json({ skillGapResult: analyzeSkillGaps(request.body.matchResult) }); } catch (error) { console.error(error); response.status(400).json({ error: 'Unable to analyze skill gaps.' }); }
});

app.post('/api/ai-insights', async (request, response) => {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) return response.status(400).json({ error: 'Request body must contain structured analysis objects.' });
  if (JSON.stringify(request.body).length > 500000) return response.status(413).json({ error: 'AI insights payload is too large.' });
  const { resume, jobDescription, matchResult, skillGapResult } = request.body;
  const matchingValidation = validateMatchInput(resume, jobDescription);
  if (!matchingValidation.valid) return response.status(400).json({ error: matchingValidation.errors.join(' ') });
  if (!matchResult || typeof matchResult !== 'object' || !Array.isArray(matchResult.matches)) return response.status(400).json({ error: 'matchResult must contain a matches array.' });
  const trace = verifyMatchTraceability(resume, jobDescription, matchResult);
  if (!trace.valid) return response.status(400).json({ error: 'matchResult failed evidence integrity validation.' });
  try { response.json(await generateAIInsights({ resume, jobDescription, matchResult, skillGapResult })); } catch (error) { console.error('AI insights failed:', error.message); response.json({ mode: 'deterministic-fallback', insights: { version: 1, schemaVersion: 1, requirementInsights: [], matchExplanations: [], gapPriorities: [], resumeImprovements: [], warnings: [] }, quality: { source: 'deterministic', notes: 'AI unavailable. Deterministic results are preserved.' } }); }
});

app.post('/api/parse-job-description', (request, response) => {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body) || typeof request.body.jobDescription !== 'string') return response.status(400).json({ error: 'Job description must be a string.' });
  const source = request.body.jobDescription;
  if (!source.trim()) return response.status(400).json({ error: 'Job description is required.' });
  if (source.length > 100000) return response.status(413).json({ error: 'Job description is too large.' });
  response.json(parseStructuredJobDescription(source));
});

app.post('/api/analyze-job', async (request, response) => {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body) || typeof request.body.jobDescription !== 'string' || !request.body.jobDescription.trim()) {
    return response.status(400).json({ error: 'Job description is required.' });
  }

  const jobDescription = request.body.jobDescription.trim();
  try {
    const analysis = parseJobDescription(jobDescription);
    const store = await readStore();
    const matches = analysis.requirements.map((requirement) => matchRequirement({
      ...requirement,
      text: requirement.skill || requirement.text
    }, store.evidence));
    response.json({ jobDescription, requirements: analysis.requirements, matches });
  } catch (error) {
    sendStorageError(response, error);
  }
});

app.use((error, request, response, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return response.status(400).json({ error: 'Request body must contain valid JSON.' });
  }
  next(error);
});

function startServer() {
  return ensureStorage()
    .then(() => app.listen(port, () => console.log(`Liquid Evidence is running at http://localhost:${port}`)));
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Unable to initialize evidence storage.', error);
    process.exit(1);
  });
}

module.exports = { app, startServer };
