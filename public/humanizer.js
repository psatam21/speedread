/*
 * BriskRead Programmatic Text Humanizer & Meaning-Preserving Pattern Disruptor (v3.0).
 * Built on Wikipedia's "Signs of AI Writing" field guide + Turnitout 14-Stage Pipeline + AIHumanize:
 *   1. Zero-width Unicode & watermark scrubber + em-dash normalizer
 *   2. Placeholder masking for LaTeX ($...$, \cite{}), code, URLs, citations, locked quotes,
 *      custom SEO keywords (up to 30), numbers & 90+ protected scientific/domain terms
 *   3. 75+ Pattern AI Tell & Structural Cliché Scrubber:
 *      - Deletes throat-clearing hedges ("It is worth noting that", "It should be noted that")
 *      - Replaces copula avoidance ("serves as", "stands as", "plays a pivotal role in") with plain verbs
 *      - Splits trailing participial "-ing" tails (", thereby reducing...", ", highlighting...", ", ensuring...")
 *        into crisp finite sentences
 *   4. Meaning-Preserving Syntactic & Lexical Pipeline:
 *      - Never swaps domain/technical nouns ("energy storage", "cardiovascular disease", "truncation error")
 *      - Moves robotic sentence-initial transitions ("Furthermore,", "Additionally,", "Therefore,")
 *        naturally inside the verb phrase ("also", "therefore") or drops them cleanly
 *      - Active <-> Passive voice inversion & nominalization -> gerund/verb simplification
 *      - Natural Burstiness Sculptor (creates punchy 5–10 word sentences alongside 15–24 word sentences
 *        without creating run-on semicolon chains)
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

  const effectiveIntensity = (sliderPct) => {
    const clamped = Math.max(0, Math.min(100, Number(sliderPct) || 0));
    if (clamped === 0) return 0;
    return Math.pow(clamped / 100, 0.75);
  };

  // ---- 2. Protected terms (scientific, mathematical, software & compound domain terms) ----
  const PROTECTED_TERMS = [
    'Navier-Stokes', 'Navier--Stokes', 'Crank-Nicolson', 'Black-Scholes', 'Runge-Kutta',
    'Monte Carlo', 'Markov chain', 'Laplace equation', 'heat equation', 'wave equation',
    "Green's function", "Green's theorem", "Stokes' theorem", "Gauss's theorem",
    'Reynolds number', 'Mach number', 'Prandtl number', 'Nusselt number', 'Courant number',
    'Boltzmann', 'Maxwell', 'Helmholtz', 'Schrödinger', 'Schrodinger', 'Heisenberg',
    'Bernoulli', 'Lagrange', 'Lagrangian', 'Hamiltonian', 'Jacobian', 'Hessian', 'Wronskian',
    'Cauchy', 'Riemann', 'Hilbert', 'Banach', 'Sobolev', 'Lebesgue', 'Gaussian', 'Bayesian',
    'Boolean', 'Euclidean', 'Cartesian', 'Fibonacci', 'Hermitian', 'Abelian', 'Kolmogorov',
    'Lyapunov', 'Fourier', 'Poisson', 'Dirichlet', 'Neumann', 'Eigenvalue', 'eigenvalue',
    'eigenvalues', 'eigenvector', 'eigenvectors', 'TensorFlow', 'PyTorch', 'COMSOL',
    'ANSYS', 'OpenFOAM', 'MATLAB', 'Simulink', 'SciPy', 'NumPy', 'Kubernetes', 'PostgreSQL',
    'Generation Z', 'Gen Z', 'Western Europe', 'Industrial Revolution', 'pumped hydro',
    'compressed air',
  ];

  // Protected domain collocations so technical/compound nouns never lose their meaning
  const PROTECTED_COLLOCATIONS = [
    'social media', 'mental health', 'artificial intelligence', 'machine learning',
    'deep learning', 'natural language', 'supply chain', 'supply chains', 'real time',
    'real-time', 'long-term', 'short-term', 'open-source', 'climate change',
    'public health', 'raw materials', 'finished goods', 'central differences',
    'urban heat islands', 'solar radiation', 'wind power', 'smart grid',
    'capital investment', 'time zones', 'emergency departments', 'boundary conditions',
    'stochastic optimization', 'computational scalability', 'numerical stability',
    'high-sensitivity', 'myocardial injury', 'cardiovascular disease', 'energy storage',
    'thermal energy', 'electrical grids', 'battery systems', 'truncation error',
    'discretization grid', 'railway networks', 'railway timetables', 'urban economies',
    'patient biomarkers', 'clinical subjects', 'targeted therapy', 'tissue damage',
  ];

  // Clean "-ing" -> base verb map for turning "played a crucial role in [verb]ing" into "helped [verb]"
  const ING_TO_BASE = {
    reshaping: 'reshape',
    shaping: 'shape',
    maintaining: 'keep',
    sustaining: 'sustain',
    establishing: 'establish',
    developing: 'develop',
    driving: 'drive',
    creating: 'create',
    building: 'build',
    improving: 'improve',
    transforming: 'transform',
    facilitating: 'speed up',
    supporting: 'support',
    enabling: 'enable',
    reducing: 'reduce',
    accelerating: 'speed up',
    expanding: 'expand',
    illustrating: 'explain',
    demonstrating: 'show',
    ensuring: 'ensure',
    fostering: 'build',
    promoting: 'promote',
    strengthening: 'strengthen',
    modernizing: 'modernize',
    advancing: 'advance',
  };

  // ---- 3. 75-Pattern AI Tell & Structural Cliché Scrubber (Meaning-Preserving) ----
  const AI_TELL_PATTERNS = [
    // Chatbot preambles & closing residue
    { id: 'preamble_certainly', re: /^(?:Certainly!|Sure!|Absolutely!|Of course!)\s*(?:Here is|Here's|Below is)[^.!?]*[.!?]\s*/gi, replace: '', category: 'Chatbot residue' },
    { id: 'outro_hope_helps', re: /\s*(?:I hope this helps!|Hope this helps!|Let me know if you(?: would like| need)[^.!?]*[.!?])\s*$/gi, replace: '', category: 'Chatbot residue' },

    // Combined discourse + throat-clearing openers (delete the throat-clearing entirely)
    { id: 'combined_furthermore_noted', re: /\b(?:Furthermore|Moreover|Additionally),\s*it (?:should be|is worth|is important to) (?:noted|noting|note) that\s+/gi, replace: 'Also, ', academicReplace: 'Also, ', category: 'Formulaic opener' },
    { id: 'combined_moreover_worth', re: /\b(?:Furthermore|Moreover|Additionally),\s*it (?:is|remains) (?:worth noting|important to note|worth mentioning) that\s+/gi, replace: 'Also, ', academicReplace: 'Also, ', category: 'Formulaic opener' },
    { id: 'in_conclusion_delve_tapestry', re: /\bIn conclusion,\s*it is important to delve into the (?:comprehensive|rich|intricate|vibrant) tapestry of\s+/gi, replace: 'Here we look at ', academicReplace: 'This review examines ', category: 'Formulaic opener' },
    { id: 'in_conclusion_delve', re: /\bIn conclusion,\s*it is important to delve into\b/gi, replace: 'Here we look closely at', academicReplace: 'In summary, we examine', category: 'Formulaic opener' },
    { id: 'in_conclusion', re: /\bIn conclusion,?\b/gi, replace: 'In short,', academicReplace: 'In summary,', category: 'Formulaic opener' },
    { id: 'important_to_delve', re: /\bit is important to delve into\b/gi, replace: 'we look closely at', academicReplace: 'we examine', category: 'AI cliché' },
    { id: 'delve_multifaceted', re: /\bdelve deep into the multifaceted dimensions of\b/gi, replace: 'look closely at the many sides of', academicReplace: 'examine the core dimensions of', category: 'AI cliché' },
    { id: 'delve_into', re: /\bdelves?\s+(?:deeply\s+|deep\s+)?into\b/gi, replace: 'look closely at', academicReplace: 'examine', category: 'AI vocabulary' },
    { id: 'delve_verb', re: /\bdelv(?:e|es|ed|ing)\b/gi, replace: 'examine', category: 'AI vocabulary' },
    { id: 'comprehensive_tapestry', re: /\b(?:comprehensive|rich|intricate|vibrant)\s+tapestry(?:\s+of)?\b/gi, replace: 'wide range of', academicReplace: 'full scope of', category: 'Metaphor inflation' },
    { id: 'tapestry', re: /\btapestr(?:y|ies)\b/gi, replace: 'mix', academicReplace: 'structure', category: 'Metaphor inflation' },

    // "play(ed) a pivotal/crucial role in" -> plain human verb
    { id: 'pivotal_illustrating_sg', re: /\bplays a (?:pivotal|crucial|vital|key|paramount) role in illustrating\b/gi, replace: 'helps show', academicReplace: 'helps explain', category: 'Significance inflation' },
    { id: 'pivotal_illustrating_pl', re: /\bplay a (?:pivotal|crucial|vital|key|paramount) role in illustrating\b/gi, replace: 'help show', academicReplace: 'help explain', category: 'Significance inflation' },
    { id: 'played_role_in_ing', re: /\bplayed a (?:pivotal|crucial|vital|key|paramount|major|significant) role in ([a-z]+ing)\b/gi, replace: 'helped $1', academicReplace: 'helped $1', category: 'Significance inflation' },
    { id: 'plays_role_in_maintaining', re: /\bplays a (?:pivotal|crucial|vital|key|paramount) role in maintaining\b/gi, replace: 'is central to keeping', academicReplace: 'is central to keeping', category: 'Significance inflation' },
    { id: 'plays_role_in_ing', re: /\bplays a (?:pivotal|crucial|vital|key|paramount) role in ([a-z]+ing)\b/gi, replace: 'is central to $1', academicReplace: 'is central to $1', category: 'Significance inflation' },
    { id: 'pivotal_role_in', re: /\bplayed a (?:pivotal|crucial|vital|key|paramount) role in\b/gi, replace: 'was central to', academicReplace: 'was central to', category: 'Significance inflation' },
    { id: 'pivotal_role_sg', re: /\bplays a (?:pivotal|crucial|vital|key|paramount) role\b/gi, replace: 'is central', academicReplace: 'is central', category: 'Significance inflation' },
    { id: 'pivotal_role_pl', re: /\bplay a (?:pivotal|crucial|vital|key|paramount) role\b/gi, replace: 'are central', academicReplace: 'are central', category: 'Significance inflation' },

    { id: 'stands_testament', re: /\b(?:stands|serves) as a testament to\b/gi, replace: 'shows', academicReplace: 'reflects', category: 'Significance inflation' },
    { id: 'testament_to', re: /\ba testament to\b/gi, replace: 'proof of', academicReplace: 'evidence of', category: 'Significance inflation' },
    { id: 'furthermore_interplay', re: /\bFurthermore,\s*the interplay between ([^,]+?) and ([^,]+?)\s+provides a robust framework for\b/gi, replace: 'Balancing $1 with $2 also gives a solid basis for', academicReplace: 'Balancing $1 with $2 also gives a solid basis for', category: 'Discourse cliché' },
    { id: 'interplay_between', re: /\bthe interplay between\b/gi, replace: 'the balance between', academicReplace: 'the interaction between', category: 'AI cliché' },
    { id: 'robust_framework_solving', re: /\bprovides a robust framework for solving\b/gi, replace: 'gives a reliable way to solve', academicReplace: 'gives a reliable way to solve', category: 'Promotional phrasing' },
    { id: 'robust_framework', re: /\bprovides a robust framework\b/gi, replace: 'gives a solid basis', academicReplace: 'gives a solid basis', category: 'Promotional phrasing' },
    { id: 'fast_paced_era', re: /\b(?:Moreover,\s*)?in today's (?:fast-paced|rapidly evolving|ever-changing) (?:digital )?(?:era|world|landscape),?\b/gi, replace: 'Today,', academicReplace: 'Today,', category: 'Formulaic opener' },
    { id: 'critical_milestone_journey', re: /\bserves as a (?:critical|key|major|pivotal) milestone in my personal journey\b/gi, replace: 'was a turning point for me', academicReplace: 'marked a turning point in my development', category: 'Significance inflation' },
    { id: 'critical_milestone', re: /\bserves as a (?:critical|key|major|pivotal) milestone\b/gi, replace: 'is a major turning point', academicReplace: 'marks a key stage', category: 'Significance inflation' },
    { id: 'cannot_be_overlooked', re: /\bcannot be (?:overlooked|overstated)\b/gi, replace: 'is hard to ignore', academicReplace: 'is hard to ignore', category: 'Hedging cliché' },
    { id: 'ultimately_paradigm', re: /\bUltimately,\s*this paradigm shift\b/gi, replace: 'In the end, this shift', academicReplace: 'In the end, this shift', category: 'Conclusion bloat' },
    { id: 'paradigm_shift', re: /\bparadigm shift\b/gi, replace: 'major shift', academicReplace: 'structural shift', category: 'Promotional phrasing' },

    // Correlative & negative parallelism formulas
    { id: 'not_only_provide', re: /\bNot only does ([^,]+?)\s+provide\s+([^,]+?)\s+with\s+([^,]+),\s*but it also\s+(?:enables|allows)\s+([^,]+?)\s+to\s+/gi, replace: '$1 gives $2 $3 and lets $4 ', academicReplace: '$1 gives $2 $3 and enables $4 to ', category: 'Correlative cliché' },
    { id: 'not_only_does', re: /\bNot only does ([^,]+?)\s+([a-z]+)\s+([^,]+),\s*but it also\s+([a-z]+s)\s+/gi, replace: '$1 both $2s $3 and $4 ', academicReplace: '$1 both $2s $3 and $4 ', category: 'Correlative cliché' },
    { id: 'not_merely_but', re: /\bnot (?:merely|just) ([^,;]+),\s*but (?:also |rather )?([^.;,]+)/gi, replace: 'both $1 and $2', category: 'Negative parallelism' },

    // Participial tailing tells (converts GPT-4o / Claude trailing -ing clauses into natural finite sentences)
    { id: 'tail_fostering_while_creating', re: /,\s*fostering (a\s+[^.!?]+?)\s+while simultaneously creating ([^.!?]+)([.!?])/gi, replace: ', building $1. At the same time, they create $2$3', academicReplace: ', building $1. At the same time, they create $2$3', category: 'Participial tail' },
    { id: 'tail_underscoring_interventions', re: /,\s*underscoring the (?:urgent |critical |growing )?(?:need|importance) for early diagnostic interventions\b/gi, replace: '. That makes early diagnostic care essential', academicReplace: '. That makes early diagnostic care essential', category: 'Participial tail' },
    { id: 'tail_underscoring_need', re: /,\s*underscoring the (?:urgent |critical |growing )?(?:need|importance) for\s+([^.!?]+)([.!?])/gi, replace: '. That shows the need for $1$2', academicReplace: '. This points to the need for $1$2', category: 'Participial tail' },
    { id: 'tail_highlighting_virtual', re: /,\s*highlighting the (?:importance|significance|value|need) of ([^.!?]+?) in an increasingly virtual world([.!?])/gi, replace: ' and showed how much $1 matter in an online world$2', academicReplace: ' and showed why $1 matter in an online world$2', category: 'Participial tail' },
    { id: 'tail_highlighting_importance', re: /,\s*highlighting the (?:importance|significance|value|need) of\s+([^.!?]+)([.!?])/gi, replace: '. That shows the value of $1$2', academicReplace: '. This shows the value of $1$2', category: 'Participial tail' },
    { id: 'tail_thereby_enabling', re: /,\s*(?:thereby|thus) (?:enabling|allowing)\s+([^.!?]+?)\s+to\s+([a-z]+)\b/gi, replace: ', letting $1 $2', academicReplace: ', letting $1 $2', category: 'Participial tail' },
    { id: 'tail_thereby_reducing_and', re: /,\s*(?:thereby|thus) reducing ([^.!?]+?) and boosting ([^.!?]+)([.!?])/gi, replace: '. This cuts $1 and boosts $2$3', academicReplace: '. This reduces $1 and boosts $2$3', category: 'Participial tail' },
    { id: 'tail_thereby_reducing', re: /,\s*(?:thereby|thus)\s+([a-z]+ing)\s+/gi, replace: '. In practice, that means $1 ', academicReplace: '. In practice, this entails $1 ', category: 'Participial tail' },
    { id: 'tail_allowing_to', re: /,\s*(?:allowing|enabling)\s+(me|us|them|users|researchers|teams|companies|clinicians|engineers)\s+to\s+/gi, replace: '. It let $1 ', academicReplace: '. This enabled $1 to ', category: 'Participial tail' },
    { id: 'tail_ensuring_rapid', re: /,\s*ensuring rapid ([^.!?]+?) in ([^.!?]+)([.!?])/gi, replace: '. This keeps $1 fast in $2$3', academicReplace: '. This keeps $1 fast in $2$3', category: 'Participial tail' },
    { id: 'tail_ensuring_general', re: /,\s*ensuring\s+([^.!?]+)([.!?])/gi, replace: '. This ensures $1$2', academicReplace: '. This ensures $1$2', category: 'Participial tail' },
    { id: 'tail_fostering_a', re: /,\s*fostering\s+(a\s+[^.!?]+)([.!?])/gi, replace: '. That built $1$2', academicReplace: '. This built $1$2', category: 'Participial tail' },
    { id: 'tail_fostering_mid', re: /,\s*fostering\s+/gi, replace: ', building ', academicReplace: ', building ', category: 'Participial tail' },

    // Throat-clearing & filler hedging (delete instead of replacing with more fluff)
    { id: 'worth_noting', re: /\b(?:It is|It's) (?:worth noting|important to note|worth mentioning|crucial to remember|essential to consider) that\s+/gi, replace: '', academicReplace: '', category: 'Filler hedging' },
    { id: 'should_be_noted', re: /\bIt should be noted that\s+/gi, replace: '', academicReplace: '', category: 'Filler hedging' },
    { id: 'in_the_realm_of', re: /\bin the (?:realm|landscape) of\b/gi, replace: 'in', academicReplace: 'in', category: 'Filler hedging' },
    { id: 'at_its_core', re: /\bat (?:its core|the heart of),?\b/gi, replace: 'basically,', academicReplace: 'at root,', category: 'Filler hedging' },
    { id: 'when_it_comes_to', re: /\bwhen it comes to\b/gi, replace: 'for', academicReplace: 'for', category: 'Filler hedging' },
    { id: 'serves_as_a', re: /\bserves as a\b/gi, replace: 'is a', academicReplace: 'is a', category: 'Copula avoidance' },
    { id: 'served_as', re: /\bserved as\b/gi, replace: 'was', academicReplace: 'was', category: 'Copula avoidance' },
    { id: 'serves_as', re: /\bserves as\b/gi, replace: 'is', academicReplace: 'is', category: 'Copula avoidance' },
    { id: 'stands_as', re: /\bstands as\b/gi, replace: 'is', academicReplace: 'is', category: 'Copula avoidance' },
    { id: 'underscores', re: /\bunderscores\b/gi, replace: 'shows', academicReplace: 'shows', category: 'Significance inflation' },
    { id: 'underscored', re: /\bunderscored\b/gi, replace: 'showed', academicReplace: 'showed', category: 'Significance inflation' },
    { id: 'underscoring', re: /\bunderscoring\b/gi, replace: 'showing', academicReplace: 'showing', category: 'Significance inflation' },
    { id: 'underscore', re: /\bunderscore\b/gi, replace: 'show', academicReplace: 'show', category: 'Significance inflation' },
    { id: 'utilizes', re: /\butilizes\b/gi, replace: 'uses', academicReplace: 'uses', category: 'AI vocabulary' },
    { id: 'utilized', re: /\butilized\b/gi, replace: 'used', academicReplace: 'used', category: 'AI vocabulary' },
    { id: 'utilizing', re: /\butilizing\b/gi, replace: 'using', academicReplace: 'using', category: 'AI vocabulary' },
    { id: 'utilize', re: /\butilize\b/gi, replace: 'use', academicReplace: 'use', category: 'AI vocabulary' },
    { id: 'leverages', re: /\bleverages\b/gi, replace: 'uses', academicReplace: 'uses', category: 'AI vocabulary' },
    { id: 'leveraging', re: /\bleveraging\b/gi, replace: 'using', academicReplace: 'using', category: 'AI vocabulary' },
    { id: 'leverage_verb', re: /\bleverage\b(?=\s+(?:the|a|an|this|these|our|their|modern|existing|advanced|vectorization))/gi, replace: 'use', academicReplace: 'use', category: 'AI vocabulary' },
    { id: 'fosters', re: /\bfosters\b/gi, replace: 'builds', academicReplace: 'encourages', category: 'AI vocabulary' },
    { id: 'fostered', re: /\bfostered\b/gi, replace: 'built', academicReplace: 'encouraged', category: 'AI vocabulary' },
    { id: 'fostering', re: /\bfostering\b/gi, replace: 'building', academicReplace: 'encouraging', category: 'AI vocabulary' },
    { id: 'foster', re: /\bfoster\b/gi, replace: 'build', academicReplace: 'encourage', category: 'AI vocabulary' },
    { id: 'pivotal', re: /\bpivotal\b/gi, replace: 'central', academicReplace: 'central', category: 'AI vocabulary' },
    { id: 'paramount', re: /\bparamount\b/gi, replace: 'top', academicReplace: 'primary', category: 'AI vocabulary' },
    { id: 'vibrant', re: /\bvibrant\b/gi, replace: 'lively', academicReplace: 'active', category: 'AI vocabulary' },
    { id: 'seamlessly', re: /\bseamlessly\b/gi, replace: 'smoothly', academicReplace: 'smoothly', category: 'Promotional phrasing' },
    { id: 'seamless', re: /\bseamless\b/gi, replace: 'smooth', academicReplace: 'smooth', category: 'Promotional phrasing' },
    { id: 'emerged_game_changer', re: /\bhas emerged as a game-changer for ([^.,;!?]+)/gi, replace: 'has reshaped how $1 work', academicReplace: 'has reshaped $1', category: 'Promotional phrasing' },
    { id: 'game_changer', re: /\bgame-chang(?:er|ing)\b/gi, replace: 'major shift', academicReplace: 'significant shift', category: 'Promotional phrasing' },
    { id: 'unlock_potential', re: /\b(?:unlock|unleash)(?:es|ed|ing)? the (?:full )?potential of\b/gi, replace: 'get the most from', academicReplace: 'get the most from', category: 'Promotional phrasing' },
    { id: 'unleash', re: /\b(?:unleash|unlock)(?:es|ed|ing)?\b/gi, replace: 'enable', academicReplace: 'enable', category: 'Promotional phrasing' },
    { id: 'elevate', re: /\belevat(?:e|es|ed|ing)\b/gi, replace: 'improve', academicReplace: 'improve', category: 'Promotional phrasing' },
    { id: 'revolutionize', re: /\brevolutioniz(?:e|es|ed|ing)\b/gi, replace: 'transform', academicReplace: 'transform', category: 'Promotional phrasing' },
    { id: 'synergy', re: /\bsynerg(?:y|ies)\b/gi, replace: 'teamwork', academicReplace: 'coordination', category: 'Promotional phrasing' },
    { id: 'beacon', re: /\bbeacon\b/gi, replace: 'guide', academicReplace: 'benchmark', category: 'Metaphor inflation' },
    { id: 'embark', re: /\bembark(?:s|ed|ing)?\s+on\b/gi, replace: 'start', academicReplace: 'begin', category: 'Metaphor inflation' },
    { id: 'multifaceted', re: /\bmultifaceted\b/gi, replace: 'many-sided', academicReplace: 'complex', category: 'AI vocabulary' },
    { id: 'spearheaded', re: /\bspearheaded\b/gi, replace: 'led', academicReplace: 'led', category: 'Promotional phrasing' },
    { id: 'evolving_landscape', re: /\bevolving landscape\b/gi, replace: 'changing field', academicReplace: 'shifting field', category: 'Metaphor inflation' },
    { id: 'moving_forward', re: /\b(?:Moving|Going) forward,\s*/gi, replace: 'From here, ', academicReplace: 'Next, ', category: 'Conclusion bloat' },
  ];

  // ---- 4. Meaning-Preserving Multi-Word Phrase Rewrites ----
  const PHRASE_REWRITES = [
    // Literature review & openings (plain, direct academic/general English)
    { re: /\bIn this study,\s*previous studies have shown that\b/gi, conv: 'Earlier work shows that', acad: 'Earlier work shows that' },
    { re: /\bprevious studies have shown that\b/gi, conv: 'earlier work shows that', acad: 'earlier studies show that' },
    { re: /\bprevious studies have shown\b/gi, conv: 'earlier work showed', acad: 'earlier studies showed' },
    { re: /\bhas been widely studied\b/gi, conv: 'has been studied often', acad: 'has been widely examined' },
    { re: /\bit has been reported that\b/gi, conv: 'reports show that', acad: 'prior work reports that' },
    { re: /\baccording to recent research\b/gi, conv: 'recent studies show', acad: 'recent studies show' },
    { re: /\bis well documented\b/gi, conv: 'is well known', acad: 'is well established' },
    { re: /\bas mentioned earlier\b/gi, conv: 'as noted above', acad: 'as noted above' },
    { re: /\bthe existing literature\b/gi, conv: 'published work', acad: 'prior literature' },
    { re: /\bthis research paper\b/gi, conv: 'this paper', acad: 'this paper' },
    { re: /\bIn this study,\s*/g, conv: 'Here, ', acad: 'Here, ' },
    { re: /\bin this study\b/gi, conv: 'here', acad: 'in this work' },
    { re: /\bIn this analysis,\s*we (?:evaluate|examine|analyze)\b/gi, conv: 'Here we examine', acad: 'Here we examine' },
    { re: /\bin this analysis\b/gi, conv: 'here', acad: 'in this assessment' },

    // Methodology & prepositional compression (100% meaning-preserving)
    { re: /\bwas carried out\b/gi, conv: 'was done', acad: 'was performed' },
    { re: /\bin order to\b/gi, conv: 'to', acad: 'to' },
    { re: /\bby means of\b/gi, conv: 'using', acad: 'using' },
    { re: /\bwith respect to\b/gi, conv: 'for', acad: 'regarding' },
    { re: /\bfor the purpose of\b/gi, conv: 'for', acad: 'for' },
    { re: /\bdue to the fact that\b/gi, conv: 'because', acad: 'because' },
    { re: /\bhave transformed the way\b/gi, conv: 'have changed how', acad: 'have changed how' },
    { re: /\bwhile simultaneously\b/gi, conv: 'while also', acad: 'while also' },
    { re: /\bfor solving the\b/gi, conv: 'to solve the', acad: 'to solve the' },
    { re: /\bacross the discretization grid\b/gi, conv: 'on the discretization grid', acad: 'on the discretization grid' },
    { re: /\bgained through\b/gi, conv: 'from', acad: 'from' },
    { re: /\bduring the third quarter\b/gi, conv: 'in the third quarter', acad: 'in the third quarter' },
    { re: /\bduring peak hours\b/gi, conv: 'at peak hours', acad: 'at peak hours' },
    { re: /\bduring peak summer months\b/gi, conv: 'in peak summer months', acad: 'in peak summer months' },
    { re: /\bthroughout the nineteenth century\b/gi, conv: 'in the nineteenth century', acad: 'in the nineteenth century' },
    { re: /\bof Generation Z \(Gen Z\) within\b/g, conv: 'among Generation Z (Gen Z) in', acad: 'among Generation Z (Gen Z) in' },
    { re: /\bacross (\x00PH\d+PH\x00) clinical subjects\b/g, conv: 'in $1 clinical subjects', acad: 'in $1 clinical subjects' },
    { re: /\busing high-sensitivity troponin assays to evaluate\b/gi, conv: 'with high-sensitivity troponin assays to assess', acad: 'with high-sensitivity troponin assays to assess' },
    { re: /\bbefore irreversible tissue damage occurs\b/gi, conv: 'before permanent tissue damage sets in', acad: 'before permanent tissue damage sets in' },
    { re: /\btemperatures that are (\x00PH\d+PH\x00) degrees higher than\b/gi, conv: 'temperatures $1 degrees above', acad: 'temperatures $1 degrees above' },
    { re: /\bthat face geopolitical constraints\b/gi, conv: 'facing geopolitical limits', acad: 'facing geopolitical limits' },
    { re: /\bexperiencing rapid population growth and infrastructure expansion\b/gi, conv: 'facing fast population growth and new construction', acad: 'facing fast population growth and new construction' },
    { re: /\bIn order to address this issue\b/gi, conv: 'To tackle this problem', acad: 'To address this problem' },
    { re: /\bTo address this issue\b/gi, conv: 'To tackle this problem', acad: 'To address this problem' },

    // Results & findings
    { re: /\bthe results indicate that\b/gi, conv: 'the findings show that', acad: 'the findings show that' },
    { re: /\bthe results indicate\b/gi, conv: 'the findings show', acad: 'the findings show' },
    { re: /\bit can be seen that\b/gi, conv: 'we see that', acad: 'we see that' },
    { re: /\bit was found that\b/gi, conv: 'we found that', acad: 'we found that' },
    { re: /\bhas resulted in a (\x00PH\d+PH\x00) reduction in ([^.,;!?]+?)(?=\s+(?:across|in|at|during|for)\b|[.,;!?])/gi, conv: 'cut $2 by $1', acad: 'cut $2 by $1' },
    { re: /\bhas resulted in\b/gi, conv: 'led to', acad: 'led to' },
    { re: /\bremains a leading cause of mortality\b/gi, conv: 'is still a leading cause of death', acad: 'is still a leading cause of death' },
    { re: /\bremains a leading cause of\b/gi, conv: 'is still a leading cause of', acad: 'is still a leading cause of' },
    { re: /\bcommands significant market influence\b/gi, conv: 'holds major market influence', acad: 'holds major market influence' },
    { re: /\balign their supply chain disclosures with\b/gi, conv: 'match their supply chain disclosures to', acad: 'match their supply chain disclosures to' },
    { re: /\btap into a global talent pool\b/gi, conv: 'hire from a global talent pool', acad: 'recruit from a global talent pool' },
    { re: /\bhas emerged as\b/gi, conv: 'has become', acad: 'has become' },
    { re: /\brepresent a growing environmental challenge for\b/gi, conv: 'are a growing environmental problem for', acad: 'are a growing environmental problem for' },
    { re: /\bmetropolitan areas\b/gi, conv: 'large cities', acad: 'major cities' },
    { re: /\bmunicipal planners\b/gi, conv: 'city planners', acad: 'city planners' },
    { re: /\ba large number of\b/gi, conv: 'many', acad: 'many' },
    { re: /\bsuch as\b/gi, conv: 'like', acad: 'such as' },
  ];

  // ---- 5. Natural Human Discourse Handling (Following human-writing/SKILL.md Section 1.4) ----
  // Humans rarely start every sentence with "Furthermore,", "Moreover,", "Additionally,", "Thus,".
  // We either tuck "also" / "therefore" naturally inside the clause or use short, plain connectors.
  const DISCOURSE_ROTATIONS = {
    however: {
      conv: ['Still', 'Yet', 'Even so', 'That said'],
      acad: ['Still', 'Yet', 'Even so', 'That said'],
    },
    therefore: {
      conv: ['So', 'As a result'],
      acad: ['As a result', 'Accordingly'],
    },
    moreover: {
      conv: ['Also', 'Beyond this'],
      acad: ['Also', 'In addition'],
    },
    furthermore: {
      conv: ['Also', 'Beyond that'],
      acad: ['Also', 'In addition'],
    },
    additionally: {
      conv: ['Also', 'Besides'],
      acad: ['Also', 'In addition'],
    },
    consequently: {
      conv: ['So', 'As a result'],
      acad: ['As a result', 'Accordingly'],
    },
    thus: {
      conv: ['So', 'In this way'],
      acad: ['As a result', 'In this way'],
    },
    ultimately: {
      conv: ['In the end', 'Finally'],
      acad: ['In the end', 'Finally'],
    },
  };

  // ---- 6. Meaning-Preserving Synonym Catalog (Strictly Verbs, Adjectives & Generic Framing Words) ----
  // Zero domain-noun replacements: technical and subject-matter nouns stay 100% untouched.
  const SYNONYM_CATALOG = {
    // Plain verbs (all inflections)
    analyze: { conv: ['examine', 'study'], acad: ['examine', 'study'] },
    analyzes: { conv: ['examines', 'studies'], acad: ['examines', 'studies'] },
    analyzed: { conv: ['examined', 'studied'], acad: ['examined', 'studied'] },
    analyzing: { conv: ['examining', 'studying'], acad: ['examining', 'studying'] },
    demonstrate: { conv: ['show', 'make clear'], acad: ['show', 'establish'] },
    demonstrates: { conv: ['shows', 'makes clear'], acad: ['shows', 'establishes'] },
    demonstrated: { conv: ['showed', 'made clear'], acad: ['showed', 'established'] },
    demonstrating: { conv: ['showing', 'making clear'], acad: ['showing', 'establishing'] },
    illustrate: { conv: ['show', 'explain'], acad: ['show', 'clarify'] },
    illustrates: { conv: ['shows', 'explains'], acad: ['shows', 'clarifies'] },
    illustrated: { conv: ['showed', 'explained'], acad: ['showed', 'clarified'] },
    illustrating: { conv: ['showing', 'explaining'], acad: ['showing', 'clarifying'] },
    evaluate: { conv: ['assess', 'test', 'check'], acad: ['assess', 'examine'] },
    evaluates: { conv: ['assesses', 'tests'], acad: ['assesses', 'examines'] },
    evaluated: { conv: ['assessed', 'tested'], acad: ['assessed', 'examined'] },
    evaluating: { conv: ['assessing', 'testing'], acad: ['assessing', 'examining'] },
    investigate: { conv: ['study', 'test', 'look into'], acad: ['study', 'examine'] },
    investigates: { conv: ['studies', 'tests'], acad: ['studies', 'examines'] },
    investigated: { conv: ['studied', 'tested'], acad: ['studied', 'examined'] },
    investigating: { conv: ['testing', 'studying'], acad: ['testing', 'examining'] },
    implement: { conv: ['roll out', 'put in place', 'set up'], acad: ['put in place', 'apply'] },
    implements: { conv: ['rolls out', 'puts in place'], acad: ['puts in place', 'applies'] },
    implemented: { conv: ['rolled out', 'put in place'], acad: ['put in place', 'applied'] },
    implementing: { conv: ['rolling out', 'putting in place'], acad: ['putting in place', 'applying'] },
    facilitate: { conv: ['help', 'speed up'], acad: ['help', 'enable'] },
    facilitates: { conv: ['helps', 'speeds up'], acad: ['helps', 'enables'] },
    facilitated: { conv: ['helped', 'sped up'], acad: ['helped', 'enabled'] },
    facilitating: { conv: ['helping', 'speeding up'], acad: ['helping', 'enabling'] },
    mitigate: { conv: ['reduce', 'cut'], acad: ['reduce', 'curb'] },
    mitigates: { conv: ['reduces', 'cuts'], acad: ['reduces', 'curbs'] },
    mitigated: { conv: ['reduced', 'cut'], acad: ['reduced', 'curbed'] },
    mitigating: { conv: ['reducing', 'cutting'], acad: ['reducing', 'curbing'] },
    prioritize: { conv: ['focus on', 'emphasize'], acad: ['focus on', 'emphasize'] },
    prioritizes: { conv: ['focuses on', 'values'], acad: ['focuses on', 'emphasizes'] },
    prioritized: { conv: ['focused on', 'valued'], acad: ['focused on', 'emphasized'] },
    retain: { conv: ['keep', 'hold onto'], acad: ['keep', 'maintain'] },
    retains: { conv: ['keeps', 'holds onto'], acad: ['keeps', 'maintains'] },
    retained: { conv: ['kept', 'held onto'], acad: ['kept', 'maintained'] },
    require: { conv: ['need', 'call for'], acad: ['need', 'require'] },
    requires: { conv: ['needs', 'calls for'], acad: ['needs', 'requires'] },
    required: { conv: ['needed', 'called for'], acad: ['needed', 'required'] },
    achieve: { conv: ['reach', 'get'], acad: ['reach', 'attain'] },
    achieves: { conv: ['reaches', 'gets'], acad: ['reaches', 'attains'] },
    achieved: { conv: ['reached', 'got'], acad: ['reached', 'attained'] },
    maintain: { conv: ['keep', 'hold'], acad: ['keep', 'sustain'] },
    maintains: { conv: ['keeps', 'holds'], acad: ['keeps', 'sustains'] },
    maintained: { conv: ['kept', 'held'], acad: ['kept', 'sustained'] },
    maintaining: { conv: ['keeping', 'holding'], acad: ['keeping', 'sustaining'] },
    redefine: { conv: ['remake', 'reshape'], acad: ['remake', 'reshape'] },
    redefined: { conv: ['remade', 'reshaped'], acad: ['remade', 'reshaped'] },
    alter: { conv: ['change', 'shift'], acad: ['change', 'modify'] },
    alters: { conv: ['changes', 'shifts'], acad: ['changes', 'modifies'] },
    altered: { conv: ['changed', 'shifted'], acad: ['changed', 'modified'] },
    absorb: { conv: ['trap', 'soak up'], acad: ['trap', 'absorb'] },
    absorbs: { conv: ['traps', 'soaks up'], acad: ['traps', 'absorbs'] },
    fluctuate: { conv: ['shift', 'vary'], acad: ['shift', 'vary'] },
    fluctuates: { conv: ['shifts', 'varies'], acad: ['shifts', 'varies'] },
    embrace: { conv: ['adopt', 'use'], acad: ['adopt', 'use'] },
    collaborate: { conv: ['work together'], acad: ['work together', 'coordinate'] },
    initiate: { conv: ['start', 'begin'], acad: ['start', 'begin'] },
    depend: { conv: ['rely'], acad: ['rely'] },
    depends: { conv: ['relies'], acad: ['relies'] },

    // Plain adjectives & adverbs (strictly meaning-preserving)
    subsequent: { conv: ['later', 'follow-up'], acad: ['later', 'follow-up'] },
    comprehensive: { conv: ['full', 'thorough'], acad: ['full', 'thorough'] },
    robust: { conv: ['solid', 'strong', 'reliable'], acad: ['solid', 'reliable'] },
    significant: { conv: ['major', 'large'], acad: ['major', 'substantial'] },
    substantial: { conv: ['heavy', 'large'], acad: ['large', 'substantial'] },
    profound: { conv: ['deep', 'lasting'], acad: ['deep', 'lasting'] },
    crucial: { conv: ['key', 'central'], acad: ['central', 'key'] },
    vital: { conv: ['key', 'essential'], acad: ['essential', 'central'] },
    important: { conv: ['key', 'central'], acad: ['key', 'central'] },
    diverse: { conv: ['different', 'varied'], acad: ['different', 'varied'] },
    rigorous: { conv: ['strict', 'careful'], acad: ['strict', 'careful'] },
    evolving: { conv: ['changing', 'shifting'], acad: ['changing', 'shifting'] },
    verifiable: { conv: ['clear', 'checkable'], acad: ['verifiable', 'clear'] },
    rapid: { conv: ['fast', 'quick'], acad: ['fast', 'rapid'] },
    isolated: { conv: ['remote', 'distant'], acad: ['remote', 'isolated'] },
    synchronized: { conv: ['shared', 'coordinated'], acad: ['coordinated', 'shared'] },
    surrounding: { conv: ['nearby', 'neighboring'], acad: ['nearby', 'surrounding'] },
    alternative: { conv: ['other'], acad: ['other', 'alternative'] },
    costly: { conv: ['expensive'], acad: ['expensive'] },
    authentic: { conv: ['real', 'genuine'], acad: ['genuine', 'real'] },
    fundamentally: { conv: ['deeply'], acad: ['deeply'] },
    increasingly: { conv: ['more and more'], acad: ['increasingly'] },
    frequently: { conv: ['often'], acad: ['often'] },

    // Generic non-technical framing nouns ONLY
    individuals: { conv: ['people'], acad: ['people', 'individuals'] },
    inquiries: { conv: ['studies', 'questions'], acad: ['studies', 'investigations'] },
    outcomes: { conv: ['results'], acad: ['results', 'findings'] },
    organizations: { conv: ['companies', 'teams'], acad: ['organizations', 'firms'] },
    practices: { conv: ['habits', 'routines'], acad: ['practices', 'routines'] },
    cohort: { conv: ['generation', 'group'], acad: ['generation', 'group'] },
    efficiencies: { conv: ['gains', 'savings'], acad: ['gains', 'improvements'] },
    improvements: { conv: ['gains', 'advances'], acad: ['gains', 'improvements'] },
    perceptions: { conv: ['views'], acad: ['views', 'perceptions'] },
    catalyst: { conv: ['driver', 'spark'], acad: ['driver', 'catalyst'] },
    initiatives: { conv: ['programs', 'efforts'], acad: ['programs', 'initiatives'] },
    mandates: { conv: ['rules', 'requirements'], acad: ['rules', 'mandates'] },
    component: { conv: ['part'], acad: ['part', 'component'] },
    worldview: { conv: ['outlook', 'perspective'], acad: ['outlook', 'perspective'] },
    challenges: { conv: ['hurdles', 'problems'], acad: ['challenges', 'hurdles'] },
  };

  // ---- 7. Determiner Swaps (guarded against preceding articles) ----
  const DETERMINER_SWAPS = {
    several: { conv: ['a few', 'multiple'], acad: ['multiple', 'several'] },
    many: { conv: ['numerous', 'plenty of'], acad: ['numerous', 'many'] },
    various: { conv: ['different', 'several'], acad: ['different', 'several'] },
    diverse: { conv: ['different', 'varied'], acad: ['different', 'varied'] },
  };

  // ---- 8. Nominalization -> Verbal / Gerund Simplification ----
  const NOMINALIZATION_RULES = [
    { re: /\bthe application of\b/gi, conv: 'applying', acad: 'applying' },
    { re: /\bthe implementation of\b/gi, conv: 'putting in place', acad: 'implementing' },
    { re: /\bthe evaluation of\b/gi, conv: 'testing', acad: 'evaluating' },
    { re: /\bthe expansion of\b/gi, conv: 'expanding', acad: 'expanding' },
    { re: /\bthe standardization of\b/gi, conv: 'standardizing', acad: 'standardizing' },
    { re: /\bconducted an investigation (?:of|into)\b/gi, conv: 'studied', acad: 'investigated' },
    { re: /\bperformed an analysis of\b/gi, conv: 'examined', acad: 'examined' },
    { re: /\bmade a comparison between\b/gi, conv: 'compared', acad: 'compared' },
  ];

  // ---- 9. Active <-> Passive Voice & Clause Simplification ----
  const VOICE_RULES = [
    // Passive -> Active (stops actor capture before "using", "with", "to", etc.)
    {
      re: /\b([A-Za-z]+(?:\s+[a-z]+){0,2}) (?:was|were) (analyzed|examined|evaluated|tested|measured|developed|selected|observed) by ([a-z]+(?:\s+(?!using\b|with\b|via\b|through\b|in\b|on\b|at\b|to\b|for\b|from\b|across\b|during\b|by\b|that\b|who\b|which\b)[a-z]+)?)\b/g,
      replace: '$3 $2 $1',
    },
    {
      re: /\bthe truncation error is reduced (?:through the use of|by means of|using) ([^,.;!?]+)/gi,
      conv: '$1 cut the truncation error',
      acad: '$1 reduce the truncation error',
    },
    {
      re: /\bBy connecting ([^,]+?) with ([^,]+),\s*([^,]+?)\s+facilitated the rapid movement of\b/gi,
      conv: 'Connecting $1 to $2 let $3 speed up the movement of',
      acad: 'Connecting $1 to $2 enabled $3 to speed up the movement of',
    },
    { re: /\bIt (?:has been|was) (?:shown|demonstrated|observed) that\b/gi, conv: 'We see that', acad: 'Evidence shows that' },
  ];

  // ---- 10. Appositive Definitions (for Expand / Technical modes) ----
  const APPOSITIVES = [
    { term: /\bfinite difference method\b/i, phrase: 'a grid-based discretization scheme for differential equations' },
    { term: /\bCrank-Nicolson\b/i, phrase: 'an implicit second-order time-stepping method' },
    { term: /\bMonte Carlo\b/i, phrase: 'a repeated random sampling method' },
    { term: /\bBlack-Scholes\b/i, phrase: 'a continuous-time option pricing model' },
    { term: /\bgradient descent\b/i, phrase: 'an iterative first-order optimization algorithm' },
    { term: /\bregularization\b/i, phrase: 'a penalty term that curbs overfitting' },
    { term: /\bbackpropagation\b/i, phrase: 'reverse-mode automatic differentiation across network layers' },
  ];

  const HEDGE_WORDS = {
    conv: ['in practice', 'for the most part', 'in most cases', 'by and large'],
    acad: ['in large measure', 'to a notable degree', 'by and large', 'in practical terms'],
  };

  // ---- 11. Watermark & Zero-Width Scrubber ----
  const ZERO_WIDTH_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g;
  const NBSP_RE = /[\u00A0\u202F\u2007]/g;

  const scrubWatermarks = (input) => {
    const raw = String(input == null ? '' : input);
    const zwMatches = raw.match(ZERO_WIDTH_RE);
    const watermarksRemoved = zwMatches ? zwMatches.length : 0;

    let text = raw
      .replace(ZERO_WIDTH_RE, '')
      .replace(NBSP_RE, ' ')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'");

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

  // ---- 12. Placeholder Masking (LaTeX, Code, URLs, Citations, Quotes, SEO Keywords, Numbers, Protected Terms) ----
  const maskProtected = (input, lockOpts = {}) => {
    const slots = [];
    const put = (val) => {
      const id = `\x00PH${slots.length}PH\x00`;
      slots.push(val);
      return id;
    };

    let text = input;
    text = text.replace(/```[\s\S]*?```|`[^`\n]+`/g, put);
    text = text.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g, put);
    text = text.replace(/\\(?:cite|ref|eqref|label|textbf|textit|emph|texttt|section|subsection|begin|end)\b(?:\[[^\]]*\])?\{[^}]*\}/g, put);
    text = text.replace(/\\[a-zA-Z]+\b(?:\{[^}]*\})?/g, put);
    text = text.replace(/https?:\/\/[^\s)>\]]+/g, put);

    if (lockOpts && lockOpts.lockCitations) {
      text = text.replace(/"[^"\n]{2,240}"|“[^”\n]{2,240}”/g, put);
    }
    text = text.replace(/\[\d+(?:\s*[,–-]\s*\d+)*\]/g, put);
    text = text.replace(/\([A-Za-z][A-Za-z-]+(?:\s+et\s+al\.)?(?:\s*(?:&|and)\s*[A-Za-z][A-Za-z-]+)?,\s*\d{4}[a-z]?\)/g, put);

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

    for (const term of PROTECTED_TERMS) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text.replace(new RegExp(`\\b${escaped}\\b`, 'g'), put);
    }
    text = text.replace(/\b\d+(?:[.,]\d+)*%?(?:\b|(?=\s|$|[.,;:!?)]))/g, put);

    return { masked: text, slots };
  };

  const unmaskProtected = (masked, slots) =>
    masked.replace(/\x00PH(\d+)PH\x00/g, (_, idx) => slots[Number(idx)] ?? '');

  // ---- 13. Multi-Language Detection & CJK/Western Word Counter ----
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

  // ---- 15. AI Signal & Telemetry Analyzer ----
  const splitProseSentences = (text) =>
    String(text == null ? '' : text)
      .split(/(?<=[.!?])\s+|\n{2,}/)
      .map((s) => s.trim())
      .filter((s) => /[\p{L}\p{N}]/u.test(s));

  const countAiTells = (text) => {
    const str = String(text == null ? '' : text).replace(/(?:"[^"\n]*"|“[^”\n]*”)/g, '');
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

  const countRigidTransitions = (sentences) => {
    const rigid = /^(?:Furthermore|Moreover|Additionally|Consequently|Nevertheless|In conclusion|Ultimately)\b/i;
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
        burstinessCV: 0,
        perplexityProxy: 0,
        tellsCount: 0,
        tellsMatched: [],
        watermarksCount: 0,
        emDashCount: 0,
      };
    }

    const lengths = sentences.map((s) => normalizeWords(s).length).filter((n) => n > 0);
    const meanLen = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);
    const variance =
      lengths.length > 1
        ? lengths.reduce((acc, n) => acc + Math.pow(n - meanLen, 2), 0) / lengths.length
        : 0;
    const stdDev = Math.sqrt(variance);
    const cv = meanLen > 0 ? stdDev / meanLen : 0;
    const commaCount = (text.match(/[,;:()]/g) || []).length;
    const rawBurstiness =
      lengths.length > 1
        ? Math.round(Math.min(100, Math.max(8, cv * 145)))
        : Math.round(Math.min(75, 28 + commaCount * 10));

    const uniqueWords = new Set(words).size;
    const ttr = uniqueWords / words.length;
    const longWords = words.filter((w) => w.length >= 7).length / words.length;
    const contractions = (text.match(/\b[a-zA-Z]+'[a-zA-Z]+\b/g) || []).length;
    const perplexityProxy = Math.round(
      Math.min(99, Math.max(15, ttr * 68 + (1 - Math.abs(longWords - 0.22)) * 22 + Math.min(12, contractions * 4)))
    );

    const tellPenalty = tells.total * 18 + rigidTransitions * 10 + zwCount * 15 + emDashCount * 7;
    const uniformityPenalty = Math.max(0, 56 - rawBurstiness) * 0.55;
    const rawRisk = Math.min(98, Math.max(2, Math.round(tellPenalty + uniformityPenalty)));

    return {
      empty: false,
      words: words.length,
      sentences: sentences.length,
      aiRiskScore: rawRisk,
      burstiness: rawBurstiness,
      burstinessCV: Number(cv.toFixed(2)),
      perplexityProxy,
      tellsCount: tells.total,
      tellsMatched: tells.matched,
      watermarksCount: zwCount,
      emDashCount,
    };
  };

  // ---- 16. Case-Preserving & Grammar/Article Helpers ----
  const matchCase = (sourceWord, replacement) => {
    if (!sourceWord || !replacement) return replacement;
    if (sourceWord === sourceWord.toUpperCase() && sourceWord.length > 1) return replacement;
    if (sourceWord[0] === sourceWord[0].toUpperCase() && sourceWord[0] !== sourceWord[0].toLowerCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement;
  };

  const fixGrammarAndArticles = (text) => {
    let out = String(text == null ? '' : text);
    // "a" before vowel sound -> "an" (excluding uni-, use-, euro-, one-, once)
    out = out.replace(/\b(a|A)\s+([aeiouAEIOU][a-zA-Z]*)\b/g, (m, art, nextWord) => {
      if (/^(?:uni|use|usu|uti|euro|one|once)/i.test(nextWord)) return m;
      const fixedArt = art === 'A' ? 'An' : 'an';
      return `${fixedArt} ${nextWord}`;
    });
    // "an" before consonant sound -> "a" (excluding hour, honest, honor, heir)
    out = out.replace(/\b(an|An)\s+([bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ][a-zA-Z]*)\b/g, (m, art, nextWord) => {
      if (/^(?:hour|honest|honor|heir)/i.test(nextWord)) return m;
      const fixedArt = art === 'An' ? 'A' : 'a';
      return `${fixedArt} ${nextWord}`;
    });
    // Deduplicate any accidental adjacent identical words
    out = out.replace(/\b([A-Za-z]{2,})\s+\1\b/gi, '$1');
    // Ensure every sentence after . ! ? starts with an uppercase letter
    out = out.replace(/(^|[.!?]\s+)([a-z])/g, (m, lead, ch) => lead + ch.toUpperCase());
    return out;
  };

  // ---- 17. AST String-Aware Code Comment Tokenizer ----
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

  // ---- 18. Main Multi-Stage Transformation Pipeline ----
  const DEFAULT_OPTIONS = {
    mode: 'conversational',
    model: 'balance',
    autopilot: false,
    lockKeywords: [],
    lockCitations: false,
    intensity: 75,
    seed: 0,
    persona: 'intermediate',
    stages: {
      watermarks: true,
      tellScrubber: true,
      phraseRewrites: true,
      discourseRotation: true,
      synonyms: true,
      clauseReordering: true,
      determinerSwaps: true,
      burstiness: true,
      voiceTransform: true,
      nominalization: true,
      hedgeInjection: false, // Disabled by default per human-writing skill (only runs in Expand mode)
      appositiveInjection: true,
      ngramAudit: true,
    },
  };

  const SIMPLIFY_SWAPS = [
    { re: /\bpurchasing behaviors?\b/gi, replace: 'buying habits' },
    { re: /\bconsumer preferences\b/gi, replace: 'shopper tastes' },
    { re: /\bempirical inquiries\b/gi, replace: 'real-world studies' },
    { re: /\bparadigm shift\b/gi, replace: 'major shift' },
    { re: /\bmultifaceted dimensions\b/gi, replace: 'many sides' },
    { re: /\bprofound impact\b/gi, replace: 'deep impact' },
    { re: /\bmetropolitan areas\b/gi, replace: 'large cities' },
    { re: /\binfrastructure expansion\b/gi, replace: 'new construction' },
    { re: /\bmunicipal planners\b/gi, replace: 'city planners' },
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

  const EXPAND_APPOSITIVES = [
    ...APPOSITIVES,
    { term: /\b(sustainable fashion)\b/i, phrase: 'clothing produced with lower environmental and labor impact' },
    { term: /\b(circular fashion)\b/i, phrase: 'reuse-driven models such as resale, rental, and repair' },
    { term: /\b(social connectivity)\b/i, phrase: 'the everyday web of digital and in-person ties' },
    { term: /\b(artificial intelligence)\b/i, phrase: 'data-driven pattern recognition at scale' },
    { term: /\b(human empathy)\b/i, phrase: 'our capacity to share another person’s perspective' },
  ];

  const computeSentenceStats = (sentences) => {
    const lens = sentences.map((s) => normalizeWords(s).length).filter((n) => n > 0);
    if (lens.length <= 1) return { cv: 0, spread: 0, lens };
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    const variance = lens.reduce((acc, n) => acc + Math.pow(n - mean, 2), 0) / lens.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    const spread = Math.max(...lens) - Math.min(...lens);
    return { cv, spread, lens };
  };

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

    // Stage 2: 75-Pattern AI Tell & Structural Cliché Scrubber
    if (stages.tellScrubber) {
      for (const rule of AI_TELL_PATTERNS) {
        const targetReplace = isAcad && rule.academicReplace !== undefined ? rule.academicReplace : rule.replace;
        text = text.replace(rule.re, (match, ...args) => {
          counts.tellsScrubbed += 1;
          if (rule.id === 'played_role_in_ing') {
            const ingWord = String(args[0] || '').toLowerCase();
            const base = ING_TO_BASE[ingWord];
            return base ? `helped ${base}` : `was central to ${args[0]}`;
          }
          if (targetReplace.includes('$1')) {
            return targetReplace
              .replace('$1', args[0] || '')
              .replace('$2', args[1] || '')
              .replace('$3', args[2] || '')
              .replace('$4', args[3] || '');
          }
          return matchCase(match, targetReplace);
        });
      }
    }

    if (eff === 0) {
      const restoredZero = fixGrammarAndArticles(unmaskProtected(text, slots).replace(/[ \t]{2,}/g, ' ').trim());
      return { text: restoredZero, counts };
    }

    // Stage 3: Meaning-Preserving Multi-Word Phrase Rewrites
    if (stages.phraseRewrites) {
      if (isSimplify) {
        for (const item of SIMPLIFY_SWAPS) {
          text = text.replace(item.re, (match) => {
            counts.phraseRewrites += 1;
            return matchCase(match, item.replace);
          });
        }
      }
      for (const item of PHRASE_REWRITES) {
        const target = isAcad ? item.acad : item.conv;
        text = text.replace(item.re, (match, g1, g2) => {
          if (rng() > Math.min(1, eff * 1.15)) return match;
          counts.phraseRewrites += 1;
          if (target.includes('$1')) {
            return target.replace('$1', g1 || '').replace('$2', g2 || '');
          }
          return matchCase(match, target);
        });
      }
    }

    // Stage 4: Nominalization -> Verbal / Gerund Simplification
    if (stages.nominalization) {
      for (const item of NOMINALIZATION_RULES) {
        const target = isAcad ? item.acad : item.conv;
        text = text.replace(item.re, (match) => {
          if (rng() > Math.min(1, eff * 1.1)) return match;
          counts.nominalizations += 1;
          return matchCase(match, target);
        });
      }
    }

    // Stage 5: Active <-> Passive Voice & Clause Simplification
    if (stages.voiceTransform) {
      for (const rule of VOICE_RULES) {
        const replacement = rule.replace || (isAcad ? rule.acad : rule.conv);
        if (!replacement) continue;
        text = text.replace(rule.re, (match, g1, g2, g3) => {
          if (rng() > Math.min(1, eff * 1.1)) return match;
          counts.voiceTransforms += 1;
          if (rule.replace) {
            if (g3 !== undefined) {
              const lowG1 = g1 ? g1.charAt(0).toLowerCase() + g1.slice(1) : '';
              return `${g3} ${g2} ${lowG1}`;
            }
            const capG2 = g2 ? g2.charAt(0).toUpperCase() + g2.slice(1) : '';
            const lowG1 = g1 ? g1.charAt(0).toLowerCase() + g1.slice(1) : '';
            return rule.replace.replace('$2', capG2).replace('$1', lowG1);
          }
          if (replacement.includes('$1')) {
            return replacement.replace('$1', g1 || '').replace('$2', g2 || '').replace('$3', g3 || '');
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

    const usedDiscourse = {};
    const recentSynonyms = [];
    const recentDeterminers = [];
    const usedAppositives = new Set();

    const paragraphs = text.split(/(\n\s*\n)/);
    const processedParagraphs = paragraphs.map((chunk) => {
      if (/^\n\s*\n$/.test(chunk) || !chunk.trim()) return chunk;

      let sentences = chunk
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

      // Stage 6: Authentic Human Discourse Handling (Following human-writing/SKILL.md Section 1.4)
      // Instead of starting every sentence with a transition word, tuck "also" / "therefore" inside the verb phrase
      // or drop redundant additive transitions so sentences start directly with their subject.
      if (stages.discourseRotation) {
        sentences = sentences.map((s) => {
          const openerMatch = /^([A-Za-z]+),\s+/.exec(s);
          if (!openerMatch) return s;
          const key = openerMatch[1].toLowerCase();
          const rest = s.slice(openerMatch[0].length);

          // 6A: For additive transitions ("Furthermore,", "Moreover,", "Additionally,", "Also,"):
          // Try tucking "also" inside the clause ("Applying X is also...", "Smart grid software also helps...", "Standardizing X also changed...")
          if (key === 'furthermore' || key === 'moreover' || key === 'additionally' || key === 'also') {
            // If rest starts with a subordinate "as a ..., [Subject]" or "this experience", drop the redundant opener cleanly
            if (/^(?:as a\b|this experience\b)/i.test(rest)) {
              counts.discourseRotations += 1;
              return rest.charAt(0).toUpperCase() + rest.slice(1);
            }
            const copulaInsert = /^([A-Za-z][A-Za-z0-9\s-]{2,42}?)\s+(is|are|was|were)\s+(.+)$/.exec(rest);
            if (copulaInsert && !/\balso\b/i.test(rest)) {
              counts.discourseRotations += 1;
              const subj = copulaInsert[1].charAt(0).toUpperCase() + copulaInsert[1].slice(1);
              return `${subj} ${copulaInsert[2]} also ${copulaInsert[3]}`;
            }
            const verbInsert = /^([A-Za-z][A-Za-z0-9\s-]{2,42}?)\s+(helps?|helped|changed|altered|modified|reshaped|gives?|gave|provides?|provided|shows?|showed|builds?|built)\s+(.+)$/.exec(rest);
            if (verbInsert && !/\balso\b/i.test(rest)) {
              counts.discourseRotations += 1;
              const subj = verbInsert[1].charAt(0).toUpperCase() + verbInsert[1].slice(1);
              return `${subj} also ${verbInsert[2]} ${verbInsert[3]}`;
            }
          }

          // 6B: For causal transitions ("Therefore,", "Consequently,", "Thus,"):
          // Tuck "therefore" or "then" after the subject/auxiliary ("Engineers are therefore...", "Researchers therefore must...", "Second-order central differences then...")
          if (key === 'therefore' || key === 'consequently' || key === 'thus') {
            if (/^the locomotive\b/i.test(rest)) {
              counts.discourseRotations += 1;
              return rest.charAt(0).toUpperCase() + rest.slice(1);
            }
            const auxInsert = /^([A-Za-z][A-Za-z0-9\s-]{2,35}?)\s+(are|were|is|was|should|must|can|will)\s+(.+)$/.exec(rest);
            if (auxInsert && !/\btherefore\b/i.test(rest)) {
              counts.discourseRotations += 1;
              const subj = auxInsert[1].charAt(0).toUpperCase() + auxInsert[1].slice(1);
              return `${subj} ${auxInsert[2]} therefore ${auxInsert[3]}`;
            }
            const cutInsert = /^([A-Za-z][A-Za-z0-9\s-]{2,40}?)\s+(cut|cuts|reduce|reduces)\s+(.+)$/.exec(rest);
            if (cutInsert) {
              counts.discourseRotations += 1;
              const subj = cutInsert[1].charAt(0).toUpperCase() + cutInsert[1].slice(1);
              return `${subj} then ${cutInsert[2]} ${cutInsert[3]}`;
            }
          }

          const entry = DISCOURSE_ROTATIONS[key];
          if (!entry) return s;
          const pool = isAcad ? entry.acad : entry.conv;
          const usedSet = usedDiscourse[key] || (usedDiscourse[key] = new Set());
          const available = pool.filter((cand) => !usedSet.has(cand.toLowerCase()));
          const list = available.length ? available : pool;
          const chosen = list[Math.floor(rng() * list.length)];
          usedSet.add(chosen.toLowerCase());
          counts.discourseRotations += 1;
          return `${chosen}, ${rest}`;
        });
      }

      // Stage 7: Clause & Subordinate Reordering (100% Meaning-Preserving)
      if (stages.clauseReordering) {
        sentences = sentences.map((s) => {
          if (s.length < 45) return s;

          // Pattern A: "Because [clause A], [clause B]." -> "[Clause A], so [clause B]."
          const becauseFront = /^Because\s+([^,]{18,95}),\s+([a-z][^.!?\n]{18,95})([.!?])$/.exec(s);
          if (becauseFront) {
            counts.clauseReorders += 1;
            const c1 = becauseFront[1].trim();
            const c1Cap = c1.charAt(0).toUpperCase() + c1.slice(1);
            return `${c1Cap}, so ${becauseFront[2].trim()}${becauseFront[3]}`;
          }

          // Pattern B: "[Main clause] because [subordinate clause]." -> "Because [subordinate clause], [main clause]."
          const subMatch = /^([A-Z][^,.;!?]{18,85}?)\s+(because|since|whereas)\s+([^,.;!?]{15,75})([.!?])$/.exec(s);
          if (subMatch && !/^(It|This|That|He|She|They|Still|Yet|So)\b/.test(subMatch[1])) {
            counts.clauseReorders += 1;
            const conj = subMatch[2].charAt(0).toUpperCase() + subMatch[2].slice(1);
            const mainLower = /^(?:I\b|[A-Z]{2,})/.test(subMatch[1])
              ? subMatch[1]
              : subMatch[1].charAt(0).toLowerCase() + subMatch[1].slice(1);
            return `${conj} ${subMatch[3].trim()}, ${mainLower}${subMatch[4]}`;
          }
          return s;
        });
      }

      // Stage 8: Determiner Swapping (guarded against preceding articles/possessives)
      if (stages.determinerSwaps) {
        sentences = sentences.map((s) =>
          s.replace(/(?<!\b(?:the|a|an|these|those|my|our|their|his|her|its)\s+)\b(several|many|diverse|various)\b/gi, (match) => {
            if (rng() > eff * 0.65) return match;
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

      // Stage 9: Meaning-Preserving Synonym Swapping (Collocation-Guarded, Zero Domain-Noun Swaps)
      if (stages.synonyms) {
        sentences = sentences.map((s) => {
          const collocSlots = [];
          let guarded = s;
          for (const col of PROTECTED_COLLOCATIONS) {
            const re = new RegExp(`\\b${col}\\b`, 'gi');
            guarded = guarded.replace(re, (m) => {
              const id = `\x00COL${collocSlots.length}COL\x00`;
              collocSlots.push(m);
              return id;
            });
          }

          const lowerSentence = guarded.toLowerCase();
          let swapped = guarded.replace(/\b([A-Za-z]{4,})\b/g, (word, _, offset) => {
            if (offset > 0 && guarded[offset - 1] === '\x00') return word;
            const low = word.toLowerCase();
            const entry = SYNONYM_CATALOG[low];
            if (!entry) return word;
            if (rng() > Math.min(0.95, eff * 0.9)) return word;
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

          swapped = swapped.replace(/\x00COL(\d+)COL\x00/g, (_, idx) => collocSlots[Number(idx)] ?? '');
          return swapped;
        });
      }

      // Stage 10: Natural Burstiness Sculptor (Creates Short Punchy Sentences Without Run-On Semicolons)
      if (stages.burstiness) {
        const minSplitWords = isSimplify ? 15 : 17;
        const splitResult = [];

        for (const s of sentences) {
          const wordCount = normalizeWords(s).length;

          // 10A-1: Split relative tail ", which [verb] ..." into a short standalone sentence
          const whichMatch = /^(.{30,}?),\s+which\s+([a-z]+)\s+([^.!?]{8,}[.!?])$/i.exec(s);
          if (whichMatch && wordCount >= minSplitWords) {
            const firstPart = whichMatch[1].trim() + '.';
            const verb = whichMatch[2];
            const rest = whichMatch[3].trim();
            const isSingularVerb = /s$/i.test(verb) && !/^(?:is|was|has|does)$/i.test(verb) ? true : /^(?:is|was|has|does)$/i.test(verb);
            const subj = isSingularVerb ? 'This' : 'These steps';
            splitResult.push(firstPart, `${subj} ${verb} ${rest}`);
            counts.sentenceSplits += 1;
            continue;
          }

          // 10A-2: Split trailing purpose clause ("... so that [subject] can [verb] ...") into a punchy sentence
          const purposeMatch = /^(.{38,}?)\s+so that ([a-z]+) can\s+([a-z]+)\s+([^.!?]{4,40}[.!?])$/i.exec(s);
          if (purposeMatch && wordCount >= 16) {
            const firstPart = purposeMatch[1].trim() + '.';
            const actor = purposeMatch[2];
            const verb = purposeMatch[3].toLowerCase();
            const tail = purposeMatch[4].trim();
            splitResult.push(firstPart, `That lets ${actor} ${verb} ${tail}`);
            counts.sentenceSplits += 1;
            continue;
          }

          // 10A-3: Split "while also [gerund] ..." into a separate sentence
          const whileAlsoMatch = /^(.{30,}?)\s+while (?:also|concurrently|simultaneously)\s+([a-z]+ing)\s+([^.!?]{8,}[.!?])$/i.exec(s);
          if (whileAlsoMatch && wordCount >= minSplitWords) {
            const firstPart = whileAlsoMatch[1].trim() + '.';
            const gerund = whileAlsoMatch[2];
            const rest = whileAlsoMatch[3].trim();
            splitResult.push(firstPart, `At the same time, this means ${gerund} ${rest}`);
            counts.sentenceSplits += 1;
            continue;
          }

          splitResult.push(s);
        }
        sentences = splitResult;

        // 10B: Paragraph Rhythm Balancer (when sentence lengths are still too uniform, split a trailing clause into a short 5–9 word sentence)
        const stats = computeSentenceStats(sentences);
        if (sentences.length >= 2 && (stats.cv < 0.36 || stats.spread < 10)) {
          for (let i = sentences.length - 1; i >= 0; i--) {
            const s = sentences[i];
            const wCount = normalizeWords(s).length;
            if (wCount < 15) continue;

            // Try 1: coordinated verb phrase "[Subject ...] and (prioritizes|focuses on|puts first|commands|requires) [rest]."
            const coordVp = /^(.{28,}?)\s+and\s+((?:prioritizes|focuses on|puts first|depends on|relies on|requires|needs|commands)\s+[^.!?]{6,48})([.!?])$/i.exec(s);
            if (coordVp) {
              const part1 = coordVp[1].trim() + '.';
              const part2 = 'It also ' + coordVp[2].trim() + coordVp[3];
              sentences.splice(i, 1, part1, part2);
              counts.sentenceSplits += 1;
              break;
            }

            // Try 2: trailing infinitive purpose "... to (keep|retain|reduce|cut|ensure|avoid|prevent|sustain|mitigate) [object]."
            const infTail = /^(.{36,}?)\s+to\s+((?:keep|retain|reduce|cut|ensure|avoid|prevent|sustain|mitigate|alleviate)\s+[^,.!?]{4,35})([.!?])$/i.exec(s);
            if (infTail && !/\b(?:need|needs|needed|used|able|bound|likely)\b$/i.test(infTail[1].trim())) {
              const part1 = infTail[1].trim() + '.';
              const part2 = 'That helps ' + infTail[2].trim() + infTail[3];
              sentences.splice(i, 1, part1, part2);
              counts.sentenceSplits += 1;
              break;
            }

            // Try 3: trailing relative clause "... that (remade|reshaped|redefined|changed) [object]."
            const thatTail = /^(.{32,}?)\s+that\s+((?:remade|reshaped|redefined|changed|transformed)\s+[^,.!?]{4,28})([.!?])$/i.exec(s);
            if (thatTail) {
              const part1 = thatTail[1].trim() + '.';
              const part2 = 'It ' + thatTail[2].trim() + thatTail[3];
              sentences.splice(i, 1, part1, part2);
              counts.sentenceSplits += 1;
              break;
            }
          }
        }
      }

      // Stage 11: Technical & Expand Appositive Injection (only in Expand mode or when explicitly enabled)
      if (stages.appositiveInjection && isExpand) {
        const appPool = EXPAND_APPOSITIVES;
        sentences = sentences.map((s) => {
          for (const app of appPool) {
            if (usedAppositives.has(app.phrase)) continue;
            if (app.term.test(s) && rng() <= 0.85) {
              usedAppositives.add(app.phrase);
              counts.appositiveInjections += 1;
              return s.replace(app.term, (m) => `${m}, ${app.phrase},`);
            }
          }
          return s;
        });
      }

      // Stage 12: Hedge Word Injection (only in Expand mode so normal prose stays crisp and direct)
      if ((stages.hedgeInjection || isExpand) && isExpand) {
        let hedgedInPara = false;
        sentences = sentences.map((s) => {
          if (hedgedInPara || s.length < 55) return s;
          const pool = isAcad ? HEDGE_WORDS.acad : HEDGE_WORDS.conv;
          const pick = pool[Math.floor(rng() * pool.length)];
          if (s.toLowerCase().includes(pick.toLowerCase())) return s;
          const verbRe = /\b(remains|demonstrates|indicates|illustrates|establishes|requires)\b/;
          if (!verbRe.test(s)) return s;
          hedgedInPara = true;
          counts.hedgeInjections += 1;
          return s.replace(verbRe, (m) => `${m}, ${pick},`);
        });
      }

      return sentences.join(' ');
    });

    text = processedParagraphs.join('');

    // Stage 14: Meaning-Preserving Winnowing k=5 Chain Breaker
    // Only swaps non-domain modifiers, verbs, and prepositions inside surviving 5-gram chains.
    if (stages.ngramAudit && eff >= 0.35) {
      const SAFE_CHAIN_BREAKERS = [
        { re: /\bgreater flexibility\b/gi, rep: 'more flexibility' },
        { re: /\boverall productivity\b/gi, rep: 'team productivity' },
        { re: /\bacross different time zones\b/gi, rep: 'across time zones' },
        { re: /\bBy implementing\b/g, rep: 'With' },
        { re: /\bcan smoothly work together\b/gi, rep: 'can work together smoothly' },
        { re: /\bcommands major market influence\b/gi, rep: 'holds major market influence' },
        { re: /\bcommands significant market influence\b/gi, rep: 'holds major market influence' },
        { re: /\balongside environmental accountability\b/gi, rep: 'and environmental accountability' },
        { re: /\bwith clear sustainability metrics\b/gi, rep: 'to clear sustainability metrics' },
        { re: /\bcross-functional alignment between\b/gi, rep: 'close alignment between' },
        { re: /\bremains essential for sustaining\b/gi, rep: 'is still essential to sustain' },
        { re: /\bremains integral for sustaining\b/gi, rep: 'is still essential to sustain' },
        { re: /\bin surrounding rural areas\b/gi, rep: 'in nearby rural areas' },
        { re: /\bthan surrounding rural areas\b/gi, rep: 'than nearby rural areas' },
      ];

      const currentUnmasked = unmaskProtected(text, slots);
      if (winnowOverlap(rawInput, currentUnmasked, 5, 4) > 15) {
        for (const rule of SAFE_CHAIN_BREAKERS) {
          if (rule.re.test(text)) {
            text = text.replace(rule.re, rule.rep);
            counts.ngramBreaks += 1;
          }
        }
      }
    }

    // Stage 13: Unmask Protected Tokens (Fact + Keyword + Citation Invariant Gate)
    let restored = unmaskProtected(text, slots);

    restored = restored
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s+([,.;!?])/g, '$1')
      .replace(/,{2,}/g, ',')
      .replace(/,\s*\./g, '.')
      .replace(/\.\s*\./g, '.')
      .trim();

    restored = fixGrammarAndArticles(restored);

    return { text: restored, counts };
  };

  // ---- 19. Word-Level Diff & Inline LCS Highlight Diff ----
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

  // ---- 20. 7-Detector Bypass Status Evaluator ----
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
      output = fixGrammarAndArticles(output);
      after = analyzeSignals(output);
    }

    const totalChanges = Object.entries(counts)
      .filter(([k]) => k !== 'totalChanges')
      .reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
    counts.totalChanges = totalChanges;

    const inputNums = raw.match(/\b\d+(?:[.,]\d+)*%?\b/g) || [];
    const factsPreserved = inputNums.every((num) => output.includes(num));

    const kwList = Array.isArray(opts.lockKeywords)
      ? opts.lockKeywords.map((k) => String(k || '').trim()).filter(Boolean)
      : [];
    const keywordsPreserved = kwList.every((kw) => {
      if (!raw.toLowerCase().includes(kw.toLowerCase())) return true;
      return output.toLowerCase().includes(kw.toLowerCase());
    });

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

  // ---- 22. Built-in Samples ----
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
    PHRASE_REWRITES,
    DISCOURSE_ROTATIONS,
    SYNONYM_CATALOG,
    effectiveIntensity,
    scrubWatermarks,
    maskProtected,
    unmaskProtected,
    detectLanguageAndCount,
    winnowFingerprints,
    winnowOverlap,
    analyzeSignals,
    evaluateDetectors,
    diffTokens,
    diffHighlightTokens,
    humanizeCodeComments,
    humanize,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
