/* ═══════════════════════════════════════════════════
   Reading a Tune Protect certificate
   ═══════════════════════════════════════════════════

   The committee uploads one PDF per member; typing the same eight
   fields back in by hand afterwards is how they end up wrong. The
   certificate prints them as plain text, so read them off it instead.

   Page 1 lays the fields out as label then value, in a fixed order:

     AirAsia Travel Comprehensive Gold
     Master Policy No. 79-796-25-000505
     Reference No. MYO-PLUS-26-0016531
     Flight Booking No. E7M74Y
     Destination Japan
     Plan Type Offline International (Area 3) Return (1-10 days)
     Effective Date 2026-10-22  Expiry Date 2026-10-27
     Insured Name DOB  Ariff Hakimi Bin Chik  1998-05-11

   So each value is whatever sits between its own label and the next
   one. That survives reflowing and different spacing, which a
   position-based read would not — pdf.js returns text in draw order,
   not reading order, and the labels are the only stable landmarks.

   Nothing here is trusted: every field is optional, and a certificate
   that parses to nothing still uploads. The PDF is the record; these
   fields are a convenience on top of it.
*/

/* pdf.js is ~300 KB and only the committee ever parses a PDF, so it is
   fetched on the first upload rather than shipped to everyone. */
let pdfjs = null;
async function loadPdfjs() {
  if (!pdfjs) {
    const lib = await import('pdfjs-dist/build/pdf.mjs');
    /* The worker would otherwise be fetched from a CDN at a version
       that has to match the library exactly. Bundling it keeps the two
       in step, and keeps this working on a bad connection. */
    const worker = await import('pdfjs-dist/build/pdf.worker.mjs?url');
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    pdfjs = lib;
  }
  return pdfjs;
}

/** All the text on page 1, in one line. */
async function firstPageText(file) {
  const lib = await loadPdfjs();
  const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  try {
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    return content.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
  } finally {
    doc.destroy();
  }
}

/* In the order they appear, which is what lets each value end where the
   next label begins. */
const FIELDS = [
  ['master_policy_no', 'Master Policy No.'],
  ['reference_no', 'Reference No.'],
  ['booking_no', 'Flight Booking No.'],
  ['destination', 'Destination'],
  ['plan_type', 'Plan Type'],
  ['effective_date', 'Effective Date'],
  ['expiry_date', 'Expiry Date'],
  ['insured_name', 'Insured Name DOB'],
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Pull the policy fields out of one page of certificate text. */
export function parsePolicyText(text) {
  const found = {};
  const marks = FIELDS
    .map(([key, label]) => ({ key, label, at: text.indexOf(label) }))
    .filter((m) => m.at !== -1)
    .sort((a, b) => a.at - b.at);

  marks.forEach((m, i) => {
    const from = m.at + m.label.length;
    const to = i + 1 < marks.length ? marks[i + 1].at : text.length;
    found[m.key] = text.slice(from, to).trim();
  });

  /* The product name is the line above the first label and has no label
     of its own, so take the sentence that ends just before it. */
  const firstAt = marks.length ? marks[0].at : -1;
  if (firstAt > 0) {
    const tail = text.slice(0, firstAt).trim().split('.').pop().trim();
    if (tail && tail.length <= 80) found.product = tail;
  }

  /* Name and date of birth share one label, and being the last label it
     runs on into the rest of the page. The date of birth is the end of
     the name, so cut there; with no date to find, keep a few words
     rather than a page of small print. */
  if (found.insured_name) {
    const upToDob = /^(.*?)\s\d{4}-\d{2}-\d{2}/.exec(found.insured_name);
    found.insured_name = upToDob
      ? upToDob[1].trim()
      : found.insured_name.split(' ').slice(0, 6).join(' ').trim();
  }

  /* A date that isn't one is worse than no date: it would fail the
     insert and lose the upload with it. */
  ['effective_date', 'expiry_date'].forEach((k) => {
    if (found[k] && !ISO_DATE.test(found[k])) delete found[k];
  });

  Object.keys(found).forEach((k) => { if (!found[k]) delete found[k]; });
  return found;
}

/** Read a certificate. Returns {} when it cannot be read at all. */
export async function readPolicyPdf(file) {
  try {
    return parsePolicyText(await firstPageText(file));
  } catch (e) {
    return {}; // a certificate that won't parse still deserves to upload
  }
}

/* Names are written differently on a passport, an allowlist and an
   insurer's system, so only shout when there is no overlap at all — a
   warning on every "Bin" vs "bin" would be ignored within a day. */
export function nameLooksWrong(insuredName, memberName) {
  if (!insuredName || !memberName) return false;
  const words = (s) => new Set(
    String(s).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2)
  );
  const a = words(insuredName);
  const b = words(memberName);
  if (!a.size || !b.size) return false;
  for (const w of a) if (b.has(w)) return false;
  return true;
}
