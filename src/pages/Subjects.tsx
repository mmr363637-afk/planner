import { useMemo, useState } from "react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { Button, Card, Chip, ConfirmDialog, EditIcon, EmptyState, Field, Modal, PlayIcon, PlusIcon, PriorityDot, ProgressBar, Segmented, TrashIcon, inputClass } from "../components/ui";
import { DIFFICULTY_LABEL, PRIORITY_LABEL, STATUS_LABEL, SUBJECT_COLORS, type Difficulty, type LearningStatus, type Priority, type Subject, type Topic } from "../types";
import { formatHoursCompact, toFa } from "../lib/jalali";
import { cn } from "../utils/cn";

const STATUS_COLOR: Record<LearningStatus, string> = {
  not_started: "#94a3b8",
  learning: "#3b82f6",
  needs_review: "#f59e0b",
  mastered: "#10b981",
};

export default function SubjectsPage() {
  const { state, addSubject, updateSubject, deleteSubject, addTopic, updateTopic, deleteTopic, startSession, loadSampleData, toast } = useStore();
  const { go } = useNav();
  const [subjectModal, setSubjectModal] = useState<{ open: boolean; editing?: Subject }>({ open: false });
  const [topicModal, setTopicModal] = useState<{ open: boolean; subjectId?: string; editing?: Topic }>({ open: false });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<{ type: "subject" | "topic"; id: string; name: string } | null>(null);

  const topicsBySubject = useMemo(() => {
    const m = new Map<string, Topic[]>();
    for (const t of state.topics) {
      const l = m.get(t.subjectId) ?? [];
      l.push(t);
      m.set(t.subjectId, l);
    }
    return m;
  }, [state.topics]);

  const onStartTopic = (topic: Topic) => {
    if (state.activeSession) {
      toast("یک جلسه فعال داری. ابتدا آن را پایان بده.", "⏳");
    } else {
      startSession(topic.id, "free");
    }
    go("study");
  };

  return (
    <div className="pb-24">
      {state.subjects.length === 0 ? (
        <EmptyState
          icon="📚"
          title="هنوز درسی اضافه نکرده‌ای"
          description="دروس خود (مثل عفونی، قلب، فارماکولوژی) را اضافه کن و برای هر کدام مباحث تعریف کن."
          action={
            <div className="flex flex-col gap-2 items-center">
              <Button onClick={() => setSubjectModal({ open: true })}>
                <PlusIcon /> افزودن اولین درس
              </Button>
              <Button variant="ghost" size="sm" onClick={loadSampleData}>
                یا بارگذاری نمونه دروس پزشکی
              </Button>
            </div>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {state.subjects.map((s) => {
            const topics = topicsBySubject.get(s.id) ?? [];
            const mastered = topics.filter((t) => t.status === "mastered").length;
            const pct = topics.length ? Math.round((mastered / topics.length) * 100) : 0;
            const isOpen = expanded[s.id] ?? true;
            return (
              <Card key={s.id} className="p-0 overflow-hidden">
                <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setExpanded((e) => ({ ...e, [s.id]: !isOpen }))}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0" style={{ backgroundColor: s.color }}>
                    {s.name.slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 dark:text-slate-100">{s.name}</span>
                      <PriorityDot priority={s.priority} />
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {toFa(topics.length)} مبحث · {toFa(mastered)} تکمیل‌شده · {formatHoursCompact(topics.reduce((a, t) => a + t.estimatedMinutes, 0))}
                    </div>
                    <ProgressBar value={pct} color={s.color} className="mt-2" height="h-1.5" />
                  </div>
                  <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="p-2 text-slate-400 hover:text-teal-600" onClick={() => setSubjectModal({ open: true, editing: s })} title="ویرایش">
                      <EditIcon />
                    </button>
                    <button type="button" className="p-2 text-slate-400 hover:text-rose-500" onClick={() => setConfirm({ type: "subject", id: s.id, name: s.name })} title="حذف">
                      <TrashIcon />
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="border-t border-slate-100 dark:border-slate-700/60 px-3 py-2">
                    {topics.length === 0 && <div className="text-xs text-slate-400 text-center py-3">هنوز مبحثی برای این درس ثبت نشده.</div>}
                    {topics.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 py-2.5 border-b last:border-0 border-slate-100 dark:border-slate-700/40">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLOR[t.status] }} title={STATUS_LABEL[t.status]} />
                        <div className="flex-1 min-w-0" onClick={() => setTopicModal({ open: true, subjectId: s.id, editing: t })}>
                          <div className={cn("text-sm font-medium text-slate-800 dark:text-slate-100 truncate", t.status === "mastered" && "line-through opacity-60")}>{t.name}</div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            <Chip>⏱ {formatHoursCompact(t.estimatedMinutes)}</Chip>
                            <Chip>{toFa(t.volume)} صفحه</Chip>
                            <Chip>{DIFFICULTY_LABEL[t.difficulty]}</Chip>
                            <Chip color={STATUS_COLOR[t.status]}>{STATUS_LABEL[t.status]}</Chip>
                          </div>
                        </div>
                        <PriorityDot priority={t.priority} />
                        <button type="button" onClick={() => onStartTopic(t)} className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-900/40 text-teal-600 dark:text-teal-300 flex items-center justify-center" title="شروع مطالعه">
                          <PlayIcon size={14} />
                        </button>
                        <button type="button" onClick={() => setConfirm({ type: "topic", id: t.id, name: t.name })} className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-500 flex items-center justify-center">
                          <TrashIcon />
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setTopicModal({ open: true, subjectId: s.id })} className="w-full text-sm text-teal-600 dark:text-teal-400 font-medium py-2.5 flex items-center justify-center gap-1 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-xl">
                      <PlusIcon /> افزودن مبحث
                    </button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {state.subjects.length > 0 && (
        <button
          type="button"
          onClick={() => setSubjectModal({ open: true })}
          className="fixed bottom-24 left-5 z-30 w-14 h-14 rounded-2xl bg-teal-600 text-white shadow-lg shadow-teal-600/40 flex items-center justify-center hover:bg-teal-700 active:scale-95 transition"
          title="افزودن درس"
        >
          <PlusIcon />
        </button>
      )}

      <SubjectModal
        key={subjectModal.editing?.id ?? "new-subject"}
        open={subjectModal.open}
        editing={subjectModal.editing}
        onClose={() => setSubjectModal({ open: false })}
        onSave={(data) => {
          if (subjectModal.editing) updateSubject(subjectModal.editing.id, data);
          else addSubject(data);
          setSubjectModal({ open: false });
        }}
      />
      <TopicModal
        key={topicModal.editing?.id ?? topicModal.subjectId ?? "new-topic"}
        open={topicModal.open}
        editing={topicModal.editing}
        onClose={() => setTopicModal({ open: false })}
        onSave={(data) => {
          if (topicModal.editing) updateTopic(topicModal.editing.id, data);
          else if (topicModal.subjectId) addTopic({ ...data, subjectId: topicModal.subjectId });
          setTopicModal({ open: false });
        }}
      />
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.type === "subject" ? "حذف درس" : "حذف مبحث"}
        message={confirm?.type === "subject" ? `درس «${confirm?.name}» به همراه تمام مباحث، تسک‌ها و مرورهای آن حذف می‌شود.` : `مبحث «${confirm?.name}» و تسک‌ها و مرورهای مرتبط حذف می‌شوند.`}
        confirmLabel="حذف"
        danger
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.type === "subject") deleteSubject(confirm.id);
          else deleteTopic(confirm.id);
        }}
      />
    </div>
  );
}

function SubjectModal({ open, editing, onClose, onSave }: { open: boolean; editing?: Subject; onClose: () => void; onSave: (d: Omit<Subject, "id" | "createdAt">) => void }) {
  const [name, setName] = useState(editing?.name ?? "");
  const [color, setColor] = useState(editing?.color ?? SUBJECT_COLORS[Math.floor(Math.random() * SUBJECT_COLORS.length)]);
  const [priority, setPriority] = useState<Priority>(editing?.priority ?? "medium");
  const valid = name.trim().length > 0;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "ویرایش درس" : "درس جدید"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button disabled={!valid} onClick={() => onSave({ name: name.trim(), color, priority })}>
            ذخیره
          </Button>
        </>
      }
    >
      <Field label="نام درس">
        <input autoFocus className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً عفونی" />
      </Field>
      <Field label="رنگ">
        <div className="flex flex-wrap gap-2">
          {SUBJECT_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} className={cn("w-8 h-8 rounded-full transition-transform", color === c && "ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-800 scale-110")} style={{ backgroundColor: c }} />
          ))}
        </div>
      </Field>
      <Field label="اولویت درس">
        <Segmented
          value={priority}
          onChange={setPriority}
          options={(["low", "medium", "high"] as Priority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
        />
      </Field>
    </Modal>
  );
}

function TopicModal({ open, editing, onClose, onSave }: { open: boolean; editing?: Topic; onClose: () => void; onSave: (d: Omit<Topic, "id" | "createdAt" | "subjectId">) => void }) {
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [volume, setVolume] = useState(editing?.volume ?? 10);
  const [estimatedMinutes, setEstimatedMinutes] = useState(editing?.estimatedMinutes ?? 60);
  const [priority, setPriority] = useState<Priority>(editing?.priority ?? "medium");
  const [difficulty, setDifficulty] = useState<Difficulty>(editing?.difficulty ?? 2);
  const [status, setStatus] = useState<LearningStatus>(editing?.status ?? "not_started");
  const valid = name.trim().length > 0 && estimatedMinutes > 0;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "ویرایش مبحث" : "مبحث جدید"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            انصراف
          </Button>
          <Button disabled={!valid} onClick={() => onSave({ name: name.trim(), description: description.trim() || undefined, volume, estimatedMinutes, priority, difficulty, status })}>
            ذخیره
          </Button>
        </>
      }
    >
      <Field label="نام مبحث">
        <input autoFocus className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً Endocarditis" />
      </Field>
      <Field label="توضیح (اختیاری)">
        <textarea className={cn(inputClass, "min-h-[64px] resize-none")} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="منبع، فصل، نکات…" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="حجم (صفحه)">
          <input type="number" min={1} className={inputClass} value={volume} onChange={(e) => setVolume(Math.max(0, Number(e.target.value)))} />
        </Field>
        <Field label="زمان تخمینی (دقیقه)">
          <input type="number" min={5} step={5} className={inputClass} value={estimatedMinutes} onChange={(e) => setEstimatedMinutes(Math.max(0, Number(e.target.value)))} />
        </Field>
      </div>
      <Field label="اولویت">
        <Segmented value={priority} onChange={setPriority} options={(["low", "medium", "high"] as Priority[]).map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />
      </Field>
      <Field label="سختی">
        <Segmented value={String(difficulty) as "1" | "2" | "3"} onChange={(v) => setDifficulty(Number(v) as Difficulty)} options={[{ value: "1", label: "آسان" }, { value: "2", label: "متوسط" }, { value: "3", label: "سخت" }]} />
      </Field>
      {editing && (
        <Field label="وضعیت یادگیری">
          <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as LearningStatus)}>
            {(Object.keys(STATUS_LABEL) as LearningStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
      )}
    </Modal>
  );
}
