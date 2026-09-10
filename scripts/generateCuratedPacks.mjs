// مولدِ «پک‌های منتخب فلش‌کارت» از پوشه‌ی flashcard/
// اجرا:  npm run gen:curated
//
// ورودی:
//   flashcard/*_flashcards.txt  — هر سطر یک کارت «سوال؟ جواب»
//   flashcard/flashcards_index.md — جدول «خطوط از-تا → فصل» برای هر فایل
// خروجی:
//   src/lib/curatedPacksData.ts — داده‌ی generated (کامیت می‌شود)
//
// تطبیق فصل→مبحث کاتالوگ: ابتدا تطبیق خودکار نام، سپس جدول دستی OVERRIDES.
// فصل‌های بدون مبحث متناظر، «پک مستقل» می‌شوند (id ترکیبی؛ بدون topicSampleId).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FC_DIR = join(ROOT, "flashcard");
const OUT = join(ROOT, "src", "lib", "curatedPacksData.ts");

// ---------- خواندن کاتالوگ مباحث (sampleData.ts) ----------
const sampleSrc = readFileSync(join(ROOT, "src", "lib", "sampleData.ts"), "utf8");
const catalog = new Map(); // subjectKey -> { name, topics: [{id, name}] }
for (const m of sampleSrc.matchAll(/id: "([a-z0-9-]+)",\s*\n\s*name: "([^"]+)",\s*\n\s*color: "([^"]+)",\s*\n\s*topics: \[(.*?)\n    \],/gs)) {
  const [, sid, sname, , body] = m;
  const topics = [...body.matchAll(/\{ id: "([a-z0-9-]+)", name: "([^"]+)"/g)].map((t) => ({ id: t[1], name: t[2] }));
  catalog.set(sid, { name: sname, topics });
}

// ---------- پارس ایندکس ----------
const indexSrc = readFileSync(join(FC_DIR, "flashcards_index.md"), "utf8");
const sections = new Map(); // fileKey -> [{from, to, title}]
let cur = null;
for (const ln of indexSrc.split("\n")) {
  let m = ln.match(/^#{2,3}\s*(?:\d+\))?\s*([a-z_]+)_flashcards\.txt/);
  if (m) {
    cur = m[1];
    if (!sections.has(cur)) sections.set(cur, []);
    continue;
  }
  m = ln.match(/^\|\s*(\d+)\s*[–-]\s*(\d+)\s*\|\s*(.+?)\s*\|$/);
  if (m && cur) sections.get(cur).push({ from: +m[1], to: +m[2], title: m[3] });
}

// ---------- تطبیق خودکار نام ----------
const STOP = new Set(["و", "در", "از", "به", "با", "های", "هر", "برای", "تا", "هم"]);
const norm = (s) => {
  s = s.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[\u064b-\u065f\u0670\u0640]/g, "");
  s = s.replace(/^(فصل|بخش|موضوع)\s*[0-9۰-۹]+(\s*و\s*[0-9۰-۹]+)?:?\s*/, "").trim();
  const toks = s.match(/[A-Za-z0-9\u0600-\u06FF]+/g) ?? [];
  return new Set(toks.filter((t) => !STOP.has(t)));
};
const overlap = (a, b) => {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / Math.min(a.size, b.size);
};

// ---------- جدول دستی تطبیق (فصل‌هایی که تطبیق خودکار جواب نداد) ----------
const OVERRIDES = {
  // جراحی
  "surgery#2": "surgery-lawrence-002",
  "surgery#6": "surgery-lawrence-006",
  "surgery#13": "surgery-lawrence-013",
  "surgery#19": "surgery-lawrence-020",
  // زنان (شماره فصل‌ها با کاتالوگ بکمن هم‌راستاست)
  "obgyn#15": "gynecology-beckmann-015",
  "obgyn#18": "gynecology-beckmann-018",
  "obgyn#19": "gynecology-beckmann-019",
  "obgyn#20": "gynecology-beckmann-020",
  "obgyn#23": "gynecology-beckmann-023",
  "obgyn#25": "gynecology-beckmann-025",
  "obgyn#30": "gynecology-beckmann-030",
  "obgyn#31": "gynecology-beckmann-031",
  "obgyn#33": "gynecology-beckmann-033",
  "obgyn#34": "gynecology-beckmann-034",
  "obgyn#35": "gynecology-beckmann-035",
  "obgyn#37": "gynecology-beckmann-037",
  "obgyn#47": "gynecology-beckmann-047",
  // عفونی (هاریسون) — تفاوت نیم‌فاصله «تک‌یاخته‌ای/روده‌ای» تطبیق خودکار را گمراه می‌کند
  "infectious#47": "infectious-harrison-047",
  // قلب (نعمتی‌پور)
  "cardiology#2": "cardiology-nematpour-001",
  "cardiology#3": "cardiology-nematpour-001",
  "cardiology#4": "cardiology-nematpour-002",
  "cardiology#5": "cardiology-nematpour-002",
  "cardiology#6": "cardiology-nematpour-002",
  "cardiology#7": "cardiology-nematpour-002",
  "cardiology#8": "cardiology-nematpour-003",
  "cardiology#9": "cardiology-nematpour-002",
  "cardiology#10": "cardiology-nematpour-002",
  "cardiology#11": "cardiology-nematpour-004",
  "cardiology#12": "cardiology-nematpour-020",
  "cardiology#13": "cardiology-nematpour-008",
  "cardiology#14": "cardiology-nematpour-008",
  "cardiology#16": "cardiology-nematpour-008",
  "cardiology#17": "cardiology-nematpour-009",
  "cardiology#18": "cardiology-nematpour-009",
  "cardiology#19": "cardiology-nematpour-009",
  "cardiology#21": "cardiology-nematpour-016",
  "cardiology#22": "cardiology-nematpour-015",
  "cardiology#29": "pulmonology-harrison-009",
  // رادیولوژی (هرینگ)
  "radiology#1": "radiology-herring-001",
  "radiology#2": "radiology-herring-003",
  "radiology#3": "radiology-herring-006",
  "radiology#5": "radiology-herring-004",
  "radiology#9": "radiology-herring-008",
  "radiology#10": "radiology-herring-005",
  "radiology#11": "radiology-herring-007",
  "radiology#12": "radiology-herring-006",
  "radiology#13": "radiology-herring-009",
  "radiology#14": "radiology-herring-010",
  "radiology#16": "radiology-herring-009",
  "radiology#17": "radiology-herring-017",
  "radiology#18": "radiology-herring-017",
  "radiology#19": "radiology-herring-017",
  "radiology#20": "radiology-herring-014",
  "radiology#22": "radiology-herring-013",
  "radiology#23": "radiology-herring-018",
  "radiology#24": "radiology-herring-018",
  "radiology#25": "radiology-herring-015",
  // خون و آنکولوژی (هاریسون)
  "hematology_oncology#1": "hematology-harrison-002",
  "hematology_oncology#2": "hematology-harrison-003",
  "hematology_oncology#3": "hematology-harrison-004",
  "hematology_oncology#4": "hematology-harrison-006",
  "hematology_oncology#5": "hematology-harrison-009",
  "hematology_oncology#6": "hematology-harrison-011",
  "hematology_oncology#7": "hematology-harrison-015",
  // روماتولوژی
  "rheumatology#4": "internal-cecil-041",
  "rheumatology#8": "internal-cecil-043",
  // گوارش (هاریسون)
  "gastroenterology#2": "gastroenterology-harrison-003",
  "gastroenterology#4": "gastroenterology-harrison-009",
  "gastroenterology#5": "gastroenterology-harrison-008",
  "gastroenterology#8": "gastroenterology-harrison-008",
  "gastroenterology#9": "gastroenterology-harrison-005",
  "gastroenterology#11": "gastroenterology-harrison-017",
  "gastroenterology#13": "gastroenterology-harrison-014",
  "gastroenterology#14": "gastroenterology-harrison-018",
  "gastroenterology#16": "gastroenterology-harrison-010",
  // ریه (هاریسون)
  "pulmonology#9": "internal-cecil-007",
  "pulmonology#12": "pulmonology-harrison-007",
  "pulmonology#13": "pulmonology-harrison-005",
  // کلیه (هاریسون)
  "nephrology#1": "nephrology-harrison-005",
  "nephrology#2": "nephrology-harrison-006",
  "nephrology#4": "nephrology-harrison-008",
  "nephrology#6": "nephrology-harrison-003",
  "nephrology#7": "nephrology-harrison-014",
  "nephrology#9": "nephrology-harrison-013",
  "nephrology#10": "nephrology-harrison-007",
  "nephrology#11": "nephrology-harrison-010",
  "nephrology#12": "nephrology-harrison-004",
  "nephrology#13": "nephrology-harrison-007",
  "nephrology#14": "nephrology-harrison-001",
  "nephrology#15": "nephrology-harrison-013",
  "nephrology#16": "urology-simforoush-009",
  // غدد (هاریسون)
  "endocrinology#1": "endocrinology-harrison-002",
  "endocrinology#2": "endocrinology-harrison-005",
  "endocrinology#3": "endocrinology-harrison-008",
  "endocrinology#5": "endocrinology-harrison-013",
  "endocrinology#6": "endocrinology-harrison-016",
  // اطفال (نلسون)
  "pediatrics#1": "pediatrics-nelson-001",
  "pediatrics#2": "pediatrics-nelson-002",
  "pediatrics#3": "pediatrics-nelson-003",
  "pediatrics#4": "pediatrics-nelson-003",
  "pediatrics#5": "pediatrics-nelson-003",
  "pediatrics#8": "pediatrics-nelson-006",
  "pediatrics#9": "pediatrics-nelson-007",
  "pediatrics#10": "pediatrics-nelson-008",
  "pediatrics#12": "pediatrics-nelson-010",
  "pediatrics#15": "pediatrics-nelson-013",
  "pediatrics#20": "pediatrics-nelson-018",
  "pediatrics#21": "pediatrics-nelson-019",
  "pediatrics#22": "pediatrics-nelson-020",
  "pediatrics#24": "pediatrics-nelson-024",
  "pediatrics#25": "pediatrics-nelson-025",
  "pediatrics#26": "pediatrics-nelson-029",
  "pediatrics#27": "pediatrics-nelson-030",
};

// نام دوستانه‌ی هر فایل برای گروه‌بندی در «بانک منتخب‌ها»
const FILE_META = {
  surgery: { subjectKey: "surgery-lawrence", subjectName: "جراحی" },
  obgyn: { subjectKey: "gynecology-beckmann", subjectName: "زنان و زایمان" },
  cardiology: { subjectKey: "cardiology-nematpour", subjectName: "قلب و عروق" },
  radiology: { subjectKey: "radiology-herring", subjectName: "رادیولوژی" },
  hematology_oncology: { subjectKey: "hematology-harrison", subjectName: "خون و آنکولوژی" },
  rheumatology: { subjectKey: "rheumatology-harrison", subjectName: "روماتولوژی" },
  gastroenterology: { subjectKey: "gastroenterology-harrison", subjectName: "گوارش" },
  pulmonology: { subjectKey: "pulmonology-harrison", subjectName: "ریه" },
  nephrology: { subjectKey: "nephrology-harrison", subjectName: "کلیه" },
  endocrinology: { subjectKey: "endocrinology-harrison", subjectName: "غدد درون‌ریز" },
  pediatrics: { subjectKey: "pediatrics-nelson", subjectName: "اطفال" },
  infectious: { subjectKey: "infectious-harrison", subjectName: "عفونی" },
  pharmacology: { subjectKey: "pharmacology", subjectName: "فارماکولوژی" },
  internal: { subjectKey: "internal-cecil", subjectName: "داخلی (سیسیل)" },
  neurology: { subjectKey: "neurology-aminoff", subjectName: "مغز و اعصاب" },
  psychiatry: { subjectKey: "psychiatry-dahrfar", subjectName: "روانپزشکی" },
  dermatology: { subjectKey: "dermatology-moazami", subjectName: "پوست" },
  pathology: { subjectKey: "pathology-robbins", subjectName: "پاتولوژی" },
  orthopedics: { subjectKey: "orthopedics-alamiharandi", subjectName: "ارتوپدی" },
  urology: { subjectKey: "urology-simforoush", subjectName: "اورولوژی" },
  ophthalmology: { subjectKey: "ophthalmology-javadi", subjectName: "چشم‌پزشکی" },
  ent: { subjectKey: "ent-goldenberg", subjectName: "گوش و حلق و بینی" },
  ethics: { subjectKey: "medical-ethics-reaghib", subjectName: "اخلاق پزشکی" },
  statistics: { subjectKey: "statistics-epidemiology", subjectName: "آمار و اپیدمیولوژی" },
  immunology: { subjectKey: "immunology-helbert", subjectName: "ایمونولوژی" },
  genetics: { subjectKey: "genetics-emery", subjectName: "ژنتیک پزشکی" },
  physics: { subjectKey: "medical-physics", subjectName: "فیزیک پزشکی" },
  nutrition: { subjectKey: "nutrition", subjectName: "تغذیه" },
};

const stripPrefix = (t) => t.replace(/^(فصل|بخش|موضوع)\s*[0-9۰-۹]+(\s*و\s*[0-9۰-۹]+)?:\s*/, "").trim();

// ---------- ساخت پک‌ها ----------
const packs = [];
const report = { mapped: 0, standalone: 0, cards: 0 };
const targetCount = new Map(); // چند فصل به یک مبحث رفته؟ برای id یکتا

for (const [fileKey, chapters] of sections) {
  const meta = FILE_META[fileKey];
  if (!meta) throw new Error(`FILE_META برای «${fileKey}» تعریف نشده`);
  const lines = readFileSync(join(FC_DIR, `${fileKey}_flashcards.txt`), "utf8").split("\n");
  const subj = catalog.get(meta.subjectKey);

  chapters.forEach((ch, i) => {
    const idx = i + 1;
    const rows = [];
    const seenFronts = new Set();
    for (let n = ch.from; n <= Math.min(ch.to, lines.length); n++) {
      const line = lines[n - 1].trim();
      if (!line) continue;
      const qm = line.indexOf("؟");
      const sep = qm >= 0 && qm < line.length - 1 ? qm + 1 : line.indexOf(" ");
      if (sep <= 0) continue;
      const f = line.slice(0, sep).trim();
      const b = line.slice(sep).trim();
      if (!f || !b) continue;
      if (seenFronts.has(f)) continue; // سوال تکراری داخل یک فصل — فقط بار اول
      seenFronts.add(f);
      rows.push([f, b]);
    }
    if (rows.length === 0) throw new Error(`${fileKey}#${idx}: کارتی پیدا نشد`);

    // تطبیق: override → خودکار (همان درس) → خودکار (cross فقط تساوی کامل) → مستقل
    let topicSampleId = OVERRIDES[`${fileKey}#${idx}`] ?? null;
    let how = topicSampleId ? "override" : null;
    const nTitle = norm(ch.title);
    if (!topicSampleId) {
      let best = 0;
      for (const t of subj.topics) {
        const sc = overlap(nTitle, norm(t.name));
        if (sc > best) {
          best = sc;
          topicSampleId = t.id;
        }
      }
      if (best >= 0.75) how = `auto:${best.toFixed(2)}`;
      else {
        topicSampleId = null;
        for (const [, c2] of catalog) {
          const hit = c2.topics.find((t) => {
            const nn = norm(t.name);
            return nn.size === nTitle.size && nn.size > 0 && [...nn].every((x) => nTitle.has(x));
          });
          if (hit) {
            topicSampleId = hit.id;
            how = "cross:exact";
            break;
          }
        }
      }
    }
    if (topicSampleId && !catalog.get(meta.subjectKey).topics.some((t) => t.id === topicSampleId)) {
      // cross-subject: موجودی را در کل کاتالوگ چک کن
      const exists = [...catalog.values()].some((c) => c.topics.some((t) => t.id === topicSampleId));
      if (!exists) throw new Error(`${fileKey}#${idx}: مبحث هدف «${topicSampleId}» در کاتالوگ نیست`);
    }

    let id;
    if (topicSampleId) {
      const seen = targetCount.get(topicSampleId) ?? 0;
      targetCount.set(topicSampleId, seen + 1);
      id = seen === 0 ? topicSampleId : `${topicSampleId}#${seen + 1}`;
      report.mapped++;
    } else {
      id = `${meta.subjectKey}:x${idx}`;
      report.standalone++;
    }
    report.cards += rows.length;

    const topicName = topicSampleId
      ? (catalog.get(meta.subjectKey).topics.find((t) => t.id === topicSampleId)?.name ?? stripPrefix(ch.title))
      : stripPrefix(ch.title);
    packs.push({ id, topicSampleId: topicSampleId ?? undefined, subjectKey: meta.subjectKey, subjectName: meta.subjectName, topicName, cards: rows, how });
  });
}

// id یکتا؟
const ids = packs.map((p) => p.id);
if (new Set(ids).size !== ids.length) throw new Error("id تکراری بین پک‌ها!");

// ---------- نوشتن خروجی ----------
const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
let out = `// ===== GENERATED FILE — دستی ویرایش نکنید =====
// این فایل با «npm run gen:curated» از پوشه‌ی flashcard/ ساخته می‌شود.
// منبع: فایل‌های منتخب فلش‌کارت (سوال؟ جواب) + flashcards_index.md
// ${packs.length} پک · ${report.cards} کارت

export interface GeneratedPack {
  id: string;
  /** sampleId مبحث کاتالوگ برای وصل‌شدن به مبحث کاربر (پک مستقل = undefined) */
  topicSampleId?: string;
  subjectKey: string;
  subjectName: string;
  topicName: string;
  cards: [string, string][];
}

export const GENERATED_PACKS: GeneratedPack[] = [
`;
for (const p of packs) {
  out += `  {\n    id: "${esc(p.id)}",\n`;
  if (p.topicSampleId) out += `    topicSampleId: "${esc(p.topicSampleId)}",\n`;
  out += `    subjectKey: "${esc(p.subjectKey)}",\n    subjectName: "${esc(p.subjectName)}",\n    topicName: "${esc(p.topicName)}",\n    cards: [\n`;
  for (const [f, b] of p.cards) out += `      ["${esc(f)}", "${esc(b)}"],\n`;
  out += `    ],\n  },\n`;
}
out += "];\n";
writeFileSync(OUT, out, "utf8");

console.log(`✅ ${packs.length} پک · ${report.cards} کارت (${report.mapped} فصل وصل‌شده به مبحث، ${report.standalone} پک مستقل)`);
const standaloneList = packs.filter((p) => !p.topicSampleId);
if (standaloneList.length) console.log("پک‌های مستقل:", standaloneList.map((p) => `${p.subjectName} › ${p.topicName}`).join(" | "));
