import zlib from 'node:zlib';
import '../public/humanizer.js';

const H = globalThis.BriskReadHumanizer;

// 10 diverse, realistic AI-generated benchmark passages
export const BENCHMARK_CORPUS = [
  {
    id: 'chatgpt_essay',
    name: '1. ChatGPT-4o College Essay',
    mode: 'conversational',
    text:
      "Moreover, in today's fast-paced digital era, the profound impact of social connectivity cannot be overlooked. " +
      'Social media platforms have transformed the way individuals communicate, fostering a sense of global community while simultaneously creating new challenges for mental health. ' +
      'Furthermore, this experience serves as a critical milestone in my personal journey, allowing me to delve deep into the multifaceted dimensions of human empathy. ' +
      'Ultimately, this paradigm shift has fundamentally shaped my worldview, highlighting the importance of authentic relationships in an increasingly virtual world.',
  },
  {
    id: 'claude_academic',
    name: '2. Claude 3.5 Academic Literature Review',
    mode: 'academic',
    text:
      'In conclusion, it is important to delve into the comprehensive tapestry of modern neural networks. ' +
      'Previous studies have shown that transformer architectures play a pivotal role in illustrating how artificial intelligence stands as a testament to human innovation [1]. ' +
      'Furthermore, the interplay between stochastic optimization and computational scalability provides a robust framework for subsequent empirical inquiries (Vaswani et al., 2017). ' +
      'Consequently, researchers must utilize rigorous evaluation protocols in order to ensure reproducible outcomes across diverse benchmark datasets.',
  },
  {
    id: 'seo_blog',
    name: '3. AI Marketing & SEO Blog Post',
    mode: 'blog',
    lockKeywords: ['remote work', 'asynchronous communication'],
    text:
      'When it comes to managing distributed teams, remote work has emerged as a game-changer for modern businesses. ' +
      'Not only does remote work provide employees with greater flexibility, but it also enables companies to tap into a global talent pool. ' +
      'However, in order to unlock the full potential of a distributed workforce, organizations must embrace asynchronous communication, thereby reducing meeting fatigue and boosting overall productivity. ' +
      'By implementing clear documentation practices, teams can seamlessly collaborate across different time zones.',
  },
  {
    id: 'genz_report',
    name: '4. AIHumanize.io Gen Z Report',
    mode: 'conversational',
    text:
      'This report analyzes evolving consumer preferences and purchasing behaviors of Generation Z (Gen Z) within sustainable fashion. ' +
      'Furthermore, as a digitally native cohort, Gen Z commands significant market influence and prioritizes ethical production alongside environmental accountability. ' +
      'Consequently, brands must align their supply chain disclosures with verifiable sustainability metrics in order to retain long-term loyalty.',
  },
  {
    id: 'exec_memo',
    name: '5. Executive Strategy Memo',
    mode: 'formal',
    text:
      'In this analysis, we evaluate the operational efficiencies gained through automated supply chain forecasting during the third quarter. ' +
      'The implementation of predictive inventory models has resulted in a 24.5% reduction in warehouse holding costs across regional distribution centers. ' +
      'Moreover, it is worth noting that cross-functional alignment between procurement and logistics teams remains essential for sustaining these improvements. ' +
      'Therefore, leadership should prioritize the expansion of real-time telemetry tools in order to mitigate potential supply disruptions.',
  },
  {
    id: 'clinical_summary',
    name: '6. Clinical Research Abstract',
    mode: 'academic',
    lockCitations: true,
    text:
      'Cardiovascular disease remains a leading cause of mortality worldwide, underscoring the urgent need for early diagnostic interventions (chen et al., 2024). ' +
      'In this study, patient biomarkers were analyzed by researchers using high-sensitivity troponin assays to evaluate myocardial injury across 1,420 clinical subjects. ' +
      'The results indicate that early risk stratification achieves 94.2% sensitivity, thereby enabling clinicians to initiate targeted therapy before irreversible tissue damage occurs. ' +
      'As the lead cardiologist noted, "early biomarker screening fundamentally alters patient triage in emergency departments" [4].',
  },
  {
    id: 'stem_latex',
    name: '7. STEM Paper with LaTeX & Equations',
    mode: 'technical',
    text:
      'In this study, previous studies have shown that the Crank-Nicolson scheme $u_i^{n+1} - u_i^n = \\frac{\\Delta t}{2}(L_h u_i^{n+1} + L_h u_i^n)$ provides a robust framework for solving the heat equation \\cite{crank1947}. ' +
      'Furthermore, it should be noted that the application of boundary conditions plays a pivotal role in maintaining 99.4% numerical stability across the discretization grid. ' +
      'Consequently, the truncation error is reduced by means of second-order central differences, ensuring rapid convergence in large-scale simulations.',
  },
  {
    id: 'humanities_history',
    name: '8. Humanities & History Essay',
    mode: 'academic',
    text:
      'Throughout the nineteenth century, the expansion of railway networks played a crucial role in reshaping urban economies across Western Europe. ' +
      'By connecting isolated agricultural regions with industrial manufacturing hubs, steam locomotion facilitated the rapid movement of raw materials and finished goods. ' +
      'Additionally, the standardization of railway timetables fundamentally altered public perceptions of time, fostering a more synchronized national consciousness. ' +
      'Thus, the locomotive served as both an economic catalyst and a cultural force that redefined modern society.',
  },
  {
    id: 'policy_brief',
    name: '9. Environmental Policy Brief',
    mode: 'simplify',
    text:
      'Urban heat islands represent a growing environmental challenge for metropolitan areas experiencing rapid population growth and infrastructure expansion. ' +
      'Because impervious surfaces such as asphalt and concrete absorb substantial solar radiation, city neighborhoods frequently experience temperatures that are 4.5 degrees higher than surrounding rural areas. ' +
      'In order to address this issue, municipal planners are increasingly implementing urban forestry initiatives and reflective roofing mandates, which help reduce cooling energy demand during peak summer months.',
  },
  {
    id: 'esl_textbook',
    name: '10. Clean Textbook / ESL Draft (No Obvious Clichés)',
    mode: 'conversational',
    text:
      'Renewable energy storage is an important component of modern electrical grids because solar and wind power generation fluctuates throughout the day. ' +
      'However, large battery systems require significant capital investment and depend on critical mineral supply chains that face geopolitical constraints. ' +
      'Therefore, engineers are investigating alternative storage technologies such as pumped hydro, compressed air, and thermal energy systems. ' +
      'Additionally, smart grid software helps balance electricity demand during peak hours so that utilities can avoid costly blackouts.',
  },
];

// Independent Statistical + Structural + Fluency Evaluator
// Incorporates Turnitout v1.5 zlib compression perplexity, BERT/GPT structural tells,
// burstiness CV, sentence-length range, Winnowing k=5/w=4 overlap, and grammar checks.
export function evaluatePassage(rawInput, output, res) {
  const sentences = output
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const words = output.match(/[A-Za-z0-9']+/g) || [];
  const wordCount = words.length;

  // 1. Sentence length burstiness (CV + Range)
  const sentLengths = sentences.map((s) => (s.match(/[A-Za-z0-9']+/g) || []).length).filter((n) => n > 0);
  const meanLen = sentLengths.length ? sentLengths.reduce((a, b) => a + b, 0) / sentLengths.length : 0;
  const variance =
    sentLengths.length > 1
      ? sentLengths.reduce((acc, n) => acc + Math.pow(n - meanLen, 2), 0) / sentLengths.length
      : 0;
  const burstinessCV = meanLen > 0 ? Math.sqrt(variance) / meanLen : 0;
  const minSent = sentLengths.length ? Math.min(...sentLengths) : 0;
  const maxSent = sentLengths.length ? Math.max(...sentLengths) : 0;
  const lenSpread = maxSent - minSent;

  // 2. Turnitout v1.5 ZipPy Compression Perplexity (zlib deflate bits per char)
  const rawBuf = Buffer.from(output, 'utf-8');
  const compressed = zlib.deflateSync(rawBuf, { level: 9 });
  const compressionRatio = rawBuf.length > 0 ? compressed.length / rawBuf.length : 1;

  // 3. Expanded AI Tell & Structural Cliché Scanner (excludes locked quotes)
  const unquotedOutput = output.replace(/(?:"[^"\n]*"|“[^”\n]*”)/g, '');
  const EXTENDED_AI_PATTERNS = [
    /\bdelv(?:e|es|ed|ing)\b/i,
    /\btapestr(?:y|ies)\b/i,
    /\btestament to\b/i,
    /\bpivotal\b/i,
    /\bunderscor(?:e|es|ed|ing)\b/i,
    /\bfoster(?:s|ed|ing)?\b/i,
    /\butiliz(?:e|es|ed|ing)\b/i,
    /\b vibrant\b/i,
    /\bin the realm of\b/i,
    /\bembark(?:s|ed|ing)?\b/i,
    /\bseamless(?:ly)?\b/i,
    /\bgame-changer\b/i,
    /\bunleash(?:es|ed|ing)?\b/i,
    /\bunlock(?:s|ed|ing)? the full potential\b/i,
    /\bparadigm shift\b/i,
    /\bmultifaceted\b/i,
    /\bfast-paced digital\b/i,
    /\bcannot be overlooked\b/i,
    /\bserves as a\b/i,
    /\bstands as a\b/i,
    /\bplays a (?:crucial|critical|vital|key) role\b/i,
    /\bprovides a robust framework\b/i,
    /\bit is (?:important|worth|crucial|essential) to (?:note|remember|mention)\b/i,
    /\bit should be noted that\b/i,
    /\bin order to\b/i,
    /\bwhen it comes to\b/i,
    /\bnot only does\b/i,
    /,\s*(?:thereby|thus)\s+[a-z]+ing\b/i,
    /,\s*(?:fostering|underscoring|highlighting|ensuring|enabling|allowing)\s+/i,
  ];
  const survivingTells = [];
  for (const pat of EXTENDED_AI_PATTERNS) {
    const m = pat.exec(unquotedOutput);
    if (m) survivingTells.push(m[0]);
  }

  // 4. Grammar & Fluency Quality Audit
  const grammarIssues = [];
  if (/\.\.|,,|,\s*\.|;\s*\./.test(output)) grammarIssues.push('double-punctuation');
  if (/\b([a-z]{3,})\s+\1\b/i.test(output)) grammarIssues.push('duplicate-adjacent-word');
  if (/\ba\s+[aeiouAEIOU](?!ni|u[nr]|use|one|nce)/.test(output)) grammarIssues.push('a-before-vowel');
  if (/\ban\s+[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]/.test(output)) grammarIssues.push('an-before-consonant');
  if (/[\x00]/.test(output)) grammarIssues.push('unmasked-placeholder-leak');
  if (/(?:^|[.!?]\s+)[a-z]/.test(output.replace(/\$[^$]+\$/g, 'MATH'))) {
    grammarIssues.push('lowercase-sentence-start');
  }
  const fluencyScore = Math.max(0, 100 - grammarIssues.length * 15);

  // 5. Winnowing k=5, w=4 overlap
  const winnowOverlap = H.winnowOverlap(rawInput, output, 5, 4);

  // 6. Composite Independent AI Detection Score (0 = Human, 100 = AI)
  const tellPenalty = survivingTells.length * 14;
  const burstPenalty = burstinessCV >= 0.42 ? 0 : Math.round((0.42 - burstinessCV) * 75);
  const spreadPenalty = lenSpread >= 10 ? 0 : Math.round((10 - lenSpread) * 2);
  const overlapPenalty = winnowOverlap > 25 ? Math.round((winnowOverlap - 25) * 0.45) : 0;
  const independentAiScore = Math.max(
    0,
    Math.min(100, tellPenalty + burstPenalty + spreadPenalty + overlapPenalty)
  );

  return {
    wordCount,
    sentCount: sentences.length,
    sentLengths,
    burstinessCV: Number(burstinessCV.toFixed(2)),
    lenSpread,
    compressionRatio: Number(compressionRatio.toFixed(2)),
    winnowOverlap,
    survivingTells,
    grammarIssues,
    fluencyScore,
    engineAiBefore: res.before.aiRiskScore,
    engineAiAfter: res.after.aiRiskScore,
    independentAiScore,
    invariants: res.invariants,
  };
}

let passCount = 0;
console.log('================================================================================');
console.log('BRISKREAD HUMANIZER — 10-CORPUS BENCHMARK & QUALITY DIAGNOSTIC');
console.log('================================================================================\n');

for (const item of BENCHMARK_CORPUS) {
  const res = H.humanize(item.text, {
    mode: item.mode,
    model: 'enhanced',
    autopilot: true,
    intensity: 85,
    lockKeywords: item.lockKeywords || [],
    lockCitations: Boolean(item.lockCitations),
    seed: 1,
  });
  const ev = evaluatePassage(item.text, res.output, res);
  const passed =
    ev.independentAiScore < 20 &&
    ev.engineAiAfter < 20 &&
    ev.winnowOverlap <= 30 &&
    ev.survivingTells.length === 0 &&
    ev.fluencyScore >= 90 &&
    ev.invariants.factsPreserved &&
    ev.invariants.keywordsPreserved &&
    ev.invariants.citationsPreserved;
  if (passed) passCount++;

  console.log(`${passed ? '✅ PASS' : '❌ FAIL'} | ${item.name} [mode=${item.mode}]`);
  console.log(
    `   AI Risk (Engine): ${ev.engineAiBefore}% -> ${ev.engineAiAfter}% | Independent AI Score: ${ev.independentAiScore}%`
  );
  console.log(
    `   Winnowing k=5 Overlap: ${ev.winnowOverlap}% | Burstiness CV: ${ev.burstinessCV} (lengths: [${ev.sentLengths.join(', ')}], spread=${ev.lenSpread})`
  );
  console.log(
    `   Surviving Tells (${ev.survivingTells.length}): ${ev.survivingTells.join(', ') || 'None'} | Grammar Issues: ${ev.grammarIssues.join(', ') || 'None'}`
  );
  console.log(`   BEFORE: ${item.text}`);
  console.log(`   AFTER : ${res.output}\n`);
}

console.log('================================================================================');
console.log(`SUMMARY: ${passCount} / ${BENCHMARK_CORPUS.length} passages passed all strict humanization criteria.`);
console.log('================================================================================');
if (passCount < BENCHMARK_CORPUS.length) {
  process.exitCode = 1;
}
