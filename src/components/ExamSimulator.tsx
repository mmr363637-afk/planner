import { useState, useEffect, useRef } from "react";
import { useStore, useLookups } from "../store";
import { Button, Card, Modal, SectionTitle, Segmented, Toggle, inputClass } from "./ui";
import { formatClock, toFa, todayKey } from "../lib/jalali";
import { cn } from "../utils/cn";

interface ExamSimConfig {
  subjectIds: string[];
  totalQuestions: number;
  timeMinutes: number;
  mode: "timed" | "untimed";
}

/**
 * شبیه‌ساز آزمون — شرایط امتحان را شبیه‌سازی می‌کند.
 * با تایمر، محدودیت زمانی، و گزارش عملکرد.
 * همه‌چیز آفلاین است و از فلش‌کارت‌های کاربر سوال می‌سازد.
 */
export default function ExamSimulator({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state } = useStore();
  const { topicById, subjectById } = useLookups();
  const [step, setStep] = useState<"config" | "running" | "result">("config");
  const [config, setConfig] = useState<ExamSimConfig>({
    subjectIds: [],
    totalQuestions: 20,
    timeMinutes: 60,
    mode: "timed",
  });
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());
  const [timeLeft, setTimeLeft] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<("correct" | "wrong" | "skip")[]>([]);
  const [questions, setQuestions] = useState<{ topicId: string; front: string; back: string }[]>([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [userAnswer, setUserAnswer] = useState<"correct" | "wrong" | "skip" | null>(null);

  // ساخت سوالات از فلش‌کارت‌ها
  const generateQuestions = () => {
    let cards = state.flashcards.filter((c) => {
      if (selectedSubjects.size === 0) return true;
      const topic = topicById.get(c.topicId ?? "");
      return topic && selectedSubjects.has(topic.subjectId);
    });
    // Shuffle
    cards = [...cards].sort(() => Math.random() - 0.5);
    const selected = cards.slice(0, config.totalQuestions);
    return selected.map((c) => ({
      topicId: c.topicId ?? "",
      front: c.front,
      back: c.back,
    }));
  };

  const startExam = () => {
    const q = generateQuestions();
    if (q.length === 0) return;
    setQuestions(q);
    setAnswers([]);
    setQuestionIndex(0);
    setShowAnswer(false);
    setUserAnswer(null);
    setTimeLeft(config.timeMinutes * 60);
    setStep("running");
  };

  // تایمر شمارش معکوس
  useEffect(() => {
    if (step !== "running" || config.mode !== "timed") return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(id);
          setStep("result");
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [step, config.mode]);

  const submitAnswer = (answer: "correct" | "wrong" | "skip") => {
    setUserAnswer(answer);
    setShowAnswer(true);
  };

  const nextQuestion = () => {
    const finalAnswers = [...answers, userAnswer ?? "skip"];
    setAnswers(finalAnswers);
    setShowAnswer(false);
    setUserAnswer(null);

    if (questionIndex + 1 >= questions.length) {
      setStep("result");
    } else {
      setQuestionIndex(questionIndex + 1);
    }
  };

  const correctCount = answers.filter((a) => a === "correct").length;
  const wrongCount = answers.filter((a) => a === "wrong").length;
  const skipCount = answers.filter((a) => a === "skip").length;
  const percent = answers.length > 0 ? Math.round((correctCount / answers.length) * 100) : 0;

  const resetAll = () => {
    setStep("config");
    setSelectedSubjects(new Set());
    setAnswers([]);
    setQuestionIndex(0);
    setShowAnswer(false);
    setUserAnswer(null);
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={() => { resetAll(); onClose(); }} title="🎓 شبیه‌ساز آزمون">
      {step === "config" && (
        <div className="space-y-4">
          <div className="text-sm text-slate-600 dark:text-slate-300 mb-2">
            از فلش‌کارت‌هایت سوال طرح می‌شود و شرایط امتحان شبیه‌سازی می‌شود.
          </div>

          {/* انتخاب دروس */}
          <div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">دروس مورد آزمون</div>
            <div className="flex flex-wrap gap-1.5">
              {state.subjects.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    const next = new Set(selectedSubjects);
                    if (next.has(s.id)) next.delete(s.id);
                    else next.add(s.id);
                    setSelectedSubjects(next);
                  }}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg text-xs transition-colors border",
                    selectedSubjects.has(s.id)
                      ? "border-teal-500 bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 font-bold"
                      : "border-slate-200 dark:border-slate-600 text-slate-500"
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">خالی = همه‌ی فلش‌کارت‌ها ({toFa(state.flashcards.length)} کارت)</div>
          </div>

          {/* تعداد سوالات */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-700 dark:text-slate-200">تعداد سوالات</span>
            <div className="flex items-center gap-2">
              <button type="button" className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200" onClick={() => setConfig((c) => ({ ...c, totalQuestions: Math.max(5, c.totalQuestions - 5) }))}>−</button>
              <span className="w-12 text-center text-sm font-bold">{toFa(config.totalQuestions)}</span>
              <button type="button" className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200" onClick={() => setConfig((c) => ({ ...c, totalQuestions: Math.min(100, c.totalQuestions + 5) }))}>+</button>
            </div>
          </div>

          {/* زمان */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-700 dark:text-slate-200">مدت آزمون (دقیقه)</span>
            <div className="flex items-center gap-2">
              <button type="button" className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200" onClick={() => setConfig((c) => ({ ...c, timeMinutes: Math.max(10, c.timeMinutes - 10) }))}>−</button>
              <span className="w-12 text-center text-sm font-bold">{toFa(config.timeMinutes)}</span>
              <button type="button" className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200" onClick={() => setConfig((c) => ({ ...c, timeMinutes: Math.min(300, c.timeMinutes + 10) }))}>+</button>
            </div>
          </div>

          <Segmented
            value={config.mode}
            onChange={(v) => setConfig((c) => ({ ...c, mode: v as "timed" | "untimed" }))}
            options={[{ value: "timed", label: "⏱ با محدودیت زمانی" }, { value: "untimed", label: "∞ بدون محدودیت" }]}
          />

          <Button onClick={startExam} disabled={state.flashcards.length === 0} className="w-full">
            🚀 شروع آزمون
          </Button>
          {state.flashcards.length === 0 && (
            <div className="text-xs text-amber-600 dark:text-amber-400 text-center">
              ابتدا فلش‌کارت بساز تا بتوانی آزمون بدهی
            </div>
          )}
        </div>
      )}

      {step === "running" && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">
              سوال {toFa(questionIndex + 1)} از {toFa(questions.length)}
            </span>
            {config.mode === "timed" && (
              <span className={cn("font-bold tabular-nums", timeLeft < 60 ? "text-rose-500" : "text-slate-700 dark:text-slate-200")}>
                ⏱ {formatClock(timeLeft * 1000)}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-500 transition-all duration-300"
              style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }}
            />
          </div>

          {/* Question */}
          <Card className="text-center py-6">
            <div className="text-lg font-medium text-slate-800 dark:text-slate-100 mb-2">
              {questions[questionIndex]?.front}
            </div>
            {showAnswer && (
              <div className="mt-4 p-3 rounded-xl bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-700">
                <div className="text-sm text-teal-700 dark:text-teal-300">
                  <span className="font-bold">پاسخ: </span>
                  {questions[questionIndex]?.back}
                </div>
              </div>
            )}
          </Card>

          {/* Actions */}
          {!showAnswer ? (
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => submitAnswer("skip")} className="flex-1">
                رد شدم
              </Button>
              <Button variant="outline" onClick={() => submitAnswer("wrong")} className="flex-1 border-rose-200 text-rose-600 dark:text-rose-400 dark:border-rose-700">
                ❌ غلط
              </Button>
              <Button onClick={() => submitAnswer("correct")} className="flex-1 bg-emerald-600">
                ✅ درست
              </Button>
            </div>
          ) : (
            <Button onClick={nextQuestion} className="w-full">
              {questionIndex + 1 >= questions.length ? "پایان آزمون" : "سوال بعدی ←"}
            </Button>
          )}
        </div>
      )}

      {step === "result" && (
        <div className="space-y-4">
          <div className="text-center">
            <div className="text-5xl mb-2">{percent >= 70 ? "🎉" : percent >= 40 ? "💪" : "📚"}</div>
            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{toFa(percent)}٪</div>
            <div className="text-sm text-slate-500 mt-1">
              {percent >= 70 ? "عالی بود!" : percent >= 40 ? "ادامه بده!" : "بیشتر تمرین کن!"}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Card className="text-center p-3">
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{toFa(correctCount)}</div>
              <div className="text-xs text-slate-500">درست ✅</div>
            </Card>
            <Card className="text-center p-3">
              <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">{toFa(wrongCount)}</div>
              <div className="text-xs text-slate-500">غلط ❌</div>
            </Card>
            <Card className="text-center p-3">
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{toFa(skipCount)}</div>
              <div className="text-xs text-slate-500">رد شده ⏭</div>
            </Card>
          </div>

          {config.mode === "timed" && (
            <div className="text-center text-sm text-slate-500">
              ⏱ زمان باقی‌مانده: {formatClock(timeLeft * 1000)}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={resetAll} className="flex-1">
              آزمون جدید
            </Button>
            <Button onClick={() => { resetAll(); onClose(); }} className="flex-1">
              بستن
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
