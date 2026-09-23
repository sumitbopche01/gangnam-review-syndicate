/**
 * Alias tables. A hit means the Korean string matched this table.
 * It does not mean the clinic or doctor was license-checked.
 */

export const PROCEDURES = [
  { id: "rhinoplasty", labelEn: "rhinoplasty", aliases: ["코성형"] },
  { id: "double_eyelid", labelEn: "double eyelid", aliases: ["쌍꺼풀"] },
];

export const CLINICS = [
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

export function matchClinic(rawName) {
  let best = null;
  for (const clinic of CLINICS) {
    for (const alias of clinic.aliases) {
      if (!rawName.includes(alias)) continue;
      if (!best || alias.length > best.alias.length) best = { clinic, alias };
    }
  }
  return best;
}

export function matchProcedures(rawBody) {
  const hits = [];
  for (const procedure of PROCEDURES) {
    const alias = procedure.aliases.find((item) => rawBody.includes(item));
    if (!alias) continue;
    hits.push({ id: procedure.id, labelEn: procedure.labelEn, alias });
  }
  return hits;
}
