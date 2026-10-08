import { z } from "zod";
import { RuleSchema } from "@/lib/rules";

export const AlertBody = z.object({
  name: z.string().trim().min(1).max(80), ruleJson: RuleSchema,
  channels: z.array(z.enum(["EMAIL", "BROWSER", "PUSH", "SMS", "DISCORD", "SLACK"])).min(1).max(6),
  frequency: z.enum(["IMMEDIATE", "HOURLY", "MORNING", "EVENING"]), watchlistId: z.string().max(40).nullable().optional(), isActive: z.boolean().optional(),
});

const optStr = (n: number) => z.string().trim().max(n).nullable().optional();
export const ContactBody = z.object({
  name: z.string().trim().min(1).max(120), companyId: z.string().max(40).nullable().optional(), position: optStr(120),
  linkedinUrl: z.string().trim().url().max(300).nullable().optional().or(z.literal("")), email: z.string().trim().email().max(200).nullable().optional().or(z.literal("")),
  phone: optStr(40), alumniConnection: z.boolean().optional(), schoolConnection: z.boolean().optional(), fraternityConnection: z.boolean().optional(),
  referralRequested: z.boolean().optional(), referralReceived: z.boolean().optional(), lastContactedAt: z.string().max(40).nullable().optional(), notes: optStr(5000),
});
