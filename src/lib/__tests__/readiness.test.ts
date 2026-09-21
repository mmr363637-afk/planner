import { describe, expect, it } from "vitest";
import { examReadiness, matchExamSubject, normalizeFaName, readinessAdvice } from "../readiness";
import type { Subject, Topic } from "../../types";

const subjects: Subject[] = [
  { id: "s1", name: "قلب", color: "#f00", priority: "high", createdAt: 1 },
  { id: "s2", name: "روماتولوژی", color: "#0f0", priority: "medium", createdAt: 2 },
];

const mkTopic = (id: string, subjectId: string, status: Topic["status"]): Topic => ({
  id, subjectId, name: id, volume: 10, estimatedMinutes: 60, priority: "medium", difficulty: 2, status, createdAt: 1,
});

describe("normalizeFaName / matchExamSubject", () => {
  it("عربی و فارسی را یکی می‌کند", () => {
    expect(normalizeFaName("قلب  و عروق")).toBe("قلب و عروق");
    expect(normalizeFaName("داروسازي")).toBe("داروسازی");
  });

  it("با subjectId مستقیم تطبیق می‌دهد", () => {
    const s = matchExamSubject({ subjectId: "s2" }, subjects);
    expect(s?.id).toBe("s2");
  });

  it("با نام نزدیک تطبیق جزئی می‌کند", () => {
    const s = matchExamSubject({ subject: "امتحان قلب" }, subjects);
    expect(s?.id).toBe("s1");
  });

  it("بدون درس، null می‌دهد", () => {
    expect(matchExamSubject({ subject: "فیزیک" }, subjects)).toBeNull();
    expect(matchExamSubject({}, subjects)).toBeNull();
  });
});

describe("examReadiness", () => {
  const topics = [
    mkTopic("t1", "s1", "mastered"),
    mkTopic("t2", "s1", "learning"),
    mkTopic("t3", "s1", "not_started"),
    mkTopic("t4", "s2", "mastered"),
  ];

  it("بدون درسِ منطبق matched=false", () => {
    const r = examReadiness({ subject: "شیمی" }, { subjects, topics, reviews: [], flashcards: [] });
    expect(r.matched).toBe(false);
    expect(r.score).toBe(0);
  });

  it("تسلط کامل = ۱۰۰", () => {
    const allMastered = [mkTopic("t1", "s1", "mastered"), mkTopic("t2", "s1", "mastered")];
    const r = examReadiness({ subject: "قلب" }, { subjects, topics: allMastered, reviews: [], flashcards: [] });
    expect(r.score).toBe(100);
    expect(r.parts.totalTopics).toBe(2);
  });

  it("ترکیب تسلط و مرور و کارت را وزنی می‌کند", () => {
    const reviews: { topicId: string; status: "done" | "pending" }[] = [
      { topicId: "t1", status: "done" },
      { topicId: "t2", status: "pending" },
      { topicId: "t3", status: "pending" },
      { topicId: "t1", status: "done" },
    ];
    const flashcards = [
      { topicId: "t1", repetitions: 3 },
      { topicId: "t2", repetitions: 0 },
    ];
    const r = examReadiness({ subject: "قلب" }, { subjects, topics, reviews, flashcards });
    // mastery: (1 + 0.35 + 0)/3 = 0.45 → 45
    expect(r.parts.masteryPct).toBe(45);
    // review: 2/4 = 50
    expect(r.parts.reviewPct).toBe(50);
    // cards: 1/2 → 50
    expect(r.parts.cardPct).toBe(50);
    // score = 0.55*45 + 0.30*50 + 0.15*50 = 24.75 + 15 + 7.5 ≈ 47
    expect(r.score).toBeGreaterThanOrEqual(47 - 1);
    expect(r.score).toBeLessThanOrEqual(48);
  });

  it("در نبودِ مرور و کارت، فقط تسلط تعیین‌کننده است", () => {
    const r = examReadiness({ subject: "قلب" }, { subjects, topics, reviews: [], flashcards: [] });
    expect(r.parts.reviewPct).toBeNull();
    expect(r.parts.cardPct).toBeNull();
    expect(r.score).toBe(r.parts.masteryPct);
  });

  it("readinessAdvice متن درست برمی‌گرداند", () => {
    expect(readinessAdvice(90)).toContain("آزمون تازه");
    expect(readinessAdvice(90)).not.toContain("فقط مرور سبک");
    expect(readinessAdvice(70)).toContain("خوب");
    expect(readinessAdvice(0)).toContain("شروع");
  });
});

it("uses recent tests without presenting their score as a validated pass probability",()=>{
  const topics=[mkTopic("t1","s1","mastered"),mkTopic("t2","s1","mastered")];
  const r=examReadiness({subjectId:"s1"},{subjects,topics,reviews:[],flashcards:[],today:"2026-09-21",testLogs:[
    {id:"a",topicId:"t1",date:"2026-09-20",total:20,correct:4,createdAt:1},
    {id:"old",topicId:"t1",date:"2026-01-01",total:100,correct:100,createdAt:1},
    {id:"future",topicId:"t2",date:"2026-10-01",total:100,correct:100,createdAt:1},
  ]});
  expect(r.evidence.tests).toBe(20);expect(r.evidence.accuracy).toBe(20);expect(r.evidence.coverage).toBe(50);expect(r.score).toBeLessThan(100);
});
it("marks self-reported mastery alone as limited evidence",()=>{
  const r=examReadiness({subjectId:"s1"},{subjects,topics:[mkTopic("t","s1","mastered")],reviews:[],flashcards:[]});
  expect(r.evidence.confidence).toBe("limited");expect(r.evidence.tests).toBe(0);
});
