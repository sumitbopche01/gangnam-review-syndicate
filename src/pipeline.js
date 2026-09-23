/**
 * Clinic pipeline: fetch → analyse → translate → fetch doctors → validate → publish.
 *
 * English is a display step. Doctor identity is decided from the Korean page
 * after the clinic id is known.
 *
 * brokenDoctorFromEnglish reproduces the first failure: the translator turned
 * "김 원장" into "Dr. Kim", and the doctor step treated that surname as a match.
 */

import { matchClinic, matchProcedures } from "./knowledge.js";
import { fetchClinics, fetchDoctors } from "./sources.js";

export function runPipeline({ brokenDoctorFromEnglish = false } = {}) {
  const trace = [];

  const pages = fetchClinics();
  trace.push(step("fetch_clinics", "cli", "clinic directory connector", pages.map((page) => page.id)));

  const analysed = pages.map((page) => analyseAgent(page));
  trace.push(step("analyse", "fetch_clinics.pages", "analyse agent", analysed.map(summarizeAnalysis)));

  const translated = analysed.map((clinic) => translateAgent(clinic, { brokenDoctorFromEnglish }));
  trace.push(step("translate", "analyse.clinics", "translate agent", translated.map((clinic) => ({
    id: clinic.id,
    nameEn: clinic.english.nameEn,
    summaryEn: clinic.english.summaryEn,
    doctorHint: clinic.english.doctorHint ?? null,
  }))));

  const withDoctors = translated.map((clinic) => associateDoctors(clinic, { brokenDoctorFromEnglish }));
  trace.push(step("fetch_doctors", "translate.clinics", "doctor directory connector + associate agent", withDoctors.map((clinic) => ({
    id: clinic.id,
    fetched: clinic.roster.map((doctor) => doctor.id),
    associated: clinic.doctors.map((doctor) => doctor.nameEn),
    doctorStatus: clinic.doctorStatus,
  }))));

  const validated = withDoctors.map((clinic) => validateAgent(clinic, { brokenDoctorFromEnglish }));
  trace.push(step("validate", "fetch_doctors.clinics", "validate agent", validated.map((clinic) => ({
    id: clinic.id,
    status: clinic.status,
    reasons: clinic.reasons,
  }))));

  const published = validated.filter((clinic) => clinic.status === "published");
  trace.push(step("publish", "validate.accepted", "index writer", published.map((clinic) => clinic.id)));

  return {
    published: published.map(toCard),
    quarantined: validated.filter((clinic) => clinic.status !== "published").map(toCard),
    trace,
  };
}

function analyseAgent(page) {
  const clinicHit = matchClinic(page.rawName);
  const procedures = matchProcedures(page.rawBody);
  return {
    page,
    id: page.id,
    clinic: clinicHit ? { ...clinicHit.clinic, matchedAlias: clinicHit.alias } : null,
    clinicStatus: clinicHit ? "supported" : "unresolved",
    procedures,
  };
}

function translateAgent(clinic, { brokenDoctorFromEnglish }) {
  const procedureLabels = clinic.procedures.map((procedure) => procedure.labelEn);
  const nameEn = clinic.clinic?.nameEn ?? null;
  const summaryEn = nameEn
    ? `${procedureLabels.join(", ") || "procedure unresolved"} at ${nameEn}.`
    : null;

  let doctorHint = null;
  if (brokenDoctorFromEnglish && clinic.page.rawBody.includes("김")) {
    doctorHint = "Dr. Kim";
  }

  return {
    ...clinic,
    english: {
      nameEn,
      addressKo: clinic.page.rawAddress,
      proceduresEn: procedureLabels,
      summaryEn: doctorHint ? `${summaryEn} ${doctorHint} leads the clinic.` : summaryEn,
      doctorHint,
    },
  };
}

function associateDoctors(clinic, { brokenDoctorFromEnglish }) {
  if (!clinic.clinic) {
    return { ...clinic, roster: [], doctors: [], doctorStatus: "skipped_unresolved_clinic" };
  }

  const roster = fetchDoctors(clinic.clinic.id);
  if (brokenDoctorFromEnglish && clinic.english.doctorHint) {
    const guessed = roster.find((doctor) => clinic.english.doctorHint.includes(doctor.surnameEn));
    if (guessed) {
      return { ...clinic, roster, doctors: [{ ...guessed, via: "english_surname" }], doctorStatus: "supported" };
    }
  }

  const matched = roster.filter((doctor) => clinic.page.rawBody.includes(doctor.nameKo));
  if (matched.length === 1) {
    return { ...clinic, roster, doctors: [{ ...matched[0], via: "korean_name" }], doctorStatus: "supported" };
  }
  if (matched.length > 1) {
    return { ...clinic, roster, doctors: [], doctorStatus: "conflict" };
  }
  return { ...clinic, roster, doctors: [], doctorStatus: "unresolved" };
}

function validateAgent(clinic, { brokenDoctorFromEnglish }) {
  const reasons = [];
  if (clinic.clinicStatus !== "supported") reasons.push("clinic_unresolved");
  if (clinic.procedures.length === 0) reasons.push("procedure_unverified");
  for (const procedure of clinic.procedures) {
    if (!clinic.page.rawBody.includes(procedure.alias)) reasons.push("procedure_span_missing");
  }

  if (brokenDoctorFromEnglish) {
    if (clinic.english.doctorHint && !clinic.english.summaryEn?.includes(clinic.english.doctorHint)) {
      reasons.push("doctor_missing_from_english");
    }
  } else {
    for (const doctor of clinic.doctors) {
      if (!clinic.page.rawBody.includes(doctor.nameKo)) reasons.push("doctor_not_in_korean_source");
    }
    if (clinic.english.summaryEn?.includes("Dr. Kim")) reasons.push("english_invented_a_doctor");
  }

  return {
    ...clinic,
    status: reasons.length === 0 ? "published" : "quarantined",
    reasons,
  };
}

function toCard(clinic) {
  return {
    id: clinic.id,
    status: clinic.status,
    reasons: clinic.reasons,
    sourceUrl: clinic.page.url,
    korean: {
      name: clinic.page.rawName,
      address: clinic.page.rawAddress,
      body: clinic.page.rawBody,
    },
    english: clinic.english,
    clinic: clinic.clinic
      ? { id: clinic.clinic.id, nameEn: clinic.clinic.nameEn, status: clinic.clinicStatus }
      : { id: null, status: clinic.clinicStatus },
    procedures: clinic.procedures.map((procedure) => ({
      id: procedure.id,
      labelEn: procedure.labelEn,
      evidence: procedure.alias,
    })),
    doctors: clinic.doctors.map((doctor) => ({
      id: doctor.id,
      nameKo: doctor.nameKo,
      nameEn: doctor.nameEn,
      via: doctor.via,
      status: clinic.doctorStatus,
    })),
    doctorStatus: clinic.doctorStatus,
  };
}

function summarizeAnalysis(clinic) {
  return {
    id: clinic.id,
    clinicId: clinic.clinic?.id ?? null,
    procedures: clinic.procedures.map((procedure) => procedure.id),
  };
}

function step(name, trigger, tool, output) {
  return { step: name, trigger, tool, output };
}
