# Gangnam review syndication slice

Fixture-backed pipeline for Gangnam Beauty Guide. It turns four synthetic Korean reviews into comparison records an English-speaking buyer can use. A record is published only when the procedure, clinic, and surgeon each resolve from the Korean text.

This is not a license check. `supported` means the review contains a full alias from the local table.

## Run

```bash
node src/run.js --broken
node src/run.js
node --test test/pipeline.test.js
```

`--broken` is the first version. `src/run.js` is the fix.

## Steps

1. **Ingest** loads the fixture reviews (stand-in for Naver, Daum, and clinic blogs).
2. **Extract** calls procedure, clinic, and price tools. It does not choose a surgeon.
3. **Resolve** binds a clinic only on one full alias, then asks the surgeon tool.
4. **Dedupe** drops a second posting of the same normalised text for the same clinic. `r2` is a repost of `r1`.
5. **Generate** writes one comparison line from resolved fields only.
6. **Validate** checks the Korean evidence span, the procedure alias, the clinic, and the surgeon status.
7. **Publish** writes `published`, `quarantined`, and `duplicates`.

## Where it broke

Banobagi has two surgeons surnamed Kim. Review `r4` says only `김 원장님` ("Director Kim"). The first resolver treated the surname as an identity and took the first table row, Kim Tae-hyung. The validator only checked that the clinic name appeared in the comparison line, so the invented surgeon was published.

The fix is in the resolver and the validator. Surgeon matches now require a full alias such as `김태형`. The validator quarantines `surgeon_unverified` instead of trusting the line. Re-run: `r1` and `r3` publish, `r2` is a duplicate, `r4` is quarantined.

## Fixtures

| id | What it is | Fixed result |
| --- | --- | --- |
| r1 | Rhinoplasty, Banobagi, Kim Tae-hyung, 4,500,000 KRW | published |
| r2 | Same text as r1 on another URL | duplicate of r1 |
| r3 | Double eyelid, ID Hospital, Kim Min-jun | published |
| r4 | Rhinoplasty at Banobagi, surgeon written only as Director Kim | quarantined |
