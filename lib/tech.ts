// Mirror of TECH_VOCAB / extract_technologies in worker/pipeline/normalize.py. Keep in sync.
export const TECH_VOCAB = ["Python", "Java", "C++", "C#", "C", "Rust", "Go", "Golang", "Kotlin", "Swift", "Scala", "TypeScript", "JavaScript", "React",
  "Node.js", "SQL", "PostgreSQL", "MySQL", "Redis", "Kafka", "Spark", "Hadoop", "AWS", "GCP", "Azure", "Kubernetes", "Docker", "Terraform", "Linux",
  "TCP/IP", "networking", "distributed systems", "multithreading", "low latency", "PyTorch", "TensorFlow", "CUDA", "OCaml", "Haskell", "KDB", "Pandas",
  "NumPy", "machine learning", "deep learning", "FPGA", "GraphQL", "gRPC"];
const CASE_SENSITIVE = new Set(["C", "Go", "Swift", "Rust"]);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");

export function extractTech(text: string): string[] {
  const out = TECH_VOCAB.filter((t) => new RegExp(`(?<![\\w+#])${esc(t)}(?![\\w+#])`, CASE_SENSITIVE.has(t) ? "" : "i").test(text));
  return out.includes("Golang") && out.includes("Go") ? out.filter((t) => t !== "Golang") : out;
}
