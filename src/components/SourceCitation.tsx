import type { SourceEvidence } from "../types";
import { useStore } from "../store";
import { toFa } from "../lib/jalali";
export default function SourceCitation({
  evidence,
}: {
  evidence?: SourceEvidence;
}) {
  const { state } = useStore();
  if (!evidence) return null;
  const page = state.sourceDocuments
    ?.find((d) => d.id === evidence.documentId)
    ?.pages.find((p) => p.number === evidence.page);
  return (
    <details
      onClick={(e) => e.stopPropagation()}
      className="mt-3 p-3 rounded-xl bg-teal-50 dark:bg-teal-950/30 text-sm"
    >
      <summary className="cursor-pointer font-medium text-teal-800 dark:text-teal-200">
        منبع: {evidence.documentTitle} · صفحه {toFa(evidence.page)}
      </summary>
      <blockquote className="whitespace-pre-wrap leading-7 my-3 border-r-2 border-teal-500 pr-3">
        {evidence.quote}
      </blockquote>
      {page ? (
        <details>
          <summary className="text-xs cursor-pointer">متن کامل صفحه</summary>
          <p className="text-sm leading-7 whitespace-pre-wrap mt-2">
            {page.text}
          </p>
        </details>
      ) : (
        <p className="text-xs text-slate-500">
          متن کامل منبع در این دستگاه نیست؛ نقل‌قولِ زمان ساخت کارت حفظ شده است.
        </p>
      )}
      <p className="text-xs text-slate-500 mt-2">
        ارجاع به متنِ ثبت‌شده است، نه تأیید صحت علمی پاسخ.
      </p>
    </details>
  );
}
