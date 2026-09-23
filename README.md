# Gangnam clinic pipeline

Fixture-backed agent pipeline for Gangnam Beauty Guide.

```text
fetch clinics → analyse → translate Korean to English → fetch doctors → validate → publish
```

English names are display fields. A doctor is attached only when their Korean name is on the clinic page and the clinic id already resolved. `supported` means an alias hit, not a license check.

## Run

```bash
node src/run.js --broken
node src/run.js
node --test test/pipeline.test.js
```

## Steps

1. **Fetch clinics.** Directory connector returns three Korean clinic pages.
2. **Analyse.** Matches the Korean clinic name to an alias table and reads procedure terms from the Korean body. `강남뷰티의원` matches nothing, so no doctor call is made.
3. **Translate.** Writes the English clinic name and procedure labels from the analysis. It does not choose a doctor.
4. **Fetch doctors.** Doctor connector runs only with a resolved clinic id. The associate step keeps a doctor whose Korean name appears in the source body.
5. **Validate.** Procedure evidence must still be in the Korean body. A doctor whose Korean name is absent is not publishable.
6. **Publish.** English clinic cards plus attached doctors.

## Where it broke

Banobagi's page says `김 원장님`, not a full name. The translator rendered that as "Dr. Kim". The doctor step treated the English surname as a match and took the first Banobagi row, Kim Tae-hyung. The validator only checked that the English hint appeared in the English summary.

The translator no longer emits a doctor. Association requires the full Korean name, so ID Hospital keeps 김민준 and Banobagi publishes with `doctorStatus: unresolved`. The unknown clinic stays quarantined.

## Fixtures

| page | Fixed result |
| --- | --- |
| 바노바기성형외과, rhinoplasty, surgeon written only as Director Kim | published clinic, no doctor |
| 아이디병원, double eyelid, 김민준 | published clinic + Kim Min-jun |
| 강남뷰티의원 | quarantined, doctors not fetched |
