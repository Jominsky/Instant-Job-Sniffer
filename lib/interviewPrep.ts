/** Interview-prep checklists, generated deterministically from the application stage, the role and the technologies in the posting.
 *  These are general study topics, not claims about any company's process. Nothing is sent anywhere. */
export type PrepSection = { title: string; items: string[] };

const TECH_TOPICS: Record<string, string[]> = {
  "C++": ["C++: RAII, move semantics, smart pointers, the STL containers and their complexity, undefined behaviour you should avoid"],
  Python: ["Python: generators, list/dict comprehensions, the GIL and what it means for threads, time/space complexity of built-ins"],
  Java: ["Java: collections and their complexity, equals/hashCode, concurrency basics (synchronized, executors)"],
  Rust: ["Rust: ownership and borrowing, lifetimes, Result/Option error handling"],
  Go: ["Go: goroutines and channels, slices vs arrays, error handling idioms"],
  Linux: ["Linux: processes vs threads, file descriptors, pipes, basic shell and debugging tools"],
  SQL: ["SQL: joins, GROUP BY / HAVING, indexes, window functions, how to read a query plan"],
  PostgreSQL: ["PostgreSQL: indexes, transactions and isolation levels, EXPLAIN"],
  Kafka: ["Kafka: topics, partitions, consumer groups, delivery guarantees"],
  Kubernetes: ["Kubernetes: pods, deployments, services, how a rolling update works"],
  Docker: ["Docker: images vs containers, layers, networking basics"],
  "distributed systems": ["Distributed systems: consistency vs availability, replication, idempotency, retries and timeouts"],
  networking: ["Networking: TCP vs UDP, what happens when you open a URL, latency vs throughput"],
  "TCP/IP": ["TCP/IP: handshake, congestion control basics, ports and sockets"],
  multithreading: ["Concurrency: race conditions, locks vs atomics, deadlock and how to avoid it"],
  "low latency": ["Low latency: cache locality, avoiding allocation on hot paths, measuring with profilers"],
  PyTorch: ["PyTorch: tensors and autograd, a training loop end to end, common sources of bugs"],
  TensorFlow: ["TensorFlow: graphs vs eager mode, a training loop end to end"],
  "machine learning": ["Machine learning: bias/variance, overfitting and regularisation, train/validation/test splits, common metrics"],
  Statistics: ["Statistics: distributions, expectation and variance, hypothesis tests, regression assumptions"],
  FPGA: ["FPGA: what is gained over software, pipelining, timing basics"],
  CUDA: ["CUDA: threads/blocks/grids, memory hierarchy, why coalesced access matters"],
  React: ["React: component state and props, effects, rendering and keys"],
  TypeScript: ["TypeScript: structural typing, generics, union types and narrowing"],
};

const ROLE_TOPICS: Record<string, string[]> = {
  QUANT_TRADING: ["Probability and expected value puzzles, conditional probability, Bayes", "Mental arithmetic under time pressure", "Market-making and betting games: reasoning about edge and risk"],
  QUANT_RESEARCH: ["Probability and statistics fundamentals", "Linear algebra and regression", "Explaining a past research or modelling project clearly"],
  QUANT_DEVELOPER: ["Data structures and algorithms in your strongest language", "Writing clean, fast, testable code", "Basic probability and numerical pitfalls (floating point)"],
  ML_AI: ["ML fundamentals and evaluation", "Walking through a model you built: data, features, results, failures"],
  DATA_ENGINEERING: ["SQL fluency", "Data modelling and pipelines: batch vs streaming, idempotent jobs"],
  INFRASTRUCTURE: ["Operating systems and networking basics", "Reliability: monitoring, rollbacks, failure modes"],
  DEVOPS_SRE: ["Linux and networking basics", "Incident response and what you would monitor"],
  DISTRIBUTED_SYSTEMS: ["Consensus, replication and partition tolerance at a conceptual level"],
  SWE: ["Arrays, strings, hash maps, trees, graphs, heaps; know each one's complexity", "Recursion, two pointers, sliding window, BFS/DFS, basic dynamic programming"],
  BACKEND: ["Data structures and algorithms", "REST APIs, databases and caching at a conceptual level"],
  FRONTEND: ["JavaScript fundamentals: closures, async, the event loop", "How the browser renders a page"],
  FULL_STACK: ["Data structures and algorithms", "A request's full path from browser to database and back"],
  SECURITY: ["Common web vulnerabilities (injection, XSS, CSRF) and how each is prevented", "Cryptography basics: hashing vs encryption, TLS"],
};

const STAGE_ITEMS: Record<string, PrepSection> = {
  PRE: { title: "Before you apply", items: ["Re-read the posting and tick off each requirement you can honestly show", "Pick the résumé version that best matches the technologies listed", "Check the application deadline and any eligibility lines (graduation year, work authorisation)"] },
  OA: { title: "Online assessment", items: ["Do a timed practice set in the language you will use", "Check the platform's rules: allowed languages, calculator, webcam", "Read each question fully before coding; handle edge cases (empty input, duplicates, large values)", "Submit well before the deadline, not at the last minute"] },
  SCREEN: { title: "Recruiter screen", items: ["Prepare a 60-second introduction: who you are, what you have built, why this role", "Know your graduation date, availability and location preferences", "Prepare two or three questions about the team and the internship programme", "Have your salary and visa answers ready, stated honestly"] },
  TECH: { title: "Technical interview", items: ["Practise out loud: restate the problem, give an example, talk through your approach before coding", "State time and space complexity for every solution", "Test with a small example by hand once the code is written", "Be ready to walk through a project from your résumé in depth"] },
  FINAL: { title: "Final round", items: ["Prepare behavioural stories (a challenge, a disagreement, a failure, a project you led) in situation-action-result form", "Review the technical topics below once more", "Prepare thoughtful questions for each interviewer", "Plan the logistics: time zone, link or address, a quiet space, a charged laptop"] },
  OFFER: { title: "Offer", items: ["Read the full offer: start date, location, pay and its unit, any conditions", "Note the response deadline and ask for more time politely if you need it", "Update the tracker and tell other companies in your pipeline if your timeline changes"] },
};

const STAGE_OF: Record<string, keyof typeof STAGE_ITEMS> = {
  DISCOVERED: "PRE", INTERESTED: "PRE", SAVED: "PRE", APPLYING: "PRE", APPLIED: "PRE",
  OA_RECEIVED: "OA", OA_COMPLETED: "SCREEN", RECRUITER_SCREEN: "SCREEN", TECHNICAL_INTERVIEW: "TECH", FINAL_ROUND: "FINAL", OFFER: "OFFER",
};

export function interviewPrep(input: { status: string; role: string; technologies: string[] }): PrepSection[] {
  const stage = STAGE_OF[input.status];
  if (!stage) return [];                                     // rejected / withdrawn: nothing to prepare
  const sections: PrepSection[] = [STAGE_ITEMS[stage]];
  if (stage === "OA" || stage === "TECH" || stage === "FINAL" || stage === "SCREEN" && input.status === "OA_COMPLETED") {
    const roleItems = ROLE_TOPICS[input.role] ?? ROLE_TOPICS.SWE;
    sections.push({ title: "Topics to review for this role", items: roleItems });
    const techItems = input.technologies.flatMap((t) => TECH_TOPICS[t] ?? []);
    if (techItems.length) sections.push({ title: "Technologies in the posting", items: techItems });
  }
  return sections;
}
