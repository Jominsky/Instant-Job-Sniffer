import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/session";
import { ResumesManager } from "@/components/ResumesManager";
import { AnswersManager } from "@/components/AnswersManager";

export default async function Resumes() {
  const userId = await requireUserId();
  const [resumes, answers] = await Promise.all([
    prisma.resume.findMany({ where: { userId }, select: { id: true, label: true, skills: true, isDefault: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
    prisma.savedAnswer.findMany({ where: { userId }, select: { id: true, question: true, answer: true, tags: true }, orderBy: { updatedAt: "desc" } }),
  ]);
  return (
    <div className="page space-y-8">
      <div><h1 className="h1">Résumés</h1><ResumesManager resumes={JSON.parse(JSON.stringify(resumes))} /></div>
      <div className="space-y-3"><h1 className="h1">Saved answers</h1><AnswersManager answers={answers} /></div>
    </div>
  );
}
