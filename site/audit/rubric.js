// The Vibe Code Audit: the questions teams answer and the rubric the Auditor reads them against.
// One source for both: the page shows it to students, and the worker sends it to the AI.
// Sections and questions parallel the assessment template exactly (A–D, same order, same labels).

export const SECTIONS = [
  { id: "A", title: "Design Intent" },
  { id: "B", title: "Unpacking" },
  { id: "C", title: "Effectuating Alternatives" },
  { id: "D", title: "Iteratively Coding, Testing, Debugging" },
];

export const QUESTIONS = [
  { id: "A1", section: "A", label: "The experiment",
    question: "What are you finding out with this app, and why is it a good vehicle for finding that out?",
    look_for: [
      "States the hypotheses and assumptions being tested, in testable form",
      "Says why this app is a good vehicle for finding that out, vs. something cheaper",
      "Early-user voices (real or hypothetical)",
      "An exec who doesn't expect most things to fail could follow it",
    ] },
  { id: "A2", section: "A", label: "Persona, JTBD, situation",
    question: "Who is this for, and what are they doing right before they reach for it?",
    look_for: [
      "Persona in a specific situation, not demographics",
      "JTBD is a need or habit, not a solution; current alternative named",
    ] },
  { id: "A3", section: "A", label: "Goals and user stories",
    question: "What goals does the user have and how do we help them achieve those goals?",
    look_for: [
      "Stories have all three clauses and don't prescribe the implementation",
      "Each key story has an observable OEC",
      "Key stories unpacked into Given-When-Then, including one non-happy path",
    ] },
  { id: "A4", section: "A", label: "Testing with users (Optional)", optional: true,
    question: "What testing have you done with users? What surprised you?",
    look_for: [
      "Describes testing with real or classmate users",
      "Says what surprised them and what they did about it",
    ] },
  { id: "B1", section: "B", label: "Key MVC components",
    question: "What MVC components are the key to this UX? How do they work? Are they internal to a single MVC? If not, what are the key integration points?",
    look_for: [
      "Names the components that carry the UX and how they work",
      "Says whether they sit inside one MVC; if not, names the integration points",
    ] },
  { id: "B2", section: "B", label: "Key UIs and comparables",
    question: "What are the key UIs and what comparables are most relevant?",
    look_for: [
      "Key UIs fit the user's real context (device, setting, attention)",
      "2–3 comps with similar affordances, compared affordance by affordance",
    ] },
  { id: "B3", section: "B", label: "Model entities",
    question: "What are the key Model entities and how are they represented in the Model?",
    look_for: [
      "Key entities and their relationships (has-a / is-a)",
      "How they're represented and stored",
    ] },
  { id: "B4", section: "B", label: "Big-hitter algorithms",
    question: "What are the big-hitter algorithms and how do they work?",
    look_for: [
      "How they work, in plain terms, traced to stories",
      "Main case plus edge and corner cases, and which are handled",
    ] },
  { id: "C1", section: "C", label: "Stack choices",
    question: "What stack choices did you make and why? (Platform for rapid experimentation? Cointegration with an existing technology portfolio? Extension of existing UXs on existing MVC?)",
    look_for: [
      "Rationale against rapid experimentation, cointegration with the existing portfolio, and extension of existing UXs/MVC",
      "Standard classes/frameworks where they fit; bespoke UI flagged",
    ] },
  { id: "C2", section: "C", label: "Third-party packages and APIs",
    question: "What, if any, third-party packages or APIs did you use? Or create for your customers?",
    look_for: [
      "What they used (or offer) and why borrow vs. build",
    ] },
  { id: "C3", section: "C", label: "Integration points",
    question: "What are the key integration points for this app, and how does that integration happen?",
    look_for: [
      "Named, with how the integration happens (API, file, event, plug-in)",
    ] },
  { id: "D1", section: "D", label: "Demo and happy path",
    question: "How does it work/demo? How do the testable UX rewards and observable user behaviors line up in that happy path?",
    look_for: [
      "Demo walks the happy path",
      "UX rewards and OECs line up with observable user behavior along it",
    ] },
  { id: "D2", section: "D", label: "Data",
    question: "What data do you create and keep, and what could you use instead?",
    look_for: [
      "Doesn't create or keep more than the stories need",
      "Considered richer sources (email, calendar, existing accounts) and who ends up holding the data",
    ] },
  { id: "D3", section: "D", label: "Change path and observability",
    question: "How does a change get to users, and how would you know it broke?",
    look_for: [
      "Deploy path described; tests run in the pipeline",
      "A way to know it broke, tied to stories/OECs",
    ] },
];

export const STATUSES = {
  good: "In good shape",
  work: "Needs some work",
  missing: "Missing",
};

// The engineering ideas the course carries across layers; recommendations from reading the code cite these.
export const ENGINEERING_IDEAS = ["DRY", "separation of concerns", "dependency direction", "readability", "determinism"];
