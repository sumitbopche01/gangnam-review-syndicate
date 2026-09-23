/**
 * Fixture knowledge used by tools. Alias hit means "resolved against this
 * table", not "licensed" or "verified by a registry".
 */

export const PROCEDURES = [
  { id: "rhinoplasty", aliases: ["코성형", "코 성형"] },
  { id: "double_eyelid", aliases: ["쌍꺼풀"] },
];

export const CLINICS = [
  {
    id: "clinic_banobagi",
    name: "Banobagi Plastic Surgery",
    aliases: ["바노바기성형외과", "바노바기"],
  },
  {
    id: "clinic_id",
    name: "ID Hospital",
    aliases: ["아이디병원"],
  },
];

export const SURGEONS = [
  {
    id: "surgeon_kim_taehyung",
    name: "Kim Tae-hyung",
    clinicId: "clinic_banobagi",
    surname: "김",
    aliases: ["김태형"],
  },
  {
    id: "surgeon_kim_seoyeon",
    name: "Kim Seo-yeon",
    clinicId: "clinic_banobagi",
    surname: "김",
    aliases: ["김서연"],
  },
  {
    id: "surgeon_kim_minjun",
    name: "Kim Min-jun",
    clinicId: "clinic_id",
    surname: "김",
    aliases: ["김민준"],
  },
];

export function lookupProcedure(text) {
  const hits = [];
  for (const procedure of PROCEDURES) {
    const alias = longestAlias(procedure.aliases, text);
    if (!alias) continue;
    hits.push({
      procedureId: procedure.id,
      alias,
      span: spanAround(text, alias),
    });
  }
  return hits;
}

export function lookupClinics(text) {
  const hits = [];
  for (const clinic of CLINICS) {
    const alias = longestAlias(clinic.aliases, text);
    if (!alias) continue;
    hits.push({ clinicId: clinic.id, name: clinic.name, alias, span: spanAround(text, alias) });
  }
  return hits.sort((a, b) => b.alias.length - a.alias.length);
}

export function lookupSurgeons(text, clinicId, { surnameMatch = false } = {}) {
  if (surnameMatch) {
    return SURGEONS.filter((surgeon) => text.includes(surgeon.surname) && surgeon.clinicId === clinicId).map(
      (surgeon) => ({
        surgeonId: surgeon.id,
        name: surgeon.name,
        via: "surname",
        span: spanAround(text, surgeon.surname),
      }),
    );
  }

  return SURGEONS.filter((surgeon) => surgeon.clinicId === clinicId && surgeon.aliases.some((alias) => text.includes(alias))).map(
    (surgeon) => {
      const alias = longestAlias(surgeon.aliases, text);
      return {
        surgeonId: surgeon.id,
        name: surgeon.name,
        via: "full_alias",
        alias,
        span: spanAround(text, alias),
      };
    },
  );
}

function longestAlias(aliases, text) {
  return aliases
    .slice()
    .sort((a, b) => b.length - a.length)
    .find((alias) => text.includes(alias));
}

function spanAround(text, needle) {
  const start = text.indexOf(needle);
  if (start < 0) return needle;
  const from = Math.max(0, start - 12);
  const to = Math.min(text.length, start + needle.length + 12);
  return text.slice(from, to);
}
