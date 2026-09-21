import { useState } from "react";
import { useStore } from "../store";
import { normalizeFaName } from "../lib/readiness";
import { toFa } from "../lib/jalali";
import { Button, Card, Modal } from "./ui";
import type { Mistake } from "../types";
export default function RemediationCoach() {
  const { state, reviewMistake, recordRemediation } = useStore();
  const [practice, setPractice] = useState<{
      cause: string;
      items: Mistake[];
    } | null>(null),
    [index, setIndex] = useState(0),
    [revealed, setRevealed] = useState(false),
    [answer, setAnswer] = useState(""),
    [correct, setCorrect] = useState(0),
    [finished, setFinished] = useState(false);
  const groups = new Map<string, Mistake[]>();
  for (const m of state.mistakes) {
    if (!m.cause?.trim() || !m.answer?.trim()) continue;
    const cause = normalizeFaName(m.cause);
    groups.set(cause, [...(groups.get(cause) ?? []), m]);
  }
  const repeated = [...groups].filter(([, items]) => items.length >= 2);
  if (!repeated.length) return null;
  const current = practice?.items[index];
  const respond = (remembered: boolean) => {
    if (!practice || !current) return;
    reviewMistake(current.id, remembered);
    const n = correct + (remembered ? 1 : 0);
    setCorrect(n);
    setAnswer("");
    setRevealed(false);
    if (index === practice.items.length - 1) {
      recordRemediation({
        cause: practice.cause,
        mistakeIds: practice.items.map((m) => m.id),
        correct: n,
        total: practice.items.length,
      });
      setFinished(true);
    } else setIndex(index + 1);
  };
  return (
    <Card className="mb-4 border-amber-200">
      <h3 className="font-bold mb-2">از اشتباه مشترک تا تمرین هدفمند</h3>
      <p className="text-xs leading-6 text-slate-500 mb-3">
        بر اساس علت‌هایی که خودت ثبت کرده‌ای؛ تشخیص خودکارِ علت پنهان نیست. پاسخ
        پیش از تلاش تو پنهان می‌ماند.
      </p>
      {repeated.map(([cause, items]) => {
        const attempts = (state.remediationAttempts ?? []).filter(
            (a) => a.cause === cause,
          ),
          last = attempts.at(-1),
          previous = attempts.at(-2);
        return (
          <div
            key={cause}
            className="border-t border-slate-200 dark:border-slate-700 pt-3 mt-3"
          >
            <p className="text-sm font-bold">
              {cause} · {toFa(items.length)} اشتباه
            </p>
            {last && (
              <p className="text-xs my-2">
                آخرین تمرین: {toFa(last.correct)} از {toFa(last.total)}
                {previous
                  ? ` · قبلی: ${toFa(previous.correct)} از ${toFa(previous.total)}`
                  : ""}
                ؛ خودارزیابی روی سؤال‌های قبلی، نه اثبات رفع ضعف.
              </p>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setPractice({
                  cause,
                  items: [...items]
                    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                    .slice(0, 5),
                });
                setIndex(0);
                setCorrect(0);
                setRevealed(false);
                setFinished(false);
                setAnswer("");
              }}
            >
              تمرین کوتاه این علت
            </Button>
          </div>
        );
      })}
      {practice && (
        <Modal
          open
          title={`تمرین: ${practice.cause}`}
          onClose={() => setPractice(null)}
        >
          {finished ? (
            <>
              <p className="text-lg font-bold">
                {toFa(correct)} از {toFa(practice.items.length)} پاسخ را درست
                ارزیابی کردی.
              </p>
              <p className="text-sm leading-7 my-3">
                نتیجه ثبت شد و موعد مرور اشتباه‌ها به‌روز شد. برای سنجش انتقال
                یادگیری، بعداً سؤال تازه‌ای از همین مهارت حل کن.
              </p>
              <Button onClick={() => setPractice(null)}>پایان تمرین</Button>
            </>
          ) : current ? (
            <>
              <p className="text-xs text-slate-500 mb-3">
                سؤال {toFa(index + 1)} از {toFa(practice.items.length)}
              </p>
              <h4 className="font-bold leading-7">{current.question}</h4>
              <label className="text-sm block mt-4">
                پاسخ تو
                <textarea
                  aria-label="پاسخ تمرین"
                  className="w-full border rounded-xl p-3 bg-transparent mt-2"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                />
              </label>
              {!revealed ? (
                <Button className="mt-3" onClick={() => setRevealed(true)}>
                  پاسخ دادم؛ مقایسه با پاسخ ثبت‌شده
                </Button>
              ) : (
                <>
                  <p className="text-sm leading-7 bg-teal-50 dark:bg-teal-950/30 p-3 rounded-xl my-3">
                    {current.answer}
                  </p>
                  <div className="flex gap-2">
                    <Button onClick={() => respond(true)}>
                      درست پاسخ دادم
                    </Button>
                    <Button variant="secondary" onClick={() => respond(false)}>
                      نیاز به تمرین دارم
                    </Button>
                  </div>
                </>
              )}
            </>
          ) : (
            <p>سؤالی باقی نمانده است.</p>
          )}
        </Modal>
      )}
    </Card>
  );
}
