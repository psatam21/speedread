import assert from 'node:assert/strict';
import '../public/humanizer.js';

const H = globalThis.BriskReadHumanizer;
assert.ok(H, 'BriskReadHumanizer global must be registered');

// 1. Watermark & Em-dash Scrubber
{
  const input = 'Hello\u200Bworld\u200C!\uFEFF This — is an em-dash\u00AD test.';
  const res = H.scrubWatermarks(input);
  assert.equal(res.watermarksRemoved, 4, 'Should detect 4 zero-width / soft-hyphen chars');
  assert.equal(res.emDashesReplaced, 1, 'Should detect 1 em-dash');
  assert.ok(!/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/.test(res.text), 'All zero-width characters must be stripped');
  assert.ok(!res.text.includes('—'), 'Em-dash must be replaced');
}

// 2. AI Tell Scrubber (38 patterns) & TellInvariantGate
{
  const aiHeavy =
    'It is important to note that we must delve into the rich tapestry of neural architecture. ' +
    'Furthermore, this serves as a testament to how researchers utilize transformers in the realm of NLP. ' +
    'In conclusion, the results underscore a pivotal paradigm shift.';
  const res = H.humanize(aiHeavy, { mode: 'academic', intensity: 85, seed: 42 });
  assert.ok(res.invariants.zeroTellPassed, 'TellInvariantGate must pass');
  assert.ok(res.after.tellsCount < res.before.tellsCount, `AI tells count must decrease (${res.before.tellsCount} -> ${res.after.tellsCount})`);
  assert.ok(!/\b(delve|tapestry|testament|utilize|realm|pivotal)\b/i.test(res.output), 'Known AI tells must be scrubbed from output');
  assert.ok(res.after.aiRiskScore < res.before.aiRiskScore, `AI risk score must drop (${res.before.aiRiskScore} -> ${res.after.aiRiskScore})`);
}

// 3. FactInvariantGate: LaTeX math, citations, numbers, URLs, and 65+ scientific terms
{
  const scientificInput =
    'Furthermore, the Navier-Stokes equations discretized via the Crank-Nicolson method ($u_i^{n+1} - u_i^n = \\frac{\\Delta t}{2}$) ' +
    'demonstrate 99.4% convergence [12] and align with (Vaswani et al., 2017) as documented at https://arxiv.org/abs/1706.03762 ' +
    'and \\cite{crank1947} using Runge-Kutta and eigenvalues.';
  const res = H.humanize(scientificInput, { mode: 'academic', intensity: 95, seed: 7 });
  assert.ok(res.invariants.factsPreserved, 'FactInvariantGate must pass');
  assert.ok(res.output.includes('$u_i^{n+1} - u_i^n = \\frac{\\Delta t}{2}$'), 'Inline LaTeX math must be preserved verbatim');
  assert.ok(res.output.includes('\\cite{crank1947}'), 'LaTeX \\cite{} must be preserved verbatim');
  assert.ok(res.output.includes('[12]'), 'Bracketed numeric citation [12] must be preserved');
  assert.ok(res.output.includes('(Vaswani et al., 2017)'), 'APA parenthetical citation must be preserved');
  assert.ok(res.output.includes('99.4%'), 'Numeric percentage must be preserved');
  assert.ok(res.output.includes('https://arxiv.org/abs/1706.03762'), 'URL must be preserved');
  assert.ok(res.output.includes('Navier-Stokes'), 'Protected term Navier-Stokes must be preserved');
  assert.ok(res.output.includes('Crank-Nicolson'), 'Protected term Crank-Nicolson must be preserved');
  assert.ok(res.output.includes('Runge-Kutta'), 'Protected term Runge-Kutta must be preserved');
}

// 4. Winnowing k=5, w=4 Overlap Reduction
{
  const sample = H.SAMPLES.academic;
  const fp = H.winnowFingerprints(sample, 5, 4);
  assert.ok(fp.fingerprints.size > 0, 'Should compute k=5, w=4 Winnowing fingerprints');
  const res = H.humanize(sample, { mode: 'academic', intensity: 80, seed: 42 });
  assert.ok(
    res.winnowingOverlapPct < 75,
    `Winnowing 5-gram overlap should be significantly reduced below 100%, got ${res.winnowingOverlapPct}%`
  );
  const selfOverlap = H.winnowOverlap(sample, sample, 5, 4);
  assert.equal(selfOverlap, 100, 'Identical text must have 100% Winnowing overlap');
}

// 5. AST String-Aware Code Comment Humanizer
{
  const codeSample = [
    'const endpoint = "https://api.example.com/v1#anchor // not a comment";',
    '// In conclusion, this function plays a pivotal role in utilizing the array',
    'function runTask(items) {',
    '  const regex = "#not-a-comment";',
    '  # Furthermore, we leverage vectorization in order to optimize speed',
    '  return items.length;',
    '}',
  ].join('\n');

  for (const persona of ['beginner', 'intermediate', 'senior']) {
    const res = H.humanize(codeSample, { mode: 'code', persona, intensity: 85, seed: 42 });
    assert.ok(
      res.output.includes('const endpoint = "https://api.example.com/v1#anchor // not a comment";'),
      `String literal with // and # must remain untouched in ${persona} persona`
    );
    assert.ok(
      res.output.includes('function runTask(items) {') && res.output.includes('return items.length;'),
      `Executable code lines must remain untouched in ${persona} persona`
    );
    assert.notEqual(res.output, codeSample, `Comments should be rewritten in ${persona} persona`);
  }
}

// 6. Determinism & Seed Variation
{
  const text = H.SAMPLES.essay;
  const r1 = H.humanize(text, { mode: 'conversational', intensity: 75, seed: 101 });
  const r2 = H.humanize(text, { mode: 'conversational', intensity: 75, seed: 101 });
  const r3 = H.humanize(text, { mode: 'conversational', intensity: 75, seed: 202 });
  assert.equal(r1.output, r2.output, 'Same seed must produce identical output');
  assert.notEqual(r1.output, r3.output, 'Different seeds should produce distinct variations');
}

// 7. Word-level LCS Diff & Empty Input Safety
{
  const emptyRes = H.humanize('   ');
  assert.equal(emptyRes.output, '', 'Empty/whitespace input must return empty output safely');
  assert.equal(emptyRes.before.words, 0, 'Empty input must report 0 words');

  const diff = H.diffTokens('we utilize this method', 'we use this approach');
  assert.ok(diff.some((d) => d.type === 'removed' && d.text.includes('utilize')), 'Diff must mark removed tokens');
  assert.ok(diff.some((d) => d.type === 'added' && d.text.includes('use')), 'Diff must mark added tokens');
}

// 8. AIHumanize.io Scene Modes (general, academic, blog, formal, informal, expand, simplify) & 4 Models (quality, balance, enhanced, private)
{
  const scenes = ['general', 'academic', 'blog', 'formal', 'informal', 'expand', 'simplify'];
  for (const mode of scenes) {
    const res = H.humanize(H.SAMPLES.genz, { mode, model: 'balance', intensity: 80, seed: 11 });
    assert.ok(res.output.length > 40, `Scene mode "${mode}" must produce valid output`);
    assert.ok(res.invariants.zeroTellPassed, `Scene mode "${mode}" must pass Zero-Tell gate`);
  }

  // Informal vs Formal contractions check
  const contractionSample = "Furthermore, it is clear that we cannot ignore what they do not measure, and it's a major issue.";
  const infRes = H.humanize(contractionSample, { mode: 'informal', intensity: 80, seed: 1 });
  const formRes = H.humanize(contractionSample, { mode: 'formal', intensity: 80, seed: 1 });
  assert.ok(/\b(it's|can't|don't)\b/i.test(infRes.output), 'Informal scene must introduce natural contractions');
  assert.ok(!/\b(it's|can't|don't)\b/i.test(formRes.output), 'Formal scene must expand contractions');

  // Simplify vs Expand check
  const simpRes = H.humanize(H.SAMPLES.genz, { mode: 'simplify', intensity: 85, seed: 3 });
  const expRes = H.humanize(H.SAMPLES.genz, { mode: 'expand', intensity: 85, seed: 3 });
  assert.ok(simpRes.output.includes('buying habits') || simpRes.output.includes('shopper tastes'), 'Simplify mode must apply plain-English swaps');
  assert.ok(expRes.after.words >= simpRes.after.words, 'Expand mode must produce more elaborative text than Simplify mode');

  // 4 Models check
  const models = ['quality', 'balance', 'enhanced', 'private'];
  for (const model of models) {
    const mRes = H.humanize(H.SAMPLES.essay, { mode: 'conversational', model, intensity: 75, seed: 5 });
    assert.ok(mRes.output.length > 30, `Model "${model}" must produce valid output`);
  }
}

// 9. AIHumanize.io Lock Keywords (up to 30 SEO phrases) & Lock Citations (double-quoted strings)
{
  const seoDraft =
    'Furthermore, this report analyzes how sustainable fashion and Generation Z purchasing behaviors utilize modern digital platforms. ' +
    'As the lead researcher stated, "it is important to delve into the rich tapestry of circular textiles" (Chen, 2025).';
  const lockedRes = H.humanize(seoDraft, {
    mode: 'blog',
    model: 'enhanced',
    intensity: 95,
    lockKeywords: ['sustainable fashion', 'Generation Z', 'purchasing behaviors'],
    lockCitations: true,
    seed: 9,
  });
  assert.ok(lockedRes.invariants.keywordsPreserved, 'Locked SEO keywords invariant must pass');
  assert.ok(lockedRes.invariants.citationsPreserved, 'Locked double-quoted strings invariant must pass');
  assert.ok(lockedRes.output.includes('sustainable fashion'), 'Locked keyword "sustainable fashion" must remain untouched');
  assert.ok(lockedRes.output.includes('Generation Z'), 'Locked keyword "Generation Z" must remain untouched');
  assert.ok(lockedRes.output.includes('purchasing behaviors'), 'Locked keyword "purchasing behaviors" must remain untouched');
  assert.ok(
    lockedRes.output.includes('"it is important to delve into the rich tapestry of circular textiles"'),
    'Double-quoted string must remain 100% untouched when lockCitations is enabled'
  );
}

// 10. AIHumanize.io Autopilot Pro Multi-Pass Loop, Inline LCS Highlight Diff, 7 Detectors & Language Detection
{
  const autoRes = H.humanize(H.SAMPLES.academic, {
    mode: 'academic',
    model: 'balance',
    autopilot: true,
    intensity: 80,
    seed: 0,
  });
  assert.ok(autoRes.autopilot.enabled, 'Autopilot metadata must report enabled=true');
  assert.ok(autoRes.autopilot.passesRun >= 1 && autoRes.autopilot.passesRun <= 4, 'Autopilot must run between 1 and 4 passes');
  assert.ok(Array.isArray(autoRes.detectors) && autoRes.detectors.length === 7, 'Must evaluate all 7 AI detectors');
  assert.ok(Array.isArray(autoRes.highlightDiff) && autoRes.highlightDiff.length > 0, 'Must compute AIHumanize inline LCS highlightDiff');
  assert.ok(autoRes.highlightDiff.some((seg) => seg.changed), 'highlightDiff must flag modified spans');

  const enLang = H.detectLanguageAndCount('Hello world, this is a five word sentence.');
  assert.equal(enLang.isCJK, false, 'English text must not be flagged as CJK');
  assert.equal(enLang.words, 8, 'Western word counter must count words accurately');

  const zhLang = H.detectLanguageAndCount('人工智能文本人性化工具可以帮助改写文章');
  assert.equal(zhLang.isCJK, true, 'Chinese text must be detected as CJK');
  assert.equal(zhLang.lang, 'zh', 'Chinese script must return lang="zh"');
  assert.equal(zhLang.words, 19, 'CJK counter must count individual CJK characters');
}

console.log(
  'Humanizer unit tests passed (Turnitout 14-stage pipeline + AIHumanize.io 7 scenes, 4 models, Autopilot Pro, Lock Keywords/Citations, LCS Highlight Diff, 7 detectors, CJK/Western counter).'
);

