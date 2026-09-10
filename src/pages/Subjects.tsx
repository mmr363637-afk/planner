import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { useNav } from "../nav";
import { Button, Card, ChevronIcon, Chip, ConfirmDialog, EditIcon, EmptyState, Field, Modal, PlayIcon, PlusIcon, PriorityDot, ProgressBar, Segmented, TrashIcon, inputClass } from "../components/ui";
import { DIFFICULTY_LABEL, PRIORITY_LABEL, STATUS_LABEL, SUBJECT_COLORS, type Difficulty, type LearningStatus, type Priority, type Subject, type Topic, type TopicLink } from "../types";
import { formatHoursCompact, toFa, todayKey } from "../lib/jalali";
import { aggregateStatus, depthOf, isParentTopic, sortedForDisplay } from "../lib/topics";
import { topicEta } from "../lib/eta";
import SkillTree from "../components/SkillTree";
import TestLogModal from "../components/TestLogModal";
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
  const [topicModal, setTopicModal] = useState<{ open: boolean; subjectId?: string; editing?: Topic; parentId?: string }>({ open: false });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [noteTopic, setNoteTopic] = useState<Topic | null>(null);
  const [skillOpen, setSkillOpen] = useState(false);
  const [testTopicId, setTestTopicId] = useState<string | null>(null);
  const today = todayKey();
  const addedSubjectId = useRef<string | null>(null);
  useEffect(() => {
    if (!addedSubjectId.current) return;
    const heading = document.querySelector<HTMLButtonElement>(`[aria-controls="subject-topics-${addedSubjectId.current}"]`);
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    addedSubjectId.current = null;
  }, [state.subjects]);
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
    <div className="pb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-50">دروس من</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">درس‌های دلخواه تو، در کنار نمونه‌های اختیاری</p>
        </div>
        {state.subjects.length > 0 && (
          <div className="flex gap-1.5 shrink-0">
            <Button variant="secondary" size="sm" onClick={() => setSkillOpen(true)} title="نمای گرافیِ درس‌ها و مباحث">
              🗺 نقشه
            </Button>
            <Button className="whitespace-nowrap" onClick={() => setSubjectModal({ open: true })}>
              <PlusIcon /> افزودن درس
            </Button>
          </div>
        )}
      </div>
      {state.subjects.length > 0 && (
        <Card className="mb-4">
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400 mb-3">
            به درس‌های نمونه محدود نیستی؛ هر درس و مبحثی را خودت اضافه یا ویرایش کن.
            با به‌روزرسانی نمونه‌ها فقط موارد جدید اضافه می‌شوند، نه نسخهٔ تکراری درس‌های قبلی.
          </p>
          <Button variant="secondary" size="sm" onClick={loadSampleData}>📚 افزودن / به‌روزرسانی نمونه‌های پزشکی</Button>
        </Card>
      )}
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
            const isOpen = expanded[s.id] ?? (!s.sampleId && topics.length <= 6);
            return (
              <Card key={s.id} className="p-0 overflow-hidden">
                <div className="flex items-center gap-2 p-4">
                  <button type="button" aria-expanded={isOpen} aria-controls={`subject-topics-${s.id}`} onClick={() => setExpanded((e) => ({ ...e, [s.id]: !isOpen }))} className="flex flex-1 min-w-0 items-center gap-3 text-right">
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
                    <span className={cn("text-slate-400 shrink-0 transition-transform", isOpen && "rotate-180")}><ChevronIcon dir="down" /></span>
                  </button>
                  <div className="flex items-center gap-0.5">
                    <button type="button" className="p-2 text-slate-400 hover:text-teal-600" onClick={() => setSubjectModal({ open: true, editing: s })} title={`ویرایش درس ${s.name}`}>
                      <EditIcon />
                    </button>
                    <button type="button" className="p-2 text-slate-400 hover:text-rose-500" onClick={() => setConfirm({ type: "subject", id: s.id, name: s.name })} title={`حذف درس ${s.name}`}>
                      <TrashIcon />
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div id={`subject-topics-${s.id}`} className="border-t border-slate-100 dark:border-slate-700/60 px-3 py-2">
                    {topics.length === 0 && <div className="text-xs text-slate-400 text-center py-3">هنوز مبحثی برای این درس ثبت نشده.</div>}
                    {sortedForDisplay(topics).map((t) => {
                      const depth = depthOf(t, topics);
                      const parent = isParentTopic(t, topics);
                      const kidCount = topics.filter((x) => x.parentId === t.id).length;
                      const effStatus = parent ? aggregateStatus(t, topics) : t.status;
                      return (
                      <div key={t.id} className="flex items-center gap-2 py-2.5 border-b last:border-0 border-slate-100 dark:border-slate-700/40" style={depth > 0 ? { marginInlineStart: depth * 14 } : undefined}>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLOR[effStatus] }} title={STATUS_LABEL[effStatus]} />
                        <div className="flex-1 min-w-0" onClick={() => setTopicModal({ open: true, subjectId: s.id, editing: t })}>
                          <div className={cn("text-sm font-medium text-slate-800 dark:text-slate-100 truncate", t.status === "mastered" && "line-through opacity-60")}>
                            {depth > 0 && <span className="text-slate-300 dark:text-slate-600 ml-1">↳</span>}
                            {t.name}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            <Chip>⏱ {formatHoursCompact(t.estimatedMinutes)}</Chip>
                            <Chip>{toFa(t.volume)} صفحه</Chip>
                            <Chip>{DIFFICULTY_LABEL[t.difficulty]}</Chip>
                            <Chip color={STATUS_COLOR[effStatus]}>{STATUS_LABEL[effStatus]}</Chip>
                            {t.description && <Chip color="#f59e0b">📝 یادداشت</Chip>}
                            {parent && <Chip color="#8b5cf6">🗂 {toFa(kidCount)} زیرمبحث</Chip>}
                            {(t.links?.length ?? 0) > 0 && <Chip color="#0ea5e9">🔗 {toFa(t.links!.length)} منبع</Chip>}
                            {!parent && t.status === "learning" && (() => {
                              const eta = topicEta(t, state.sessions, today);
                              return eta.etaDays != null && eta.etaDays > 0 ? (
                                <Chip color="#14b8a6" title={`با نرخ فعلی (${toFa(eta.dailyRate)} دقیقه در روز)`}>⏳ ~{toFa(eta.etaDays)} روز تا پایان</Chip>
                              ) : null;
                            })()}
                          </div>
                        </div>
                        <PriorityDot priority={t.priority} />
                        {!parent && (
                          <button type="button" onClick={() => setTestTopicId(t.id)} className="w-8 h-8 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/30 flex items-center justify-center" title="ثبت تست برای این مبحث">
                            🧪
                          </button>
                        )}
                        <button type="button" onClick={() => setNoteTopic(t)} className={cn("w-8 h-8 rounded-lg flex items-center justify-center", t.description ? "bg-amber-50 dark:bg-amber-900/30 text-amber-500" : "text-slate-400 hover:text-teal-600")} title="یادداشت مبحث">
                          📝
                        </button>
                        {!parent && (
                          <button type="button" onClick={() => onStartTopic(t)} className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-900/40 text-teal-600 dark:text-teal-300 flex items-center justify-center" title="شروع مطالعه">
                            <PlayIcon size={14} />
                          </button>
                        )}
                        <button type="button" onClick={() => setTopicModal({ open: true, subjectId: s.id, parentId: t.id })} className="w-8 h-8 rounded-lg text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/30 flex items-center justify-center" title="افزودن زیرمبحث">
                          <PlusIcon />
                        </button>
                        <button type="button" onClick={() => setConfirm({ type: "topic", id: t.id, name: t.name })} className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-500 flex items-center justify-center">
                          <TrashIcon />
                        </button>
                      </div>
                      );
                    })}
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

      {subjectModal.open && <SubjectModal
        key={subjectModal.editing?.id ?? "new-subject"}
        open={subjectModal.open}
        editing={subjectModal.editing}
        onClose={() => setSubjectModal({ open: false })}
        onSave={(data) => {
          if (subjectModal.editing) updateSubject(subjectModal.editing.id, data);
          else {
            const subject = addSubject(data);
            addedSubjectId.current = subject.id;
            setExpanded((e) => ({ ...e, [subject.id]: true }));
          }
          setSubjectModal({ open: false });
        }}
      />}
      <SkillTree
        open={skillOpen}
        onClose={() => setSkillOpen(false)}
        onPickTopic={(t) => {
          setSkillOpen(false);
          setTopicModal({ open: true, subjectId: t.subjectId, editing: t });
        }}
      />
      <TestLogModal open={testTopicId != null} presetTopicId={testTopicId ?? undefined} onClose={() => setTestTopicId(null)} />
      {noteTopic && <NoteModal
        key={noteTopic.id}
        topic={noteTopic}
        onClose={() => setNoteTopic(null)}
        onSave={(text) => {
          updateTopic(noteTopic.id, { description: text.trim() || undefined });
          setNoteTopic(null);
          toast("یادداشت ذخیره شد", "📝");
        }}
      />}
      {topicModal.open && <TopicModal
        presetParentId={topicModal.parentId}
        key={topicModal.editing?.id ?? topicModal.parentId ?? topicModal.subjectId ?? "new-topic"}
        open={topicModal.open}
        editing={topicModal.editing}
        onClose={() => setTopicModal({ open: false })}
        onSave={(data) => {
          if (topicModal.editing) updateTopic(topicModal.editing.id, data);
          else if (topicModal.subjectId) addTopic({ ...data, subjectId: topicModal.subjectId, parentId: topicModal.parentId });
          setTopicModal({ open: false });
        }}
      />}
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

function TopicModal({ open, editing, presetParentId, onClose, onSave }: { open: boolean; editing?: Topic; presetParentId?: string; onClose: () => void; onSave: (d: Omit<Topic, "id" | "createdAt" | "subjectId"> & { parentId?: string }) => void }) {
  const { state } = useStore();
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [parentId, setParentId] = useState<string | "">(editing?.parentId ?? presetParentId ?? "");
  const [volume, setVolume] = useState(editing?.volume ?? 10);
  const [estimatedMinutes, setEstimatedMinutes] = useState(editing?.estimatedMinutes ?? 60);
  const [priority, setPriority] = useState<Priority>(editing?.priority ?? "medium");
  const [difficulty, setDifficulty] = useState<Difficulty>(editing?.difficulty ?? 2);
  const [status, setStatus] = useState<LearningStatus>(editing?.status ?? "not_started");
  const [links, setLinks] = useState<TopicLink[]>(editing?.links ?? []);
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const valid = name.trim().length > 0 && estimatedMinutes > 0;
  const linkValid = newLinkUrl.trim().length > 3 && /^https?:\/\//i.test(newLinkUrl.trim());

  const addLinkRow = () => {
    if (!linkValid) return;
    const label = newLinkLabel.trim() || newLinkUrl.trim().replace(/^https?:\/\//i, "").split("/")[0];
    setLinks((ls) => [...ls, { label: label.slice(0, 40), url: newLinkUrl.trim() }]);
    setNewLinkLabel("");
    setNewLinkUrl("");
  };

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
          <Button disabled={!valid} onClick={() => onSave({ name: name.trim(), description: description.trim() || undefined, volume, estimatedMinutes, priority, difficulty, status, parentId: parentId || undefined, links: links.length > 0 ? links : undefined })}>
            ذخیره
          </Button>
        </>
      }
    >
      <Field label="نام مبحث">
        <input autoFocus className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً Endocarditis" />
      </Field>
      <Field label="زیرمبحثِ (اختیاری — خالی = مبحث اصلی)" hint="اگر پر شود این مبحث زیرمبحثِ انتخاب می‌شود و برنامه‌ریزی روی زیرمبحث‌های نهایی انجام می‌شود">
        <select
          className={inputClass}
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
        >
          <option value="">— مبحث اصلی —</option>
          {state.topics
            .filter((t) => t.id !== editing?.id && t.parentId !== editing?.id)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>
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
      {/* منابع مطالعاتی (لینک ویدیو/PDF/جزوه) */}
      <Field label={`منابع مطالعاتی${links.length > 0 ? ` (${links.length})` : ""}`} hint="لینک‌ها فقط متن‌اند و آفلاین ذخیره می‌شوند؛ باز کردنشان به اینترنت نیاز دارد.">
        {links.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-2">
            {links.map((l, i) => (
              <div key={i} className="flex items-center gap-2 text-xs bg-slate-50 dark:bg-slate-900/40 rounded-lg px-2.5 py-2">
                <span className="text-teal-600 dark:text-teal-400">🔗</span>
                <span className="flex-1 min-w-0 truncate text-slate-600 dark:text-slate-300">{l.label}</span>
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-teal-600 dark:text-teal-400 shrink-0" onClick={(e) => e.stopPropagation()}>بازکردن</a>
                <button type="button" onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-500 shrink-0" title="حذف">✕</button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-1.5">
          <input className={cn(inputClass, "flex-1")} value={newLinkLabel} onChange={(e) => setNewLinkLabel(e.target.value)} placeholder="عنوان (مثلاً ویدیوی جزوه)" />
          <input className={cn(inputClass, "flex-[1.4]")} dir="ltr" value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} placeholder="https://…" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLinkRow(); } }} />
          <Button size="sm" variant="secondary" disabled={!linkValid} onClick={addLinkRow}>+</Button>
        </div>
      </Field>
    </Modal>
  );
}


// ===== یادداشت مبحث =====
function NoteModal({ topic, onClose, onSave }: { topic: Topic; onClose: () => void; onSave: (text: string) => void }) {
  const [text, setText] = useState(topic.description ?? "");
  return (
    <Modal open onClose={onClose} title={`یادداشت: ${topic.name}`} footer={<><Button variant="ghost" onClick={onClose}>انصراف</Button><Button onClick={() => onSave(text)}>ذخیره یادداشت</Button></>}>
      <textarea
        autoFocus
        className={cn(inputClass, "min-h-[180px] resize-y leading-relaxed")}
        placeholder="نکات مهم، خلاصه، فرمول‌ها، شماره صفحه و فصل، سوالاتی که باید دوباره ببینی…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="text-[11px] text-slate-400 mt-2">
        یادداشت کنار مبحث ذخیره می‌شود و در پشتیبان‌گیری و انتقال QR هم منتقل می‌شود.
      </div>
    </Modal>
  );
}
