/**
 * zod contracts for model output. A response that fails parsing stops the
 * run; the pipeline never reads unchecked model JSON.
 */

import { z } from "zod";

export const AnalyseOutput = z.object({
  procedures_ko: z.array(z.string()).default([]),
  doctor_mentions_ko: z.array(z.string()).default([]),
});

export const TranslateOutput = z.object({
  summary_en: z.string(),
});

export const AssociateOutput = z.object({
  doctor_id: z.string().nullable(),
  quote: z.string().nullable(),
  status: z.enum(["supported", "unresolved"]),
});

export type AnalyseOutput = z.infer<typeof AnalyseOutput>;
export type TranslateOutput = z.infer<typeof TranslateOutput>;
export type AssociateOutput = z.infer<typeof AssociateOutput>;
