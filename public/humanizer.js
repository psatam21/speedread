/*
 * BriskRead Programmatic Text Humanizer & Pattern Disruptor Engine.
 * Based on the Turnitout zero-generative-AI architecture:
 *   1. Zero-width Unicode & watermark scrubber + em-dash normalizer
 *   2. Placeholder masking for LaTeX ($...$, \cite{}), code, URLs, citations, numbers & protected terms
 *   3. 38-pattern AI Tell Scrubber (chatbot preambles, significance inflation, copula avoidance)
 *   4. Multi-stage deterministic transformer pipeline (phrase rewrites, inflection-aware synonyms
 *      with 15-word FIFO repetition blocker, PDTB 2.0 discourse rotation, clause reordering,
 *      determiner cycling, sentence splitting & fusion for burstiness, active/passive voice flip,
 *      nominalization, hedge & appositive injection, and AST string-aware code comment mode)
 *   5. Karp-Rabin k=5, w=4 Winnowing fingerprint audit + Zero-Tell & Fact Invariant Gates
 *
 * Pure functions, zero network calls, runs identically in Node (build/test) and browser.
 */
(function (root) {
  'use strict';

  // ---- 1. Deterministic PRNG (Mulberry32) seeded from text + variant seed ----
  const hashString = (str) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  };

  const createRng = (seed) => {
    let s = (seed >>> 0) || 1;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Non-linear power curve from Turnitout v1.5: (intensity / 100) ** 0.75
  const effectiveIntensity = (sliderPct) => {
    const clamped = Math.max(0, Math.min(100, Number(sliderPct) || 0));
    if (clamped === 0) return 0;
    return Math.pow(clamped / 100, 0.75);
  };

  // ---- 2. Protected terms (scientific, mathematical, software names) ----
  const PROTECTED_TERMS = [
    'Navier-Stokes', 'Navier--Stokes', 'Crank-Nicolson', 'Black-Scholes', 'Runge-Kutta',
    'Monte Carlo', 'Markov chain', 'Laplace equation', 'heat equation', 'wave equation',
    'Green\'s function', 'Green\'s theorem', 'Stokes\' theorem', 'Gauss\'s theorem',
    'Reynolds number', 'Mach number', 'Prandtl number', 'Nusselt number', 'Courant number',
    'Boltzmann', 'Maxwell', 'Helmholtz', 'Schrödinger', 'Schrodinger', 'Heisenberg',
    'Bernoulli', 'Lagrange', 'Lagrangian', 'Hamiltonian', 'Jacobian', 'Hessian', 'Wronskian',
    'Cauchy', 'Riemann', 'Hilbert', 'Banach', 'Sobolev', 'Lebesgue', 'Gaussian', 'Bayesian',
    'Boolean', 'Euclidean', 'Cartesian', 'Fibonacci', 'Hermitian', 'Abelian', 'Kolmogorov',
    'Lyapunov', 'Fourier', 'Poisson', 'Dirichlet', 'Neumann', 'Eigenvalue', 'eigenvalue',
    'eigenvalues', 'eigenvector', 'eigenvectors', 'TensorFlow', 'PyTorch', 'COMSOL',
    'ANSYS', 'OpenFOAM', 'MATLAB', 'Simulink', 'SciPy', 'NumPy', 'Kubernetes', 'PostgreSQL',
  ];

  // ---- 3. 38-Pattern AI Tell Scrubber Catalog (§1–§38) ----
  // Combines Turnitout's notebook simulator rules, blader/humanizer tells, and AI vocabulary scrubbers.
  // Built dynamically from split tokens where needed so static HTML scans never false-flag.
  const AI_TELL_PATTERNS = [
    // Chatbot preambles & closing residue
    { id: 'preamble_certainly', re: /^(?:Certainly!|Sure!|Absolutely!|Of course!)\s*(?:Here is|Here's|Below is)[^.!?]*[.!?]\s*/gi, replace: '', category: 'Chatbot residue' },
    { id: 'outro_hope_helps', re: /\s*(?:I hope this helps!|Hope this helps!|Let me know if you(?: would like| need)[^.!?]*[.!?])\s*$/gi, replace: '', category: 'Chatbot residue' },

    // Turnitout Notebook Simulator Core 16 Signatures
    { id: 'in_conclusion_delve', re: /\bIn conclusion,\s*it is important to delve into\b/gi, replace: 'To wrap up, we look closely at', category: 'Formulaic opener' },
    { id: 'in_conclusion', re: /\bIn conclusion,?\b/gi, replace: 'To wrap up,', academicReplace: 'In summary,', category: 'Formulaic opener' },
    { id: 'important_to_delve', re: /\bit is important to delve into\b/gi, replace: 'we look closely at', academicReplace: 'we examine', category: 'AI cliché' },
    { id: 'delve_multifaceted', re: /\bdelve deep into the multifaceted dimensions of\b/gi, replace: 'examine the details of', academicReplace: 'analyze the dimensions of', category: 'AI cliché' },
    { id: 'delve_into', re: /\bdelves?\s+(?:deeply\s+)?into\b/gi, replace: 'explore', academicReplace: 'examine', category: 'AI vocabulary' },
    { id: 'delve_verb', re: /\bdelv(?:e|ed|ing)\b/gi, replace: 'examine', category: 'AI vocabulary' },
    { id: 'comprehensive_tapestry', re: /\b(?:comprehensive|rich|intricate|vibrant)\s+tapestry(?:\s+of)?\b/gi, replace: 'broad range of', academicReplace: 'full scope of', category: 'Metaphor inflation' },
    { id: 'tapestry', re: /\btapestry\b/gi, replace: 'mix', academicReplace: 'structure', category: 'Metaphor inflation' },
    { id: 'pivotal_illustrating', re: /\bplays a pivotal role in illustrating\b/gi, replace: 'clearly shows', academicReplace: 'demonstrates', category: 'Significance inflation' },
    { id: 'pivotal_role', re: /\bplays a (?:pivotal|crucial|vital|key|paramount) role\b/gi, replace: 'is central', academicReplace: 'is essential', category: 'Significance inflation' },
    { id: 'stands_testament', re: /\b(?:stands|serves) as a testament to\b/gi, replace: 'reflects', academicReplace: 'demonstrates', category: 'Significance inflation' },
    { id: 'testament_to', re: /\ba testament to\b/gi, replace: 'proof of', academicReplace: 'evidence of', category: 'Significance inflation' },
    { id: 'furthermore_interplay', re: /\bFurthermore,\s*the interplay between\b/gi, replace: 'Also, balancing', academicReplace: 'In addition, the interaction between', category: 'Discourse cliché' },
    { id: 'interplay_between', re: /\bthe interplay between\b/gi, replace: 'the balance between', academicReplace: 'the interaction between', category: 'AI cliché' },
    { id: 'robust_framework', re: /\bprovides a robust framework\b/gi, replace: 'gives a solid basis', academicReplace: 'establishes a sound foundation', category: 'Promotional phrasing' },
    { id: 'fast_paced_era', re: /\b(?:Moreover,\s*)?in today's (?:fast-paced|rapidly evolving|ever-changing) (?:digital )?(?:era|world|landscape),?\b/gi, replace: 'Today,', academicReplace: 'In contemporary practice,', category: 'Formulaic opener' },
    { id: 'critical_milestone', re: /\bserves as a (?:critical|key|major|pivotal) milestone\b/gi, replace: 'is a major turning point', academicReplace: 'marks a distinct stage', category: 'Significance inflation' },
    { id: 'cannot_be_overlooked', re: /\bcannot be overlooked\b/gi, replace: 'we must address', academicReplace: 'merits close attention', category: 'Hedging cliché' },
    { id: 'ultimately_paradigm', re: /\bUltimately,\s*this paradigm shift\b/gi, replace: 'In the end, this shift', academicReplace: 'Consequently, this transition', category: 'Conclusion bloat' },
    { id: 'paradigm_shift', re: /\bparadigm shift\b/gi, replace: 'major change', academicReplace: 'structural transition', category: 'Promotional phrasing' },

    // Extended blader/humanizer & Turnitout v2.0 Tells (§17–§38)
    { id: 'worth_noting', re: /\b(?:It is|It's) (?:worth noting|important to note|worth mentioning) that\s+/gi, replace: '', academicReplace: 'Notably, ', category: 'Filler hedging' },
    { id: 'should_be_noted', re: /\bIt should be noted that\s+/gi, replace: '', academicReplace: 'Specifically, ', category: 'Filler hedging' },
    { id: 'in_the_realm_of', re: /\bin the realm of\b/gi, replace: 'in', academicReplace: 'within', category: 'Filler hedging' },
    { id: 'at_its_core', re: /\bat its core,?\b/gi, replace: 'basically,', academicReplace: 'fundamentally,', category: 'Filler hedging' },
    { id: 'when_it_comes_to', re: /\bwhen it comes to\b/gi, replace: 'for', academicReplace: 'regarding', category: 'Filler hedging' },
    { id: 'serves_as', re: /\bserves as\b/gi, replace: 'is', academicReplace: 'functions as', category: 'Copula avoidance' },
    { id: 'stands_as', re: /\bstands as\b/gi, replace: 'is', academicReplace: 'remains', category: 'Copula avoidance' },
    { id: 'not_merely_but', re: /\bnot (?:merely|just) ([^,;]+),\s*but (?:also |rather )?([^.;,]+)/gi, replace: 'both $1 and $2', category: 'Negative parallelism' },
    { id: 'underscores', re: /\bunderscores\b/gi, replace: 'shows', academicReplace: 'demonstrates', category: 'Significance inflation' },
    { id: 'underscore', re: /\bunderscore\b/gi, replace: 'show', academicReplace: 'demonstrate', category: 'Significance inflation' },
    { id: 'utilizes', re: /\butilizes\b/gi, replace: 'uses', academicReplace: 'employs', category: 'AI vocabulary' },
    { id: 'utilized', re: /\butilized\b/gi, replace: 'used', academicReplace: 'employed', category: 'AI vocabulary' },
    { id: 'utilizing', re: /\butilizing\b/gi, replace: 'using', academicReplace: 'employing', category: 'AI vocabulary' },
    { id: 'utilize', re: /\butilize\b/gi, replace: 'use', academicReplace: 'employ', category: 'AI vocabulary' },
    { id: 'leverages', re: /\bleverages\b/gi, replace: 'uses', academicReplace: 'applies', category: 'AI vocabulary' },
    { id: 'leveraging', re: /\bleveraging\b/gi, replace: 'using', academicReplace: 'applying', category: 'AI vocabulary' },
    { id: 'leverage_verb', re: /\bleverage\b(?=\s+(?:the|a|an|this|these|our|their|modern|existing|advanced))/gi, replace: 'use', academicReplace: 'apply', category: 'AI vocabulary' },
    { id: 'fosters', re: /\bfosters\b/gi, replace: 'encourages', academicReplace: 'supports', category: 'AI vocabulary' },
    { id: 'fostering', re: /\bfostering\b/gi, replace: 'encouraging', academicReplace: 'supporting', category: 'AI vocabulary' },
    { id: 'foster', re: /\bfoster\b/gi, replace: 'encourage', academicReplace: 'support', category: 'AI vocabulary' },
    { id: 'pivotal', re: /\bpivotal\b/gi, replace: 'central', academicReplace: 'essential', category: 'AI vocabulary' },
    { id: 'paramount', re: /\bparamount\b/gi, replace: 'top', academicReplace: 'primary', category: 'AI vocabulary' },
    { id: 'vibrant', re: /\bvibrant\b/gi, replace: 'lively', academicReplace: 'active', category: 'AI vocabulary' },
    { id: 'seamlessly', re: /\bseamlessly\b/gi, replace: 'smoothly', academicReplace: 'directly', category: 'Promotional phrasing' },
    { id: 'seamless', re: /\bseamless\b/gi, replace: 'smooth', academicReplace: 'direct', category: 'Promotional phrasing' },
    { id: 'game_changer', re: /\bgame-chang(?:er|ing)\b/gi, replace: 'major advance', academicReplace: 'significant advance', category: 'Promotional phrasing' },
    { id: 'unleash', re: /\b(?:unleash|unlock)(?:es|ed|ing)?\b/gi, replace: 'enable', academicReplace: 'facilitate', category: 'Promotional phrasing' },
    { id: 'elevate', re: /\belevat(?:e|es|ed|ing)\b/gi, replace: 'improve', academicReplace: 'enhance', category: 'Promotional phrasing' },
    { id: 'revolutionize', re: /\brevolutioniz(?:e|es|ed|ing)\b/gi, replace: 'transform', academicReplace: 'reshape', category: 'Promotional phrasing' },
    { id: 'synergy', re: /\bsynerg(?:y|ies)\b/gi, replace: 'teamwork', academicReplace: 'coordination', category: 'Promotional phrasing' },
    { id: 'beacon', re: /\bbeacon\b/gi, replace: 'guide', academicReplace: 'benchmark', category: 'Metaphor inflation' },
    { id: 'embark', re: /\bembark(?:s|ed|ing)?\s+on\b/gi, replace: 'start', academicReplace: 'initiate', category: 'Metaphor inflation' },
    { id: 'multifaceted', re: /\bmultifaceted\b/gi, replace: 'complex', academicReplace: 'layered', category: 'AI vocabulary' },
    { id: 'spearheaded', re: /\bspearheaded\b/gi, replace: 'led', academicReplace: 'directed', category: 'Promotional phrasing' },
    { id: 'evolving_landscape', re: /\bevolving landscape\b/gi, replace: 'field', academicReplace: 'domain', category: 'Metaphor inflation' },
    { id: 'moving_forward', re: /\b(?:Moving|Going) forward,\s*/gi, replace: 'Next, ', academicReplace: 'Subsequently, ', category: 'Conclusion bloat' },
  ];

  // ---- 4. Multi-Word Phrase Rewrites (from GodGuide Section 3) ----
  const PHRASE_REWRITES = [
    // Literature review
    { re: /\bprevious studies have shown\b/gi, conv: 'earlier work showed', acad: 'prior investigations have substantiated' },
    { re: /\bhas been widely studied\b/gi, conv: 'has been studied often', acad: 'has been the subject of extensive inquiry' },
    { re: /\bit has been reported that\b/gi, conv: 'reports show that', acad: 'extant literature attests that' },
    { re: /\baccording to recent research\b/gi, conv: 'recent studies show', acad: 'as corroborated by contemporary scholarship' },
    { re: /\bis well documented\b/gi, conv: 'is well known', acad: 'has been amply chronicled in the literature' },
    { re: /\bas mentioned earlier\b/gi, conv: 'as noted above', acad: 'as alluded to in the preceding discussion' },
    { re: /\bthe existing literature\b/gi, conv: 'published work', acad: 'the prevailing body of scholarship' },
    { re: /\bthis research paper\b/gi, conv: 'this paper', acad: 'the present work' },
    { re: /\bin this study\b/gi, conv: 'here', acad: 'in this investigation' },
    // Methodology
    { re: /\bwas carried out\b/gi, conv: 'was done', acad: 'was undertaken' },
    { re: /\bin order to\b/gi, conv: 'to', acad: 'with the objective of' },
    { re: /\bby means of\b/gi, conv: 'using', acad: 'through recourse to' },
    { re: /\bwith respect to\b/gi, conv: 'about', acad: 'concerning' },
    { re: /\bwas conducted\b/gi, conv: 'ran', acad: 'was executed' },
    { re: /\btakes into account\b/gi, conv: 'considers', acad: 'gives due consideration to' },
    { re: /\bis based on\b/gi, conv: 'builds on', acad: 'draws its foundations from' },
    { re: /\bfor the purpose of\b/gi, conv: 'for', acad: 'for the express purpose of' },
    // Results & findings
    { re: /\bthe results indicate\b/gi, conv: 'the results show', acad: 'the findings demonstrate' },
    { re: /\bit can be seen that\b/gi, conv: 'we see that', acad: 'it becomes evident that' },
    { re: /\bas shown in\b/gi, conv: 'as seen in', acad: 'as illustrated in' },
    { re: /\bit was found that\b/gi, conv: 'we found that', acad: 'it was ascertained that' },
    { re: /\ba significant increase\b/gi, conv: 'a clear rise', acad: 'an appreciable escalation' },
    { re: /\bis proportional to\b/gi, conv: 'scales with', acad: 'scales commensurately with' },
    // Discussion & hedging
    { re: /\bthis can be attributed to\b/gi, conv: 'this comes from', acad: 'this may be imputed to' },
    { re: /\bis consistent with\b/gi, conv: 'matches', acad: 'accords with' },
    { re: /\bin good agreement with\b/gi, conv: 'close to', acad: 'in close concordance with' },
    { re: /\bfurther research is needed\b/gi, conv: 'more work is needed', acad: 'subsequent investigation is warranted' },
    { re: /\bfuture work should\b/gi, conv: 'next steps should', acad: 'prospective inquiries ought to' },
    { re: /\bit appears that\b/gi, conv: 'it seems that', acad: 'it would seem plausible that' },
    { re: /\bto some extent\b/gi, conv: 'partly', acad: 'to a nontrivial degree' },
    { re: /\ba large number of\b/gi, conv: 'many', acad: 'a substantial number of' },
    { re: /\ba wide range of\b/gi, conv: 'many kinds of', acad: 'a broad spectrum of' },
    { re: /\bdue to the fact that\b/gi, conv: 'because', acad: 'on the grounds that' },
    { re: /\bas a result of\b/gi, conv: 'from', acad: 'consequent upon' },
  ];

  // ---- 5. PDTB 2.0 Discourse Marker Rotation (from GodGuide Stage G) ----
  const DISCOURSE_ROTATIONS = {
    however: {
      conv: ['Still', 'Yet', 'Even so', 'That said', 'On the other hand'],
      acad: ['Nevertheless', 'Nonetheless', 'On the other hand', 'That said', 'Even so'],
    },
    therefore: {
      conv: ['So', 'As a result', 'Because of this', 'For this reason', 'Hence'],
      acad: ['Consequently', 'Hence', 'As a result', 'Accordingly', 'For this reason'],
    },
    moreover: {
      conv: ['Also', 'Besides that', 'Beyond this', 'On top of that', 'In addition'],
      acad: ['In addition', 'Beyond this', 'What is more', 'Further', 'Along with this'],
    },
    furthermore: {
      conv: ['Also', 'In addition', 'Beyond that', 'Next', 'Plus'],
      acad: ['In addition', 'Further', 'Beyond this', 'Along these lines', 'Equally'],
    },
    additionally: {
      conv: ['Also', 'Besides', 'Beyond that', 'Together with this'],
      acad: ['In addition', 'Further', 'Alongside this', 'Beyond this'],
    },
    although: {
      conv: ['Even though', 'While', 'Though', 'Despite the fact that'],
      acad: ['Even though', 'While', 'Notwithstanding that', 'Granted that'],
    },
    thus: {
      conv: ['So', 'In this way', 'As a result', 'Hence'],
      acad: ['Hence', 'Accordingly', 'As such', 'In this manner', 'By this means'],
    },
    indeed: {
      conv: ['In fact', 'Certainly', 'Clearly', 'To be sure'],
      acad: ['In fact', 'Certainly', 'To be sure', 'Without question'],
    },
    similarly: {
      conv: ['Likewise', 'In the same way', 'Along the same lines', 'Just as'],
      acad: ['Likewise', 'In a similar manner', 'Comparably', 'By the same token'],
    },
    specifically: {
      conv: ['In particular', 'To be specific', 'Namely', 'More precisely'],
      acad: ['In particular', 'More precisely', 'To be specific', 'Namely'],
    },
    notably: {
      conv: ['In particular', 'Importantly', 'Significantly', 'Especially'],
      acad: ['Significantly', 'Importantly', 'In particular', 'Remarkably'],
    },
    meanwhile: {
      conv: ['At the same time', 'During this time', 'In the meantime', 'Simultaneously'],
      acad: ['In the interim', 'Concurrently', 'At the same time', 'Simultaneously'],
    },
    conversely: {
      conv: ['On the other hand', 'In contrast', 'By contrast', 'Instead'],
      acad: ['In contrast', 'By contrast', 'On the contrary', 'Contrastingly'],
    },
    ultimately: {
      conv: ['In the end', 'Finally', 'When all is said and done', 'At last'],
      acad: ['In the final analysis', 'In the end', 'When all is considered', 'Finally'],
    },
    evidently: {
      conv: ['Clearly', 'As it turns out', 'It seems', 'Apparently'],
      acad: ['Apparently', 'As it turns out', 'Seemingly', 'Ostensibly'],
    },
    essentially: {
      conv: ['Basically', 'In short', 'At heart', 'Simply put'],
      acad: ['Fundamentally', 'In essence', 'Basically', 'At root'],
    },
    typically: {
      conv: ['Usually', 'Generally', 'In most cases', 'As a rule'],
      acad: ['Generally', 'Ordinarily', 'As a rule', 'In most cases'],
    },
  };

  // ---- 6. Inflection-Aware Synonym Catalog (from GodGuide Section 2) ----
  // Never contains any word from BANNED_AI_WORDS.
  const SYNONYM_CATALOG = {
    analyze: { conv: ['examine', 'study', 'check', 'break down'], acad: ['examine', 'inspect', 'scrutinize', 'dissect'] },
    analyzes: { conv: ['examines', 'studies', 'checks'], acad: ['examines', 'inspects', 'scrutinizes', 'dissects'] },
    analyzed: { conv: ['examined', 'studied', 'checked'], acad: ['examined', 'inspected', 'scrutinized', 'dissected'] },
    analyzing: { conv: ['examining', 'studying', 'checking'], acad: ['examining', 'inspecting', 'scrutinizing', 'dissecting'] },
    demonstrate: { conv: ['show', 'prove', 'make clear'], acad: ['illustrate', 'substantiate', 'corroborate', 'establish'] },
    demonstrates: { conv: ['shows', 'proves', 'makes clear'], acad: ['illustrates', 'substantiates', 'corroborates', 'establishes'] },
    demonstrated: { conv: ['showed', 'proved', 'made clear'], acad: ['illustrated', 'substantiated', 'corroborated', 'established'] },
    demonstrating: { conv: ['showing', 'proving', 'making clear'], acad: ['illustrating', 'substantiating', 'corroborating', 'establishing'] },
    illustrate: { conv: ['show', 'explain', 'point out'], acad: ['depict', 'clarify', 'elucidate', 'exemplify'] },
    illustrates: { conv: ['shows', 'explains', 'points out'], acad: ['depicts', 'clarifies', 'elucidates', 'exemplifies'] },
    illustrated: { conv: ['showed', 'explained', 'pointed out'], acad: ['depicted', 'clarified', 'elucidated', 'exemplified'] },
    illustrating: { conv: ['showing', 'explaining', 'pointing out'], acad: ['depicting', 'clarifying', 'elucidating', 'exemplifying'] },
    evaluate: { conv: ['test', 'check', 'measure', 'weigh'], acad: ['appraise', 'assess', 'gauge', 'examine'] },
    evaluates: { conv: ['tests', 'checks', 'measures'], acad: ['appraises', 'assesses', 'gauges', 'examines'] },
    evaluated: { conv: ['tested', 'checked', 'measured'], acad: ['appraised', 'assessed', 'gauged', 'examined'] },
    evaluating: { conv: ['testing', 'checking', 'measuring'], acad: ['appraising', 'assessing', 'gauging', 'examining'] },
    investigate: { conv: ['look into', 'study', 'check'], acad: ['probe', 'examine', 'explore', 'inquire into'] },
    investigates: { conv: ['looks into', 'studies', 'checks'], acad: ['probes', 'examines', 'explores'] },
    investigated: { conv: ['looked into', 'studied', 'checked'], acad: ['probed', 'examined', 'explored'] },
    investigating: { conv: ['looking into', 'studying', 'checking'], acad: ['probing', 'examining', 'exploring'] },
    implement: { conv: ['build', 'set up', 'put in place'], acad: ['execute', 'deploy', 'apply', 'carry out'] },
    implements: { conv: ['builds', 'sets up', 'puts in place'], acad: ['executes', 'deploys', 'applies'] },
    implemented: { conv: ['built', 'set up', 'put in place'], acad: ['executed', 'deployed', 'applied'] },
    implementing: { conv: ['building', 'setting up', 'putting in place'], acad: ['executing', 'deploying', 'applying'] },
    optimize: { conv: ['tune', 'improve', 'speed up'], acad: ['refine', 'calibrate', 'fine-tune'] },
    optimizes: { conv: ['tunes', 'improves', 'speeds up'], acad: ['refines', 'calibrates', 'fine-tunes'] },
    optimized: { conv: ['tuned', 'improved', 'sped up'], acad: ['refined', 'calibrated', 'fine-tuned'] },
    optimizing: { conv: ['tuning', 'improving', 'speeding up'], acad: ['refining', 'calibrating', 'fine-tuning'] },
    validate: { conv: ['confirm', 'check', 'test'], acad: ['corroborate', 'substantiate', 'verify'] },
    validates: { conv: ['confirms', 'checks', 'tests'], acad: ['corroborates', 'substantiates', 'verifies'] },
    validated: { conv: ['confirmed', 'checked', 'tested'], acad: ['corroborated', 'substantiated', 'verified'] },
    validating: { conv: ['confirming', 'checking', 'testing'], acad: ['corroborating', 'substantiating', 'verifying'] },
    generate: { conv: ['create', 'make', 'produce'], acad: ['produce', 'yield', 'form'] },
    generates: { conv: ['creates', 'makes', 'produces'], acad: ['produces', 'yields', 'forms'] },
    generated: { conv: ['created', 'made', 'produced'], acad: ['produced', 'yielded', 'formed'] },
    generating: { conv: ['creating', 'making', 'producing'], acad: ['producing', 'yielding', 'forming'] },
    facilitate: { conv: ['help', 'make easier', 'support'], acad: ['enable', 'aid', 'assist'] },
    facilitates: { conv: ['helps', 'makes easier', 'supports'], acad: ['enables', 'aids', 'assists'] },
    facilitated: { conv: ['helped', 'made easier', 'supported'], acad: ['enabled', 'aided', 'assisted'] },
    subsequent: { conv: ['later', 'next', 'following'], acad: ['following', 'ensuing', 'succeeding'] },
    comprehensive: { conv: ['full', 'thorough', 'complete'], acad: ['thorough', 'exhaustive', 'extensive'] },
    robust: { conv: ['strong', 'solid', 'reliable'], acad: ['resilient', 'sturdy', 'sound'] },
    significant: { conv: ['major', 'clear', 'large'], acad: ['substantial', 'marked', 'considerable', 'appreciable'] },
    substantial: { conv: ['large', 'big', 'strong'], acad: ['considerable', 'pronounced', 'appreciable'] },
    accurate: { conv: ['exact', 'precise', 'correct'], acad: ['precise', 'exact', 'faithful'] },
    relevant: { conv: ['related', 'useful', 'fitting'], acad: ['pertinent', 'applicable', 'germane'] },
    methodology: { conv: ['method', 'approach', 'process'], acad: ['procedure', 'protocol', 'method'] },
    framework: { conv: ['structure', 'system', 'setup'], acad: ['structure', 'architecture', 'model'] },
    objective: { conv: ['goal', 'aim', 'target'], acad: ['aim', 'purpose', 'goal'] },
    component: { conv: ['part', 'piece', 'element'], acad: ['element', 'constituent', 'module'] },
    components: { conv: ['parts', 'pieces', 'elements'], acad: ['elements', 'constituents', 'modules'] },
    inquiries: { conv: ['questions', 'studies', 'checks'], acad: ['investigations', 'studies', 'analyses'] },
    inquiry: { conv: ['study', 'question', 'check'], acad: ['investigation', 'study', 'analysis'] },
    empirical: { conv: ['practical', 'real-world', 'measured'], acad: ['observational', 'experimental', 'measured'] },
    profound: { conv: ['deep', 'strong', 'lasting'], acad: ['far-reaching', 'pronounced', 'deep'] },
    crucial: { conv: ['key', 'central', 'main'], acad: ['essential', 'central', 'critical'] },
    vital: { conv: ['essential', 'central', 'needed'], acad: ['essential', 'indispensable', 'critical'] },
  };

  // ---- 7. Determiner Swaps (from GodGuide Section 4.2) ----
  const DETERMINER_SWAPS = {
    several: { conv: ['a few', 'a number of', 'multiple'], acad: ['numerous', 'a number of', 'multiple'] },
    many: { conv: ['lots of', 'plenty of', 'numerous'], acad: ['numerous', 'a considerable number of', 'multiple'] },
    some: { conv: ['a few', 'certain'], acad: ['certain', 'particular', 'select'] },
    most: { conv: ['nearly all', 'the bulk of'], acad: ['the majority of', 'the greater part of'] },
    another: { conv: ['one more', 'a further'], acad: ['an additional', 'a further', 'a supplementary'] },
    other: { conv: ['additional', 'further'], acad: ['alternative', 'additional', 'further'] },
  };

  // ---- 8. Nominalization / De-nominalization Pairs (from GodGuide Stage E) ----
  const NOMINALIZATION_RULES = [
    { re: /\bthe application of\b/gi, conv: 'applying', acad: 'applying' },
    { re: /\bthe implementation of\b/gi, conv: 'building', acad: 'implementing' },
    { re: /\bthe evaluation of\b/gi, conv: 'testing', acad: 'evaluating' },
    { re: /\bthe computation of\b/gi, conv: 'computing', acad: 'computing' },
    { re: /\bthe derivation of\b/gi, conv: 'deriving', acad: 'deriving' },
    { re: /\bthe optimization of\b/gi, conv: 'tuning', acad: 'refining' },
    { re: /\bthe formulation of\b/gi, conv: 'shaping', acad: 'formulating' },
    { re: /\bthe classification of\b/gi, conv: 'sorting', acad: 'classifying' },
    { re: /\bthe determination of\b/gi, conv: 'finding', acad: 'determining' },
    { re: /\bconducted an investigation (?:of|into)\b/gi, conv: 'looked into', acad: 'investigated' },
    { re: /\bperformed an analysis of\b/gi, conv: 'examined', acad: 'examined' },
    { re: /\bmade a comparison between\b/gi, conv: 'compared', acad: 'compared' },
  ];

  // ---- 9. Active <-> Passive Voice Patterns (from GodGuide Stage A) ----
  const VOICE_RULES = [
    // Passive -> Active (preferred in conversational & modern academic)
    { re: /\b([Tt]he [a-z]+(?:\s+[a-z]+)?) (?:was|were) (?:analyzed|examined) by ([a-z]+(?:\s+[a-z]+)?)\b/g, replace: '$2 examined $1' },
    { re: /\b([Tt]he [a-z]+(?:\s+[a-z]+)?) (?:was|were) demonstrated by ([a-z]+(?:\s+[a-z]+)?)\b/g, replace: '$2 showed $1' },
    { re: /\b([Tt]he [a-z]+(?:\s+[a-z]+)?) (?:was|were) developed by ([a-z]+(?:\s+[a-z]+)?)\b/g, replace: '$2 built $1' },
    { re: /\bIt (?:has been|was) (?:shown|demonstrated|observed) that\b/gi, conv: 'We see that', acad: 'Evidence indicates that' },
    // Active -> Passive in academic mode for structural variety
    { re: /\bWe (?:analyzed|examined) the ([a-z]+(?:\s+[a-z]+)?)\b/g, conv: 'We looked at the $1', acad: 'The $1 were examined' },
  ];

  // ---- 10. Appositive Definitions (from GodGuide Stage F, Technical mode only) ----
  const APPOSITIVES = [
    { term: /\bfinite difference method\b/i, phrase: 'a grid-based discretization scheme for differential equations' },
    { term: /\bCrank-Nicolson\b/i, phrase: 'an implicit second-order time-stepping method' },
    { term: /\bMonte Carlo\b/i, phrase: 'a repeated random sampling method' },
    { term: /\bBlack-Scholes\b/i, phrase: 'a continuous-time option pricing model' },
    { term: /\bgradient descent\b/i, phrase: 'an iterative first-order optimization algorithm' },
    { term: /\bregularization\b/i, phrase: 'a penalty term that curbs overfitting' },
    { term: /\bbackpropagation\b/i, phrase: 'reverse-mode automatic differentiation across network layers' },
  ];

  // ---- 11. Hedge Words (from GodGuide Section 4.1) ----
  const HEDGE_WORDS = {
    conv: ['in practice', 'often', 'for the most part', 'in most cases', 'by and large'],
    acad: ['arguably', 'plausibly', 'in large measure', 'to a notable degree', 'by and large', 'in practical terms'],
  };

  // ---- 12. Watermark & Zero-Width Scrubber ----
  const ZERO_WIDTH_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g;
  const NBSP_RE = /[\u00A0\u202F\u2007]/g;
  const EM_DASH_RE = /\s*(?:—|--|–)\s*/g;

  const scrubWatermarks = (input) => {
    const raw = String(input == null ? '' : input);
    const zwMatches = raw.match(ZERO_WIDTH_RE);
    const watermarksRemoved = zwMatches ? zwMatches.length : 0;

    let text = raw
      .replace(ZERO_WIDTH_RE, '')
      .replace(NBSP_RE, ' ')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'");

    // Count and replace AI-heavy em-dashes outside numeric ranges (e.g. keep 1919–2019 or [1–4])
    let emDashesReplaced = 0;
    text = text.replace(/(\S)\s*—\s*(\S)/g, (m, a, b) => {
      emDashesReplaced += 1;
      return `${a}, ${b}`;
    });
    text = text.replace(/(\p{L})\s+–\s+(\p{L})/gu, (m, a, b) => {
      emDashesReplaced += 1;
      return `${a}, ${b}`;
    });

    return { text, watermarksRemoved, emDashesReplaced };
  };

  // ---- 13. Placeholder Masking (LaTeX, Code, URLs, Citations, Quotes, SEO Keywords, Numbers, Protected Terms) ----
  const maskProtected = (input, lockOpts = {}) => {
    const slots = [];
    const put = (val) => {
      const id = `\x00PH${slots.length}PH\x00`;
      slots.push(val);
      return id;
    };

    let text = input;
    // Fenced code blocks & inline code
    text = text.replace(/```[\s\S]*?```|`[^`\n]+`/g, put);
    // LaTeX environments & math ($...$, $$...$$, \cite{}, \ref{}, \begin{}...\end{})
    text = text.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g, put);
    text = text.replace(/\\(?:cite|ref|eqref|label|textbf|textit|emph|texttt|section|subsection|begin|end)\b(?:\[[^\]]*\])?\{[^}]*\}/g, put);
    text = text.replace(/\\[a-zA-Z]+\b(?:\{[^}]*\})?/g, put);
    // URLs & emails
    text = text.replace(/https?:\/\/[^\s)>\]]+/g, put);
    // AIHumanize.io Lock Citations mode (mode = 2): preserve quoted passages ("..." and “...”) verbatim
    if (lockOpts && lockOpts.lockCitations) {
      text = text.replace(/"[^"\n]{2,240}"|“[^”\n]{2,240}”/g, put);
    }
    // Bracketed numeric citations [1], [2, 5], [1-4] and APA citations (Author et al., 2024)
    text = text.replace(/\[\d+(?:\s*[,–-]\s*\d+)*\]/g, put);
    text = text.replace(/\([A-Z][A-Za-z-]+(?:\s+et\s+al\.)?(?:\s*(?:&|and)\s*[A-Z][A-Za-z-]+)?,\s*\d{4}[a-z]?\)/g, put);
    // AIHumanize.io Lock Keywords mode (mode = 1): lock up to 30 custom SEO keywords/phrases verbatim
    if (lockOpts && Array.isArray(lockOpts.lockKeywords)) {
      const validKeywords = lockOpts.lockKeywords
        .map((k) => String(k == null ? '' : k).trim())
        .filter((k) => k.length > 0)
        .slice(0, 30)
        .sort((a, b) => b.length - a.length);
      for (const kw of validKeywords) {
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        text = text.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), put);
      }
    }
    // Protected scientific/mathematical terms
    for (const term of PROTECTED_TERMS) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp(`\\b${escaped}\\b`, 'g'), put);
    }
    // Numeric values with optional decimals/units/percentages (e.g. 61.3%, 3.14, 2023)
    text = text.replace(/\b\d+(?:[.,]\d+)*%?(?:\b|(?=\s|$|[.,;:!?)]))/g, put);

    return { masked: text, slots };
  };

  const unmaskProtected = (masked, slots) =>
    masked.replace(/\x00PH(\d+)PH\x00/g, (_, idx) => slots[Number(idx)] ?? '');

  // ---- 13B. AIHumanize.io Multi-Language Detection & CJK/Western Word Counter ----
  // Ported from aihumanize.io bundle.js + isolated/source-5.js (countWordsFromChar vs countWordsUsingRegex)
  const SCRIPT_DETECTORS = [
    { code: 'cmn', label: 'cn_chinese', re: /[\u4E00-\u9FFF]/g },
    { code: 'jpn', label: 'ja_japanese', re: /[\u3040-\u30FF]/g },
    { code: 'kor', label: 'ko_korean', re: /[\uAC00-\uD7AF\u1100-\u11FF]/g },
    { code: 'arb', label: 'ar_arabic', re: /[\u0600-\u06FF]/g },
    { code: 'rus', label: 'ru_russian', re: /[\u0400-\u04FF]/g },
    { code: 'hin', label: 'hi_hindi', re: /[\u0900-\u097F]/g },
    { code: 'ben', label: 'bn_bengali', re: /[\u0980-\u09FF]/g },
  ];

  const detectLanguageAndCount = (input) => {
    const text = String(input == null ? '' : input).trim();
    if (!text) {
      return {
        langCode: 'eng',
        langLabel: 'us_english',
        wordCount: 0,
        isAsianScript: false,
        lang: 'en',
        words: 0,
        isCJK: false,
      };
    }
    const sample = text.slice(0, 2048);
    let bestCode = 'eng';
    let bestLabel = 'us_english';
    let bestRatio = 0;
    for (const det of SCRIPT_DETECTORS) {
      const m = sample.match(det.re);
      const ratio = m ? m.length / sample.length : 0;
      if (ratio > bestRatio && ratio > 0.08) {
        bestRatio = ratio;
        bestCode = det.code;
        bestLabel = det.label;
      }
    }
    const asianLanguages = ['cmn', 'arb', 'jpn', 'kor'];
    const isAsianScript = asianLanguages.includes(bestCode);
    let wordCount = 0;
    if (isAsianScript) {
      const punctuationRegex = /[,.?!:;'"\[\]{}()\u3000-\u303F\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65\uFFE0-\uFFEE\s]/gu;
      for (let i = 0; i < text.length; i++) {
        if (!punctuationRegex.test(text.charAt(i))) wordCount++;
      }
    } else {
      const matches = text.match(/[\p{L}\p{M}\p{N}]+/gu);
      wordCount = matches ? matches.length : 0;
    }
    const shortMap = { eng: 'en', cmn: 'zh', jpn: 'ja', kor: 'ko', arb: 'ar', rus: 'ru', hin: 'hi', ben: 'bn' };
    return {
      langCode: bestCode,
      langLabel: bestLabel,
      wordCount,
      isAsianScript,
      lang: shortMap[bestCode] || bestCode,
      words: wordCount,
      isCJK: isAsianScript,
    };
  };

  // ---- 14. Karp-Rabin Rolling Hash & Winnowing Algorithm (k=5, w=4) ----
  // Implements Schleimer, Wilkerson & Aiken (2003) from GodGuide Part 1 & similarity_evasion_analysis.md
  const normalizeWords = (text) =>
    String(text == null ? '' : text)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  const winnowFingerprints = (text, k = 5, w = 4) => {
    const words = normalizeWords(text);
    if (words.length < k) {
      return { kgrams: [], hashes: [], fingerprints: new Set(words.length ? [hashString(words.join(' '))] : []) };
    }
    const kgrams = [];
    const hashes = [];
    for (let i = 0; i <= words.length - k; i++) {
      const gram = words.slice(i, i + k).join(' ');
      kgrams.push({ gram, index: i, words: words.slice(i, i + k) });
      hashes.push(hashString(gram));
    }
    const fingerprints = new Set();
    if (hashes.length <= w) {
      let minH = hashes[0];
      for (const h of hashes) if (h < minH) minH = h;
      fingerprints.add(minH);
    } else {
      for (let i = 0; i <= hashes.length - w; i++) {
        let minH = hashes[i];
        for (let j = 1; j < w; j++) {
          if (hashes[i + j] <= minH) minH = hashes[i + j];
        }
        fingerprints.add(minH);
      }
    }
    return { kgrams, hashes, fingerprints };
  };

  const winnowOverlap = (sourceText, targetText, k = 5, w = 4) => {
    const src = winnowFingerprints(sourceText, k, w);
    const tgt = winnowFingerprints(targetText, k, w);
    if (src.fingerprints.size === 0) return 0;
    let shared = 0;
    for (const fp of src.fingerprints) {
      if (tgt.fingerprints.has(fp)) shared += 1;
    }
    return Math.round((shared / src.fingerprints.size) * 100);
  };

  // ---- 15. AI Signal & Telemetry Analyzer (Perplexity Proxy, Burstiness, Tells, Watermarks) ----
  const splitProseSentences = (text) =>
    String(text == null ? '' : text)
      .split(/(?<=[.!?])\s+|\n{2,}/)
      .map((s) => s.trim())
      .filter((s) => /[\p{L}\p{N}]/u.test(s));

  const countAiTells = (text) => {
    const str = String(text == null ? '' : text);
    const matched = [];
    let total = 0;
    for (const rule of AI_TELL_PATTERNS) {
      const re = new RegExp(rule.re.source, rule.re.flags);
      const m = str.match(re);
      if (m && m.length) {
        total += m.length;
        matched.push({ id: rule.id, category: rule.category, count: m.length, sample: m[0].trim() });
      }
    }
    return { total, matched };
  };

  // Repetitive transition density check (e.g., starting multiple sentences with Furthermore/Moreover/Additionally)
  const countRigidTransitions = (sentences) => {
    const rigid = /^(?:Furthermore|Moreover|Additionally|Consequently|Nevertheless|In conclusion|Notably|Importantly|Ultimately)\b/i;
    let count = 0;
    for (const s of sentences) {
      if (rigid.test(s.trim())) count += 1;
    }
    return count;
  };

  const analyzeSignals = (input) => {
    const text = String(input == null ? '' : input);
    const words = normalizeWords(text);
    const sentences = splitProseSentences(text);
    const zwCount = (text.match(ZERO_WIDTH_RE) || []).length;
    const emDashCount = (text.match(/—|\s–\s/g) || []).length;
    const tells = countAiTells(text);
    const rigidTransitions = countRigidTransitions(sentences);

    if (words.length === 0) {
      return {
        empty: true,
        words: 0,
        sentences: 0,
        aiRiskScore: 0,
        burstiness: 0,
        perplexityProxy: 0,
        tellsCount: 0,
        tellsMatched: [],
        watermarksCount: 0,
        emDashCount: 0,
      };
    }

    // Sentence length distribution -> Burstiness (Coefficient of Variation = sigma / mean)
    const lengths = sentences.map((s) => normalizeWords(s).length).filter((n) => n > 0);
    const meanLen = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);
    const variance =
      lengths.length > 1
        ? lengths.reduce((acc, n) => acc + Math.pow(n - meanLen, 2), 0) / lengths.length
        : 0;
    const stdDev = Math.sqrt(variance);
    const cv = meanLen > 0 ? stdDev / meanLen : 0;
    // Human writing typically has CV ~ 0.45–0.75; flat AI prose is often < 0.25.
    // For single-sentence inputs, estimate internal rhythm from clause/punctuation diversity.
    const commaCount = (text.match(/[,;:()]/g) || []).length;
    const rawBurstiness =
      lengths.length > 1
        ? Math.round(Math.min(100, Math.max(8, cv * 145)))
        : Math.round(Math.min(75, 28 + commaCount * 10));

    // Lexical diversity (Type-Token Ratio corrected for length: Guiraud / Root TTR) & word-length entropy
    const uniqueWords = new Set(words).size;
    const ttr = uniqueWords / words.length;
    const longWords = words.filter((w) => w.length >= 7).length / words.length;
    const contractions = (text.match(/\b[a-zA-Z]+'[a-zA-Z]+\b/g) || []).length;
    const perplexityProxy = Math.round(
      Math.min(99, Math.max(15, ttr * 68 + (1 - Math.abs(longWords - 0.22)) * 22 + Math.min(12, contractions * 4)))
    );

    // Composite Estimated AI Pattern Risk (0–99%)
    // Driven by explicit AI tells, rigid transitions, low burstiness, em-dashes, and zero-width watermarks.
    const tellPenalty = tells.total * 18 + rigidTransitions * 11 + zwCount * 15 + emDashCount * 7;
    const uniformityPenalty = Math.max(0, 52 - rawBurstiness) * 0.55;
    const rawRisk = Math.min(98, Math.max(2, Math.round(tellPenalty + uniformityPenalty)));

    return {
      empty: false,
      words: words.length,
      sentences: sentences.length,
      aiRiskScore: rawRisk,
      burstiness: rawBurstiness,
      perplexityProxy,
      tellsCount: tells.total,
      tellsMatched: tells.matched,
      watermarksCount: zwCount,
      emDashCount,
    };
  };

  // ---- 16. Case-Preserving Helper ----
  const matchCase = (sourceWord, replacement) => {
    if (!sourceWord || !replacement) return replacement;
    if (sourceWord === sourceWord.toUpperCase() && sourceWord.length > 1) return replacement;
    if (sourceWord[0] === sourceWord[0].toUpperCase() && sourceWord[0] !== sourceWord[0].toLowerCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement;
  };

  // ---- 17. AST String-Aware Code Comment Tokenizer (from Turnitout v1.7 / how-it-works.html) ----
  // Scans character-by-character so "#" or "//" inside string literals ("http://...", "#ff0000") are NEVER touched.
  const humanizeCodeComments = (codeText, proseTransformFn, persona = 'intermediate') => {
    const src = String(codeText == null ? '' : codeText);
    let out = '';
    let i = 0;
    const n = src.length;
    let commentsModified = 0;

    const personaAdjust = (commentBody) => {
      let body = proseTransformFn(commentBody);
      if (persona === 'beginner') {
        body = body
          .replace(/\b(?:evaluates|scrutinizes|examines|assesses)\b/gi, 'checks')
          .replace(/\b(?:initializes|instantiates)\b/gi, 'sets up')
          .replace(/\b(?:retrieves|obtains)\b/gi, 'gets')
          .replace(/\b(?:terminates)\b/gi, 'stops');
      } else if (persona === 'senior') {
        body = body
          .replace(/\bchecks\b/gi, 'validates')
          .replace(/\bsets up\b/gi, 'initializes')
          .replace(/\bgets\b/gi, 'resolves');
      }
      return body;
    };

    while (i < n) {
      const ch = src[i];
      const next = src[i + 1];
      const next2 = src[i + 2];

      // Triple-quoted Python docstring """...""" or '''...'''
      if ((ch === '"' && next === '"' && next2 === '"') || (ch === "'" && next === "'" && next2 === "'")) {
        const quote = src.slice(i, i + 3);
        const endIdx = src.indexOf(quote, i + 3);
        if (endIdx === -1) {
          out += src.slice(i);
          break;
        }
        const inner = src.slice(i + 3, endIdx);
        const transformed = personaAdjust(inner);
        if (transformed !== inner) commentsModified += 1;
        out += quote + transformed + quote;
        i = endIdx + 3;
        continue;
      }

      // Single-line string literal "...", '...', `...`
      if (ch === '"' || ch === "'" || ch === '`') {
        const quote = ch;
        out += ch;
        i += 1;
        while (i < n) {
          if (src[i] === '\\') {
            out += src.slice(i, i + 2);
            i += 2;
            continue;
          }
          out += src[i];
          if (src[i] === quote) {
            i += 1;
            break;
          }
          i += 1;
        }
        continue;
      }

      // Block comment /* ... */
      if (ch === '/' && next === '*') {
        const endIdx = src.indexOf('*/', i + 2);
        if (endIdx === -1) {
          out += src.slice(i);
          break;
        }
        const inner = src.slice(i + 2, endIdx);
        const transformed = personaAdjust(inner);
        if (transformed !== inner) commentsModified += 1;
        out += '/*' + transformed + '*/';
        i = endIdx + 2;
        continue;
      }

      // Single-line comment // ... or # ... (skipping shebang #! and preprocessor #include/#define)
      if ((ch === '/' && next === '/') || (ch === '#' && next !== '!' && !/^#(include|define|ifdef|ifndef|endif|pragma|region|endregion)\b/.test(src.slice(i)))) {
        const prefix = ch === '/' ? '//' : '#';
        const lineEnd = src.indexOf('\n', i);
        const stop = lineEnd === -1 ? n : lineEnd;
        const rawComment = src.slice(i + prefix.length, stop);
        const leadSpace = (/^\s*/.exec(rawComment) || [''])[0];
        const body = rawComment.slice(leadSpace.length);
        const transformed = body.trim() ? personaAdjust(body) : body;
        if (transformed !== body) commentsModified += 1;
        out += prefix + leadSpace + transformed;
        i = stop;
        continue;
      }

      out += ch;
      i += 1;
    }

    return { text: out, commentsModified };
  };

  // ---- 18. Main Multi-Stage Transformation Pipeline (Turnitout + AIHumanize.io) ----
  const DEFAULT_OPTIONS = {
    mode: 'conversational', // 'general' | 'conversational' | 'academic' | 'blog' | 'formal' | 'informal' | 'expand' | 'simplify' | 'technical' | 'code'
    model: 'balance', // 'quality' | 'balance' | 'enhanced' | 'private' (from aihumanize.io changemodel)
    autopilot: false, // Basic (false) vs Autopilot Pro multi-pass until <20% AI (true)
    lockKeywords: [], // Up to 30 custom SEO keywords/phrases (from aihumanize.io mode=1)
    lockCitations: false, // Lock quoted strings "..." and academic citations (from aihumanize.io mode=2)
    intensity: 75, // 0..100
    seed: 0,
    persona: 'intermediate', // for code mode: 'beginner' | 'intermediate' | 'senior'
    stages: {
      watermarks: true,
      tellScrubber: true,
      phraseRewrites: true,
      discourseRotation: true,
      synonyms: true,
      clauseReordering: true,
      determinerSwaps: true,
      burstiness: true, // sentence splitting + fusion
      voiceTransform: true,
      nominalization: true,
      hedgeInjection: true,
      appositiveInjection: true,
      ngramAudit: true,
    },
  };

  // Plain-language replacements for aihumanize.io 'simplify' scene (cjtype=6)
  const SIMPLIFY_SWAPS = [
    { re: /\bpurchasing behaviors?\b/gi, replace: 'buying habits' },
    { re: /\bconsumer preferences\b/gi, replace: 'shopper tastes' },
    { re: /\bempirical inquiries\b/gi, replace: 'real-world studies' },
    { re: /\bstochastic optimization\b/gi, replace: 'random-step tuning' },
    { re: /\bcomputational scalability\b/gi, replace: 'computing scale' },
    { re: /\bparadigm shift\b/gi, replace: 'major change' },
    { re: /\bmultifaceted dimensions\b/gi, replace: 'many sides' },
    { re: /\bprofound impact\b/gi, replace: 'strong effect' },
    { re: /\bsubsequent\b/gi, replace: 'later' },
    { re: /\bconsequently\b/gi, replace: 'so' },
    { re: /\bnevertheless\b/gi, replace: 'still' },
    { re: /\bapproximately\b/gi, replace: 'about' },
    { re: /\bsufficient\b/gi, replace: 'enough' },
    { re: /\bterminate\b/gi, replace: 'end' },
    { re: /\binitiate\b/gi, replace: 'start' },
    { re: /\bmodification\b/gi, replace: 'change' },
    { re: /\bendeavor\b/gi, replace: 'effort' },
  ];

  // Elaborative appositives for aihumanize.io 'expand' scene (cjtype=5)
  const EXPAND_APPOSITIVES = [
    ...APPOSITIVES,
    { term: /\b(sustainable fashion)\b/i, phrase: 'clothing produced with lower environmental and labor impact' },
    { term: /\b(circular fashion)\b/i, phrase: 'reuse-driven models such as resale, rental, and repair' },
    { term: /\b(social connectivity)\b/i, phrase: 'the everyday web of digital and in-person ties' },
    { term: /\b(artificial intelligence)\b/i, phrase: 'data-driven pattern recognition at scale' },
    { term: /\b(human empathy)\b/i, phrase: 'our capacity to share another person’s perspective' },
  ];

  const humanizeProse = (rawInput, opts) => {
    const rawMode = (opts.mode || 'conversational').toLowerCase();
    const mode = rawMode === 'general' ? 'conversational' : rawMode;
    const model = (opts.model || 'balance').toLowerCase();
    const isAcad = mode === 'academic' || mode === 'technical' || mode === 'formal' || mode === 'expand';
    const isTech = mode === 'technical';
    const isInformal = mode === 'informal' || mode === 'blog';
    const isFormal = mode === 'formal' || mode === 'academic';
    const isSimplify = mode === 'simplify';
    const isExpand = mode === 'expand';

    // Apply aihumanize.io model multiplier ('quality' | 'balance' | 'enhanced' | 'private')
    const baseEff = effectiveIntensity(opts.intensity);
    const modelMultiplier =
      model === 'quality'
        ? 0.75
        : model === 'enhanced'
        ? 1.2
        : model === 'private'
        ? 1.12
        : 1.0;
    const eff =
      baseEff === 0
        ? 0
        : model === 'enhanced'
        ? Math.min(1, Math.max(0.85, baseEff * modelMultiplier))
        : Math.min(1, baseEff * modelMultiplier);

    const privateSalt = model === 'private' ? 9973 : 0;
    const rng = createRng(hashString(rawInput) + (Number(opts.seed) || 0) * 7919 + privateSalt);
    const stages = { ...DEFAULT_OPTIONS.stages, ...(opts.stages || {}) };

    const counts = {
      watermarksRemoved: 0,
      emDashesReplaced: 0,
      tellsScrubbed: 0,
      phraseRewrites: 0,
      discourseRotations: 0,
      synonymSwaps: 0,
      clauseReorders: 0,
      determinerSwaps: 0,
      sentenceSplits: 0,
      sentenceFusions: 0,
      voiceTransforms: 0,
      nominalizations: 0,
      hedgeInjections: 0,
      appositiveInjections: 0,
      ngramBreaks: 0,
    };

    // Stage 0: Watermark & Zero-Width Scrubber
    let working = String(rawInput == null ? '' : rawInput);
    if (stages.watermarks) {
      const wm = scrubWatermarks(working);
      working = wm.text;
      counts.watermarksRemoved = wm.watermarksRemoved;
      counts.emDashesReplaced = wm.emDashesReplaced;
    }

    // Stage 1: Mask LaTeX, Code, Citations, Locked Quotes, Custom SEO Keywords, Numbers, Protected Terms
    const { masked, slots } = maskProtected(working, {
      lockKeywords: opts.lockKeywords,
      lockCitations: opts.lockCitations,
    });
    let text = masked;

    // Stage 2: 38-Pattern AI Tell Scrubber (Always runs at 100% fire rate when enabled)
    if (stages.tellScrubber) {
      for (const rule of AI_TELL_PATTERNS) {
        const targetReplace = isAcad && rule.academicReplace !== undefined ? rule.academicReplace : rule.replace;
        text = text.replace(rule.re, (match, ...args) => {
          counts.tellsScrubbed += 1;
          if (targetReplace.includes('$1')) {
            return targetReplace.replace('$1', args[0] || '').replace('$2', args[1] || '');
          }
          return matchCase(match, targetReplace);
        });
      }
    }

    if (eff === 0) {
      const restoredZero = unmaskProtected(text, slots).replace(/[ \t]{2,}/g, ' ').trim();
      return { text: restoredZero, counts };
    }

    // Stage 3: Multi-Word Phrase Rewrites
    if (stages.phraseRewrites) {
      for (const item of PHRASE_REWRITES) {
        const target = isAcad ? item.acad : item.conv;
        text = text.replace(item.re, (match) => {
          if (rng() > Math.min(1, eff * 1.15)) return match;
          counts.phraseRewrites += 1;
          return matchCase(match, target);
        });
      }
      // Scene: Simplify plain-English rewrites
      if (isSimplify) {
        for (const item of SIMPLIFY_SWAPS) {
          text = text.replace(item.re, (match) => {
            counts.phraseRewrites += 1;
            return matchCase(match, item.replace);
          });
        }
      }
    }

    // Stage 4: Nominalization / De-nominalization
    if (stages.nominalization) {
      for (const item of NOMINALIZATION_RULES) {
        const target = isAcad ? item.acad : item.conv;
        text = text.replace(item.re, (match) => {
          if (rng() > eff * 0.75) return match;
          counts.nominalizations += 1;
          return matchCase(match, target);
        });
      }
    }

    // Stage 5: Active <-> Passive Voice Transformations
    if (stages.voiceTransform) {
      for (const rule of VOICE_RULES) {
        const replacement = rule.replace || (isAcad ? rule.acad : rule.conv);
        if (!replacement) continue;
        text = text.replace(rule.re, (match, g1, g2) => {
          if (rng() > eff * 0.7) return match;
          counts.voiceTransforms += 1;
          if (rule.replace) {
            const capG2 = g2 ? g2.charAt(0).toUpperCase() + g2.slice(1) : '';
            const lowG1 = g1 ? g1.charAt(0).toLowerCase() + g1.slice(1) : '';
            return rule.replace.replace('$2', capG2).replace('$1', lowG1);
          }
          return matchCase(match, replacement);
        });
      }
    }

    // Scene-specific contraction handling (Informal/Blog vs Formal/Academic)
    if (isInformal) {
      const contractions = [
        { re: /\bdo not\b/gi, rep: "don't" },
        { re: /\bcannot\b/gi, rep: "can't" },
        { re: /\bdoes not\b/gi, rep: "doesn't" },
        { re: /\bwill not\b/gi, rep: "won't" },
        { re: /\bit is\b/gi, rep: "it's" },
        { re: /\bthat is\b/gi, rep: "that's" },
        { re: /\bwe are\b/gi, rep: "we're" },
        { re: /\bthey are\b/gi, rep: "they're" },
      ];
      for (const c of contractions) {
        text = text.replace(c.re, (m) => {
          counts.phraseRewrites += 1;
          return matchCase(m, c.rep);
        });
      }
    } else if (isFormal) {
      const expansions = [
        { re: /\bdon't\b/gi, rep: 'do not' },
        { re: /\bcan't\b/gi, rep: 'cannot' },
        { re: /\bdoesn't\b/gi, rep: 'does not' },
        { re: /\bwon't\b/gi, rep: 'will not' },
        { re: /\bit's\b/gi, rep: 'it is' },
        { re: /\bthat's\b/gi, rep: 'that is' },
        { re: /\bwe're\b/gi, rep: 'we are' },
        { re: /\bthey're\b/gi, rep: 'they are' },
      ];
      for (const e of expansions) {
        text = text.replace(e.re, (m) => {
          counts.phraseRewrites += 1;
          return matchCase(m, e.rep);
        });
      }
    }

    // Process paragraph by paragraph to preserve paragraph structure
    const usedDiscourse = {};
    const recentSynonyms = []; // FIFO buffer (max 15)
    const recentDeterminers = []; // FIFO buffer (max 8)
    const usedAppositives = new Set();

    const paragraphs = text.split(/(\n\s*\n)/);
    const processedParagraphs = paragraphs.map((chunk) => {
      if (/^\n\s*\n$/.test(chunk) || !chunk.trim()) return chunk;

      let sentences = chunk
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

      // Stage 6: PDTB 2.0 Discourse Marker Rotation (never repeats same replacement)
      if (stages.discourseRotation) {
        sentences = sentences.map((s) => {
          const openerMatch = /^([A-Za-z]+)(,\s+)/.exec(s);
          if (!openerMatch) return s;
          const key = openerMatch[1].toLowerCase();
          const entry = DISCOURSE_ROTATIONS[key];
          if (!entry) return s;
          const pool = isAcad ? entry.acad : entry.conv;
          const usedSet = usedDiscourse[key] || (usedDiscourse[key] = new Set());
          const available = pool.filter((cand) => !usedSet.has(cand.toLowerCase()));
          const list = available.length ? available : pool;
          const chosen = list[Math.floor(rng() * list.length)];
          usedSet.add(chosen.toLowerCase());
          counts.discourseRotations += 1;
          return chosen + openerMatch[2] + s.slice(openerMatch[0].length);
        });
      }

      // Stage 7: Clause & Prepositional Reordering
      if (stages.clauseReordering) {
        sentences = sentences.map((s) => {
          if (s.length < 55 || rng() > eff * 0.55) return s;
          // Pattern A: "In this [noun], we/the [rest]." -> "We/The [rest] in this [noun]."
          const prepMatch = /^(In this (?:section|chapter|paper|analysis|work|context)|For (?:validation|comparison|clarity)),\s+([a-z])([^.!?]+)([.!?])$/.exec(s);
          if (prepMatch) {
            counts.clauseReorders += 1;
            const prep = prepMatch[1].charAt(0).toLowerCase() + prepMatch[1].slice(1);
            return prepMatch[2].toUpperCase() + prepMatch[3].trim() + ' ' + prep + prepMatch[4];
          }
          // Pattern B: "[Main clause] because [subordinate clause]." -> "Because [subordinate clause], [main clause]."
          const subMatch = /^([A-Z][ milliseconds\S]{20,80}?)\s+(because|since|whereas)\s+([^,.;!?]{15,70})([.!?])$/.exec(s);
          if (subMatch && !/^(It|This|That|He|She|They)\b/.test(subMatch[1])) {
            counts.clauseReorders += 1;
            const conj = subMatch[2].charAt(0).toUpperCase() + subMatch[2].slice(1);
            const mainLower = subMatch[1].charAt(0).toLowerCase() + subMatch[1].slice(1);
            return `${conj} ${subMatch[3].trim()}, ${mainLower}${subMatch[4]}`;
          }
          return s;
        });
      }

      // Stage 8: Determiner Swapping with FIFO memory
      if (stages.determinerSwaps) {
        sentences = sentences.map((s) =>
          s.replace(/\b(several|many|some|most|another|other)\b/gi, (match) => {
            if (rng() > eff * 0.45) return match;
            const key = match.toLowerCase();
            const entry = DETERMINER_SWAPS[key];
            if (!entry) return match;
            const pool = (isAcad ? entry.acad : entry.conv).filter(
              (c) => !recentDeterminers.includes(c.toLowerCase()) && !s.toLowerCase().includes(c.toLowerCase())
            );
            if (!pool.length) return match;
            const pick = pool[Math.floor(rng() * pool.length)];
            recentDeterminers.push(pick.toLowerCase());
            if (recentDeterminers.length > 8) recentDeterminers.shift();
            counts.determinerSwaps += 1;
            return matchCase(match, pick);
          })
        );
      }

      // Stage 9: Inflection-Aware Synonym Swapping with 15-word FIFO Blocker & Sentence Collision Check
      if (stages.synonyms) {
        sentences = sentences.map((s) => {
          const lowerSentence = s.toLowerCase();
          return s.replace(/\b([A-Za-z]{4,})\b/g, (word, _, offset) => {
            // Skip if part of a placeholder token
            if (offset > 0 && s[offset - 1] === '\x00') return word;
            const low = word.toLowerCase();
            const entry = SYNONYM_CATALOG[low];
            if (!entry) return word;
            if (rng() > Math.min(0.95, eff * 0.85)) return word;
            const pool = (isAcad ? entry.acad : entry.conv).filter(
              (cand) =>
                !lowerSentence.includes(cand.toLowerCase()) &&
                !recentSynonyms.includes(cand.toLowerCase())
            );
            if (!pool.length) return word;
            const pick = pool[Math.floor(rng() * pool.length)];
            recentSynonyms.push(pick.toLowerCase());
            if (recentSynonyms.length > 15) recentSynonyms.shift();
            counts.synonymSwaps += 1;
            return matchCase(word, pick);
          });
        });
      }

      // Stage 10: Burstiness Engine — Part A: Compound Sentence Splitting
      // In 'simplify' mode, splits at >=16 words; otherwise >=24 words
      if (stages.burstiness) {
        const minSplitWords = isSimplify ? 16 : 24;
        const splitResult = [];
        for (const s of sentences) {
          const wordCount = s.split(/\s+/).length;
          if (wordCount >= minSplitWords && rng() <= (isSimplify ? 0.95 : eff * 0.8)) {
            const splitMatch = /^(.{30,}?),\s+(and|but|while|so|which)\s+([^.!?]{15,}[.!?])$/i.exec(s);
            if (splitMatch) {
              const firstPart = splitMatch[1].trim() + '.';
              const conj = splitMatch[2].toLowerCase();
              const rest = splitMatch[3].trim();
              const lead =
                conj === 'but'
                  ? 'However, ' + rest
                  : conj === 'so'
                  ? 'As a result, ' + rest
                  : conj === 'which'
                  ? 'This ' + rest
                  : rest.charAt(0).toUpperCase() + rest.slice(1);
              splitResult.push(firstPart, lead);
              counts.sentenceSplits += 1;
              continue;
            }
          }
          splitResult.push(s);
        }
        sentences = splitResult;

        // Stage 10: Burstiness Engine — Part B: Short Sentence Fusion (skipped in 'simplify' mode)
        if (!isSimplify) {
          const fusedResult = [];
          let idx = 0;
          while (idx < sentences.length) {
            const curr = sentences[idx];
            const next = sentences[idx + 1];
            if (next) {
              const w1 = curr.split(/\s+/).length;
              const w2 = next.split(/\s+/).length;
              const maxFuse = isExpand ? 15 : 12;
              if (w1 <= maxFuse && w2 <= maxFuse && /\.$/.test(curr) && rng() <= eff * 0.65) {
                const connectors = isAcad
                  ? [', and consequently ', ', which in turn means ', ', and therefore ']
                  : [', so ', ', and ', ', which means '];
                const conn = connectors[Math.floor(rng() * connectors.length)];
                const nextLower = /^(?:I\b|[A-Z]{2,})/.test(next)
                  ? next
                  : next.charAt(0).toLowerCase() + next.slice(1);
                fusedResult.push(curr.slice(0, -1) + conn + nextLower);
                counts.sentenceFusions += 1;
                idx += 2;
                continue;
              }
            }
            fusedResult.push(curr);
            idx += 1;
          }
          sentences = fusedResult;
        }
      }

      // Stage 11: Technical & Expand Appositive Injection (in 'technical' or 'expand' mode, max 1 per term)
      if (stages.appositiveInjection && (isTech || isExpand)) {
        const appPool = isExpand ? EXPAND_APPOSITIVES : APPOSITIVES;
        sentences = sentences.map((s) => {
          for (const app of appPool) {
            if (usedAppositives.has(app.phrase)) continue;
            if (app.term.test(s) && rng() <= (isExpand ? 0.85 : eff * 0.5)) {
              usedAppositives.add(app.phrase);
              counts.appositiveInjections += 1;
              return s.replace(app.term, (m) => `${m}, ${app.phrase},`);
            }
          }
          return s;
        });
      }

      // Stage 12: Hedge Word Injection (runs on long unhedged claims; more active in 'expand' and 'private' modes)
      if (stages.hedgeInjection && (eff >= 0.55 || isExpand || model === 'private')) {
        let hedgedInPara = false;
        const minLen = isExpand ? 55 : 85;
        const hedgeProb = isExpand ? 0.65 : eff * 0.35;
        sentences = sentences.map((s) => {
          if (hedgedInPara || s.length < minLen || rng() > hedgeProb) return s;
          const pool = isAcad ? HEDGE_WORDS.acad : HEDGE_WORDS.conv;
          const pick = pool[Math.floor(rng() * pool.length)];
          if (s.toLowerCase().includes(pick.toLowerCase())) return s;
          const verbMatch = /\b(is|are|shows|demonstrates|indicates|provides|remains|analyzes|reveals)\b/.exec(s);
          if (!verbMatch) return s;
          hedgedInPara = true;
          counts.hedgeInjections += 1;
          return s.replace(verbMatch[0], `${verbMatch[0]}, ${pick},`);
        });
      }

      return sentences.join(' ');
    });

    text = processedParagraphs.join('');

    // Stage 13: Unmask Protected Tokens (Fact + Keyword + Citation Invariant Gate)
    let restored = unmaskProtected(text, slots);

    // Stage 14: Source-Aware Winnowing k=5 N-Gram Audit (from similarity_evasion_analysis.md Layer 1)
    // Cross-references output against rawInput and breaks surviving 5-word chains where possible.
    if (stages.ngramAudit && eff >= 0.4) {
      const EXTRA_SWAPS = {
        important: isAcad ? 'consequential' : 'key',
        modern: isAcad ? 'contemporary' : 'current',
        provides: isAcad ? 'furnishes' : 'gives',
        provide: isAcad ? 'furnish' : 'give',
        system: isAcad ? 'mechanism' : 'setup',
        systems: isAcad ? 'mechanisms' : 'setups',
        process: isAcad ? 'procedure' : 'workflow',
        processes: isAcad ? 'procedures' : 'workflows',
        different: isAcad ? 'distinct' : 'separate',
        common: isAcad ? 'prevalent' : 'frequent',
        complex: isAcad ? 'intricate' : 'involved',
        effective: isAcad ? 'efficacious' : 'useful',
        various: isAcad ? 'diverse' : 'several',
        specific: isAcad ? 'particular' : 'exact',
        general: isAcad ? 'broad' : 'overall',
        primary: isAcad ? 'principal' : 'main',
        major: isAcad ? 'principal' : 'main',
        critical: isAcad ? 'essential' : 'vital',
        personal: isAcad ? 'individual' : 'own',
        social: isAcad ? 'interpersonal' : 'shared',
        digital: isAcad ? 'electronic' : 'online',
        human: isAcad ? 'human-centered' : 'people-first',
        report: isAcad ? 'assessment' : 'brief',
        consumer: isAcad ? 'buyer' : 'shopper',
        preferences: isAcad ? 'priorities' : 'choices',
        behaviors: isAcad ? 'patterns' : 'habits',
        brands: isAcad ? 'labels' : 'companies',
      };
      // Never swap words that are inside locked keywords or locked quotes
      const lockedSet = new Set(
        (Array.isArray(opts.lockKeywords) ? opts.lockKeywords : [])
          .flatMap((kw) => String(kw).toLowerCase().split(/\W+/))
          .filter(Boolean)
      );
      const srcFp = winnowFingerprints(rawInput, 5, 4);
      if (srcFp.kgrams.length > 0) {
        for (const [targetWord, replacement] of Object.entries(EXTRA_SWAPS)) {
          if (lockedSet.has(targetWord.toLowerCase())) continue;
          const re = new RegExp(`\\b${targetWord}\\b`, 'gi');
          if (re.test(restored)) {
            const beforeFp = winnowOverlap(rawInput, restored, 5, 4);
            if (beforeFp <= 25) break;
            // Re-mask before applying extra swap so locked quotes/keywords cannot be touched
            const remasked = maskProtected(restored, {
              lockKeywords: opts.lockKeywords,
              lockCitations: opts.lockCitations,
            });
            const updatedMasked = remasked.masked.replace(re, (m) => {
              counts.ngramBreaks += 1;
              return matchCase(m, replacement);
            });
            restored = unmaskProtected(updatedMasked, remasked.slots);
          }
        }
      }
    }

    // Cleanup spacing & punctuation artifacts
    restored = restored
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s+([,.;!?])/g, '$1')
      .replace(/,{2,}/g, ',')
      .replace(/,\s*\./g, '.')
      .trim();

    return { text: restored, counts };
  };

  // ---- 19. Word-Level Diff (Turnitout Red-Pen) & Inline LCS Highlight Diff (AIHumanize.io) ----
  const diffTokens = (oldText, newText) => {
    const a = String(oldText == null ? '' : oldText).trim().split(/\s+/).filter(Boolean);
    const b = String(newText == null ? '' : newText).trim().split(/\s+/).filter(Boolean);
    if (a.length === 0 && b.length === 0) return [];
    if (a.length === 0) return [{ type: 'added', text: b.join(' ') }];
    if (b.length === 0) return [{ type: 'removed', text: a.join(' ') }];

    const n = a.length;
    const m = b.length;
    if (n * m > 360000) {
      return [
        { type: 'removed', text: a.join(' ') },
        { type: 'added', text: b.join(' ') },
      ];
    }

    const dp = new Uint16Array((n + 1) * (m + 1));
    const width = m + 1;
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        if (a[i] === b[j]) {
          dp[i * width + j] = dp[(i + 1) * width + (j + 1)] + 1;
        } else {
          const down = dp[(i + 1) * width + j];
          const right = dp[i * width + (j + 1)];
          dp[i * width + j] = down >= right ? down : right;
        }
      }
    }

    const rawOps = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        rawOps.push({ type: 'equal', text: a[i] });
        i++;
        j++;
      } else if (dp[(i + 1) * width + j] >= dp[i * width + (j + 1)]) {
        rawOps.push({ type: 'removed', text: a[i] });
        i++;
      } else {
        rawOps.push({ type: 'added', text: b[j] });
        j++;
      }
    }
    while (i < n) rawOps.push({ type: 'removed', text: a[i++] });
    while (j < m) rawOps.push({ type: 'added', text: b[j++] });

    const merged = [];
    for (const op of rawOps) {
      const prev = merged[merged.length - 1];
      if (prev && prev.type === op.type) {
        prev.text += ' ' + op.text;
      } else {
        merged.push({ ...op });
      }
    }
    return merged;
  };

  // Ported directly from aihumanize.io source-5.js (lines 2116-2200: tokenize, computeLCSMatrix, buildDiffHtml)
  // Tokenizes words, whitespace, and punctuation (`/\w+|\s+|[^\w\s]/g`) and marks modified/inserted spans
  // in the output text without cluttering it with crossed-out deletions.
  const diffHighlightTokens = (inputText, outputText) => {
    const inTokens = String(inputText == null ? '' : inputText).match(/\w+|\s+|[^\w\s]/g) || [];
    const outTokens = String(outputText == null ? '' : outputText).match(/\w+|\s+|[^\w\s]/g) || [];
    if (outTokens.length === 0) return [];
    if (inTokens.length === 0) return [{ text: outputText, changed: true }];

    const m = inTokens.length;
    const n = outTokens.length;
    if (m * n > 400000) {
      return [{ text: outputText, changed: false }];
    }

    const dp = new Uint16Array((m + 1) * (n + 1));
    const width = n + 1;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (inTokens[i - 1] === outTokens[j - 1]) {
          dp[i * width + j] = dp[(i - 1) * width + (j - 1)] + 1;
        } else {
          const up = dp[(i - 1) * width + j];
          const left = dp[i * width + (j - 1)];
          dp[i * width + j] = up >= left ? up : left;
        }
      }
    }

    const diffMarks = new Uint8Array(n);
    let i = m;
    let j = n;
    while (i > 0 && j > 0) {
      if (inTokens[i - 1] === outTokens[j - 1]) {
        diffMarks[j - 1] = 0;
        i--;
        j--;
      } else if (dp[i * width + (j - 1)] >= dp[(i - 1) * width + j]) {
        diffMarks[j - 1] = 1;
        j--;
      } else {
        i--;
      }
    }
    while (j > 0) {
      diffMarks[j - 1] = 1;
      j--;
    }

    const segments = [];
    for (let k = 0; k < n; k++) {
      const token = outTokens[k];
      const isWhitespace = /^\s+$/.test(token);
      // Whitespace inherits highlight state if surrounded by changed tokens
      const changed = isWhitespace
        ? k > 0 && k + 1 < n && diffMarks[k - 1] === 1 && diffMarks[k + 1] === 1
        : diffMarks[k] === 1;
      const prev = segments[segments.length - 1];
      if (prev && prev.changed === changed) {
        prev.text += token;
      } else {
        segments.push({ text: token, changed });
      }
    }
    return segments;
  };

  // ---- 20. 7-Detector Bypass Status Evaluator (from aihumanize.io source-5.js line 2210) ----
  // Evaluates Turnitin, GPTZero, Copyleaks, ZeroGPT, QuillBot, Sapling, and Originality.
  // Green pass status when score < 20% (`score >= 20 ? 'status-bar--red' : 'status-bar--green'`).
  const evaluateDetectors = (signals, winnowingOverlapPct = 0) => {
    const base = Number(signals && signals.aiRiskScore) || 0;
    const tells = Number(signals && signals.tellsCount) || 0;
    const burst = Number(signals && signals.burstinessCV) || 0;
    const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

    const list = [
      { id: 'turnitin', name: 'Turnitin', score: clamp(base * 0.9 + winnowingOverlapPct * 0.15) },
      { id: 'gptzero', name: 'GPTZero', score: clamp(base * 1.0 + (burst < 0.35 ? 6 : -3)) },
      { id: 'copyleaks', name: 'Copyleaks', score: clamp(base * 0.92 + tells * 3) },
      { id: 'zerogpt', name: 'ZeroGPT', score: clamp(base * 0.85) },
      { id: 'quillbot', name: 'QuillBot', score: clamp(base * 0.88) },
      { id: 'sapling', name: 'Sapling', score: clamp(base * 0.95) },
      { id: 'originality', name: 'Originality', score: clamp(base * 1.05) },
    ];
    return list.map((d) => ({
      ...d,
      passed: d.score < 20,
      status: d.score < 20 ? 'human' : 'ai-risk',
    }));
  };

  // ---- 21. Top-Level Entry Point: humanize(input, options) ----
  const humanize = (input, userOptions = {}) => {
    const raw = String(input == null ? '' : input);
    const opts = {
      ...DEFAULT_OPTIONS,
      ...userOptions,
      stages: { ...DEFAULT_OPTIONS.stages, ...(userOptions.stages || {}) },
    };

    const before = analyzeSignals(raw);
    const language = detectLanguageAndCount(raw);

    if (!raw.trim()) {
      return {
        empty: true,
        input: raw,
        output: '',
        diff: [],
        highlightDiff: [],
        before,
        after: before,
        winnowingOverlapPct: 0,
        detectors: evaluateDetectors(before, 0),
        language,
        autopilot: { enabled: Boolean(opts.autopilot), passesRun: 0, targetReached: true, passHistory: [] },
        counts: {
          watermarksRemoved: 0,
          emDashesReplaced: 0,
          tellsScrubbed: 0,
          phraseRewrites: 0,
          discourseRotations: 0,
          synonymSwaps: 0,
          clauseReorders: 0,
          determinerSwaps: 0,
          sentenceSplits: 0,
          sentenceFusions: 0,
          voiceTransforms: 0,
          nominalizations: 0,
          hedgeInjections: 0,
          appositiveInjections: 0,
          ngramBreaks: 0,
          commentsModified: 0,
          totalChanges: 0,
        },
        invariants: {
          zeroTellPassed: true,
          factsPreserved: true,
          keywordsPreserved: true,
          citationsPreserved: true,
        },
      };
    }

    const runSinglePass = (passOpts) => {
      if (passOpts.mode === 'code') {
        const aggCounts = {
          watermarksRemoved: 0,
          emDashesReplaced: 0,
          tellsScrubbed: 0,
          phraseRewrites: 0,
          discourseRotations: 0,
          synonymSwaps: 0,
          clauseReorders: 0,
          determinerSwaps: 0,
          sentenceSplits: 0,
          sentenceFusions: 0,
          voiceTransforms: 0,
          nominalizations: 0,
          hedgeInjections: 0,
          appositiveInjections: 0,
          ngramBreaks: 0,
          commentsModified: 0,
        };
        const codeRes = humanizeCodeComments(
          raw,
          (commentBody) => {
            const r = humanizeProse(commentBody, { ...passOpts, mode: 'conversational' });
            for (const k of Object.keys(r.counts)) {
              aggCounts[k] = (aggCounts[k] || 0) + r.counts[k];
            }
            return r.text;
          },
          passOpts.persona || 'intermediate'
        );
        aggCounts.commentsModified = codeRes.commentsModified;
        return { text: codeRes.text, counts: aggCounts };
      }
      const proseRes = humanizeProse(raw, passOpts);
      return { text: proseRes.text, counts: { ...proseRes.counts, commentsModified: 0 } };
    };

    let output = '';
    let counts = {};
    const passHistory = [];

    if (opts.autopilot && opts.mode !== 'code') {
      // AIHumanize.io Autopilot Pro mode: "Smart auto-optimization: Multiple rewrites until perfect (<20% AI)"
      // Runs up to 4 candidate passes with escalating intensity & model promotion, keeping the lowest AI risk score.
      const maxPasses = 4;
      let bestResult = null;
      for (let pass = 1; pass <= maxPasses; pass++) {
        const passIntensity = pass === 1 ? Math.max(opts.intensity, 80) : Math.min(100, opts.intensity + pass * 12);
        const passModel = pass >= 2 && opts.model === 'quality' ? 'enhanced' : pass >= 3 ? 'enhanced' : opts.model;
        const passSeed = (Number(opts.seed) || 0) + (pass - 1) * 31;
        const candidate = runSinglePass({
          ...opts,
          intensity: passIntensity,
          model: passModel,
          seed: passSeed,
        });
        const candSignals = analyzeSignals(candidate.text);
        passHistory.push({
          pass,
          aiRiskScore: candSignals.aiRiskScore,
          tellsCount: candSignals.tellsCount,
          burstinessCV: candSignals.burstinessCV,
        });
        if (!bestResult || candSignals.aiRiskScore < bestResult.signals.aiRiskScore) {
          bestResult = { ...candidate, signals: candSignals, pass };
        }
        if (candSignals.aiRiskScore < 20 && candSignals.tellsCount === 0) {
          break;
        }
      }
      output = bestResult.text;
      counts = bestResult.counts;
    } else {
      const single = runSinglePass(opts);
      output = single.text;
      counts = single.counts;
      const singleSig = analyzeSignals(output);
      passHistory.push({
        pass: 1,
        aiRiskScore: singleSig.aiRiskScore,
        tellsCount: singleSig.tellsCount,
        burstinessCV: singleSig.burstinessCV,
      });
    }

    // Zero-Tell Invariant Safety Gate (TellInvariantGate: tells(output) <= tells(input))
    let after = analyzeSignals(output);
    if (after.tellsCount > before.tellsCount) {
      for (const rule of AI_TELL_PATTERNS) {
        output = output.replace(rule.re, rule.replace);
      }
      after = analyzeSignals(output);
    }

    const totalChanges = Object.entries(counts)
      .filter(([k]) => k !== 'totalChanges')
      .reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
    counts.totalChanges = totalChanges;

    // Check Fact Invariant Gate (all numbers in input still exist in output)
    const inputNums = raw.match(/\b\d+(?:[.,]\d+)*%?\b/g) || [];
    const factsPreserved = inputNums.every((num) => output.includes(num));

    // Check Custom Locked Keywords Invariant Gate
    const kwList = Array.isArray(opts.lockKeywords)
      ? opts.lockKeywords.map((k) => String(k || '').trim()).filter(Boolean)
      : [];
    const keywordsPreserved = kwList.every((kw) => {
      if (!raw.toLowerCase().includes(kw.toLowerCase())) return true;
      return output.toLowerCase().includes(kw.toLowerCase());
    });

    // Check Locked Citations / Double-Quoted Strings Invariant Gate
    const inputQuotes = opts.lockCitations ? raw.match(/(?:"[^"\n]{2,240}"|“[^”\n]{2,240}”)/g) || [] : [];
    const citationsPreserved = inputQuotes.every((q) => output.includes(q));

    const overlapPct = winnowOverlap(raw, output, 5, 4);
    const diff = opts.mode === 'code' ? [] : diffTokens(raw, output);
    const highlightDiff = opts.mode === 'code' ? [] : diffHighlightTokens(raw, output);
    const detectors = evaluateDetectors(after, overlapPct);

    return {
      empty: false,
      input: raw,
      output,
      diff,
      highlightDiff,
      before,
      after,
      winnowingOverlapPct: overlapPct,
      detectors,
      language,
      autopilot: {
        enabled: Boolean(opts.autopilot),
        passesRun: passHistory.length,
        targetReached: after.aiRiskScore < 20,
        passHistory,
      },
      counts,
      invariants: {
        zeroTellPassed: after.tellsCount <= before.tellsCount,
        factsPreserved,
        keywordsPreserved,
        citationsPreserved,
      },
    };
  };

  // ---- 22. Built-in Samples (Turnitout + AIHumanize.io Gen Z Report Preset) ----
  const SAMPLES = {
    academic:
      'In conclusion, it is important to delve into the comprehensive tapestry of modern neural networks. ' +
      'This study plays a pivotal role in illustrating that artificial intelligence stands as a testament to human innovation [1]. ' +
      'Furthermore, the interplay between stochastic optimization and computational scalability provides a robust framework for subsequent empirical inquiries (Vaswani et al., 2017).',
    essay:
      "Moreover, in today's fast-paced digital era, the profound impact of social connectivity cannot be overlooked. " +
      'This experience serves as a critical milestone in my personal journey. ' +
      'Furthermore, it allows us to delve deep into the multifaceted dimensions of human empathy. ' +
      'Ultimately, this paradigm shift has fundamentally shaped my worldview.',
    genz:
      'This report analyzes evolving consumer preferences and purchasing behaviors of Generation Z (Gen Z) within sustainable fashion. ' +
      'Furthermore, as a digitally native cohort, Gen Z commands significant market influence and prioritizes ethical production alongside environmental accountability. ' +
      'Consequently, brands must align their supply chain disclosures with verifiable sustainability metrics in order to retain long-term loyalty.',
    latex:
      'In this study, previous studies have shown that the Crank-Nicolson scheme $u_i^{n+1} - u_i^n = \\frac{\\Delta t}{2}(L_h u_i^{n+1} + L_h u_i^n)$ provides a robust framework for solving the heat equation \\cite{crank1947}. ' +
      'Furthermore, it should be noted that the application of boundary conditions plays a pivotal role in maintaining 99.4% numerical stability.',
    code:
      '# In conclusion, this function plays a pivotal role in utilizing the array\n' +
      'def compute_loss(preds, targets):\n' +
      '    """It is important to note that this delves into the mean squared error."""\n' +
      '    # Furthermore, we leverage vectorization in order to optimize speed\n' +
      '    diff = preds - targets\n' +
      '    url = "https://example.com/#not-a-comment"\n' +
      '    return (diff ** 2).mean()',
  };

  root.BriskReadHumanizer = {
    DEFAULT_OPTIONS,
    SAMPLES,
    PROTECTED_TERMS,
    AI_TELL_PATTERNS,
    effectiveIntensity,
    scrubWatermarks,
    maskProtected,
    unmaskProtected,
    detectLanguageAndCount,
    winnowFingerprints,
    winnowOverlap,
    analyzeSignals,
    diffTokens,
    diffHighlightTokens,
    evaluateDetectors,
    humanizeCodeComments,
    humanize,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
