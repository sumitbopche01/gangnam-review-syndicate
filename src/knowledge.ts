/**
 * Alias tables. A hit means the Korean string matched this table.
 * It does not mean the clinic or doctor was license-checked.
 */

import type { Clinic, Procedure, ProcedureHit } from "./types.ts";

export const PROCEDURES: Procedure[] = [
  { id: "rhinoplasty", labelEn: "rhinoplasty", aliases: ["코성형"] },
  { id: "double_eyelid", labelEn: "double eyelid", aliases: ["쌍꺼풀"] },
];

export const CLINICS: Clinic[] = [
  {
    id: "clinic_banobagi",
    nameEn: "Banobagi Plastic Surgery",
    aliases: ["바노바기성형외과", "바노바기"],
  },
  {
    id: "clinic_id",
    nameEn: "ID Hospital",
    aliases: ["아이디병원"],
  },
];

export function matchClinic(rawName: string): { clinic: Clinic; alias: string } | null {
  let best: { clinic: Clinic; alias: string } | null = null;
  for (const clinic of CLINICS) {
    for (const alias of clinic.aliases) {
      if (!rawName.includes(alias)) continue;
      if (!best || alias.length > best.alias.length) best = { clinic, alias };
    }
  }
  return best;
}

export function matchProcedures(rawBody: string): ProcedureHit[] {
  const hits: ProcedureHit[] = [];
  for (const procedure of PROCEDURES) {
    const alias = procedure.aliases.find((item) => rawBody.includes(item));
    if (!alias) continue;
    hits.push({ id: procedure.id, labelEn: procedure.labelEn, alias });
  }
  return hits;
}
