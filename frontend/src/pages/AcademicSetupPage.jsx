import { useCallback, useEffect, useState } from "react";
import { BookOpen, Pencil, Plus, Trash2 } from "../components/ui/icon/icons.jsx";
import { del, get, patch, post, queryString } from "../api/client.js";
import Modal from "../components/Modal.jsx";
import ModuleHeader from "../components/ModuleHeader.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import RowMenu from "../components/RowMenu.jsx";
import { EmptyState, ErrorState, Notice, SkeletonRows } from "../components/feedback.jsx";
import { buildAcademicSetupPayload } from "../utils/academic-setup.js";

const TABS = [
  ["classes", "Classes"],
  ["sessions", "Sessions"],
  ["sections", "Sections"],
  ["subjects", "Subjects"],
  ["assignments", "Class subjects"],
  ["timetable", "Timetable"]
];

const TABLES = {
  classes: [["name", "Class"], ["code", "Code"], ["level", "Level"], ["isActive", "Active"]],
  sessions: [["name", "Session"], ["startDate", "Start"], ["endDate", "End"], ["status", "Status"]],
  sections: [["name", "Section"], ["classId", "Class"], ["academicSessionId", "Session"], ["branchId", "Branch"], ["capacity", "Capacity"], ["enrolledCount", "Enrolled"], ["isActive", "Active"]],
  subjects: [["name", "Subject"], ["code", "Code"], ["category", "Category"], ["isActive", "Active"]],
  assignments: [["academicSessionId", "Session"], ["classId", "Class"], ["subjectId", "Subject"], ["teacherId", "Teacher"], ["periodsPerWeek", "Periods / week"], ["isActive", "Active"]],
  timetable: [["dayOfWeek", "Day"], ["periodNumber", "Period"], ["startsAt", "Starts"], ["endsAt", "Ends"], ["room", "Room"], ["sectionId", "Section"], ["classSubjectId", "Class subject"]]
};

const REFERENCE_KEYS = ["classId", "academicSessionId", "branchId", "subjectId", "sectionId", "classSubjectId", "teacherId"];
const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const LIST_PATHS = {
  classes: "/academics/classes?limit=100",
  sessions: "/academics/sessions?limit=100",
  branches: "/academics/branches?limit=100",
  sections: "/academics/sections?limit=100",
  subjects: "/academics/subjects?limit=100",
  assignments: "/academics/class-subjects?limit=100"
};

const tabLabel = (key) => TABS.find(([value]) => value === key)?.[1] || "Record";

export default function AcademicSetupPage() {
  const [tab, setTab] = useState("classes");
  const [records, setRecords] = useState({});
  const [sessions, setSessions] = useState([]);
  const [classes, setClasses] = useState([]);
  const [branches, setBranches] = useState([]);
  const [sections, setSections] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [teachersError, setTeachersError] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const entries = await Promise.all(Object.entries(LIST_PATHS).map(async ([key, path]) => [key, await get(path)]));
      const loaded = Object.fromEntries(entries.map(([key, result]) => [key, result.items || []]));
      const active = loaded.sessions.find((item) => item.status === "active");
      const selectedSession = loaded.sessions.some((item) => item._id === sessionId) ? sessionId : active?._id || loaded.sessions[0]?._id || "";
      setRecords(loaded);
      setSessions(loaded.sessions);
      setClasses(loaded.classes);
      setBranches(loaded.branches);
      setSections(loaded.sections);
      setSubjects(loaded.subjects);
      setAssignments(loaded.assignments);
      setSessionId(selectedSession);
      const timetable = selectedSession
        ? await get(`/academics/timetable${queryString({ academicSessionId: selectedSession, limit: 100 })}`)
        : { items: [] };
      setRecords((current) => ({ ...current, timetable: timetable.items || [] }));
    } catch (reason) {
      setError(reason.message || "Could not load academic setup.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { load(); }, []);

  // Active teachers in this school are only readable by roles with users:manage.
  // When that permission is unavailable (for example a principal), the teacher
  // selector degrades gracefully and assignments can be created without a teacher.
  useEffect(() => {
    let active = true;
    get("/users?role=teacher&status=active&limit=100")
      .then((result) => { if (active) setTeachers(result.items || []); })
      .catch((reason) => { if (active) setTeachersError(reason.message || "Teacher list is unavailable."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!sessionId) {
      setRecords((current) => ({ ...current, timetable: [] }));
      return () => { active = false; };
    }
    get(`/academics/timetable${queryString({ academicSessionId: sessionId, limit: 100 })}`)
      .then((result) => { if (active) setRecords((current) => ({ ...current, timetable: result.items || [] })); })
      .catch((reason) => { if (active) setError(reason.message || "Could not load the timetable."); });
    return () => { active = false; };
  }, [sessionId]);

  const submit = async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const { endpoint, body } = buildAcademicSetupPayload(tab, form);
    setBusy(true);
    try {
      if (editing && tab === "classes") await patch(`/academics/classes/${editing._id}`, body);
      else await post(endpoint, body);
      setNotice({ type: "success", message: editing ? `${tabLabel(tab).replace(/s$/, "")} updated.` : `${tabLabel(tab).replace(/s$/, "")} record created.` });
      setDialog(false);
      setEditing(null);
      await load();
    } catch (reason) {
      setNotice({ type: "error", message: reason.message || "Could not save this academic record." });
    } finally {
      setBusy(false);
    }
  };

  const activateSession = async (id) => {
    try {
      await post(`/academics/sessions/${id}/activate`, {});
      setNotice({ type: "success", message: "Academic session activated." });
      await load();
    } catch (reason) {
      setNotice({ type: "error", message: reason.message || "Could not activate session." });
    }
  };

  const removeRecord = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const path = confirm.kind === "timetable" ? `/academics/timetable/${confirm.item._id}` : `/academics/class-subjects/${confirm.item._id}`;
      await del(path);
      setNotice({ type: "success", message: confirm.kind === "timetable" ? "Timetable period removed." : "Class subject removed." });
      setConfirm(null);
      await load();
    } catch (reason) {
      setNotice({ type: "error", message: reason.message || "Could not remove this record." });
    } finally {
      setBusy(false);
    }
  };

  const items = records[tab] || [];
  const lookups = { records, teachers };

  const onTabKeyDown = (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const index = TABS.findIndex(([key]) => key === tab);
    const next = TABS[(index + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length][0];
    setTab(next);
    setEditing(null);
    setDialog(false);
    event.currentTarget.parentElement.querySelector(`[data-academic-tab="${next}"]`)?.focus();
  };

  return <>
    <ModuleHeader
      title="Academic setup"
      description="Manage sessions, classes, sections, subjects, and timetables."
      icon={BookOpen}
      action={<button className="button button-primary" onClick={() => { setEditing(null); setDialog(true); }}><Plus size={16} />Add {tabLabel(tab).replace(/s$/, "").toLowerCase()}</button>}
    />
    <Notice notice={notice} onClose={() => setNotice(null)} />
    <section className="content-card table-card">
      <div className="tabs" role="tablist" aria-label="Academic setup categories">{TABS.map(([key, label]) => <button key={key} type="button" role="tab" id={`academic-tab-${key}`} aria-controls="academic-tab-panel" data-academic-tab={key} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} className={tab === key ? "tab active-tab" : "tab"} onKeyDown={onTabKeyDown} onClick={() => { setTab(key); setEditing(null); setDialog(false); }}>{label}</button>)}</div>
      <div id="academic-tab-panel" role="tabpanel" aria-labelledby={`academic-tab-${tab}`}>
        {tab === "timetable" && <div className="filter-toolbar"><label>Academic session<select value={sessionId} onChange={(event) => setSessionId(event.target.value)}><option value="">Select a session</option>{sessions.map((item) => <option value={item._id} key={item._id}>{item.name} · {item.status}</option>)}</select></label></div>}
        {loading ? <SkeletonRows /> : error ? <ErrorState error={{ message: error }} onRetry={load} /> : items.length ? <div className="table-scroll"><table>
          <thead><tr>{TABLES[tab].map(([, label]) => <th key={label}>{label}</th>)}{tab === "sessions" && <th>Action</th>}{tab === "classes" && <th>Action</th>}{["assignments", "timetable"].includes(tab) && <th>Actions</th>}</tr></thead>
          <tbody>{items.map((item) => <tr key={item._id}>
            {TABLES[tab].map(([key]) => <td key={key}>{renderCell(tab, key, item, lookups)}</td>)}
            {tab === "sessions" && <td>{item.status !== "active" && item.status !== "completed" && <button className="button button-small button-outline" onClick={() => activateSession(item._id)}>Activate</button>}</td>}
            {tab === "classes" && <td><button className="button button-small button-outline" onClick={() => { setEditing(item); setDialog(true); }}><Pencil size={14} aria-hidden="true" />Edit</button></td>}
            {tab === "assignments" && <td><RowMenu label={`Actions for ${referenceText("subjectId", item.subjectId, item, lookups)}`} items={[
              { label: "Update assignment", icon: <Pencil size={15} aria-hidden="true" />, onSelect: () => { setEditing(item); setDialog(true); } },
              { label: "Remove", icon: <Trash2 size={15} aria-hidden="true" />, danger: true, onSelect: () => setConfirm({ kind: "assignment", item }) }
            ]} /></td>}
            {tab === "timetable" && <td><RowMenu label="Timetable period actions" items={[
              { label: "Remove period", icon: <Trash2 size={15} aria-hidden="true" />, danger: true, onSelect: () => setConfirm({ kind: "timetable", item }) }
            ]} /></td>}
          </tr>)}</tbody>
        </table></div> : <EmptyState title={`No ${tabLabel(tab).toLowerCase()} yet`} detail={tab === "timetable" && !sessionId ? "Create an academic session before scheduling periods." : "Create a record to get started."} />}
      </div>
    </section>
    {dialog && <AcademicFormModal tab={tab} editing={editing} busy={busy} sessions={sessions} classes={classes} branches={branches} sections={sections} subjects={subjects} assignments={assignments} teachers={teachers} teachersError={teachersError} sessionId={sessionId} onClose={() => { setDialog(false); setEditing(null); }} onSubmit={submit} />}
    {confirm && <ConfirmDialog
      title={confirm.kind === "timetable" ? "Remove this timetable period?" : "Remove this class subject?"}
      message={confirm.kind === "timetable"
        ? "The scheduled period will be deleted from the timetable. This cannot be undone."
        : "The subject will no longer be assigned to this class for the selected session. Periods that already reference it in the timetable will block removal."}
      confirmLabel={confirm.kind === "timetable" ? "Remove period" : "Remove class subject"}
      busy={busy}
      onClose={() => setConfirm(null)}
      onConfirm={removeRecord}
    />}
  </>;
}

function renderCell(tab, key, item, lookups) {
  const value = item[key];
  if (key === "isActive") return <span className={`badge badge-${value ? "active" : "disabled"}`}>{value ? "Active" : "Inactive"}</span>;
  if (key === "status") return <span className={`badge badge-${String(value).toLowerCase()}`}>{value}</span>;
  if (key === "dayOfWeek") return DAY_NAMES[Number(value)] || "—";
  if (key.endsWith("Date")) return value ? new Date(value).toLocaleDateString() : <span className="muted">—</span>;
  if (REFERENCE_KEYS.includes(key)) return academicReference(key, value, item, lookups);
  if (value === undefined || value === null || value === "") return <span className="muted">—</span>;
  return String(value);
}

function referenceText(key, value, item, lookups) {
  const result = academicReference(key, value, item, lookups);
  return typeof result === "string" ? result : "this record";
}

function academicReference(key, value, item, { records = {}, teachers = [] } = {}) {
  const reference = typeof value === "object" ? value?._id || value?.id : value;
  if (!reference) return <span className="muted">—</span>;
  if (typeof value === "object" && (value.name || value.title)) return value.name || value.title;
  if (key === "teacherId") {
    const teacher = teachers.find((entry) => String(entry.id || entry._id) === String(reference));
    if (teacher?.name) return teacher.name;
    return item.teacher?.name || item.teacherName || "Assigned teacher";
  }
  const sources = {
    classId: ["classes"],
    academicSessionId: ["sessions"],
    branchId: ["branches"],
    subjectId: ["subjects"],
    sectionId: ["sections"],
    classSubjectId: ["assignments"]
  };
  const record = (sources[key] || []).flatMap((source) => records[source] || []).find((entry) => String(entry._id) === String(reference));
  if (key === "classSubjectId" && record) {
    const className = records.classes?.find((entry) => String(entry._id) === String(record.classId))?.name;
    const subjectName = records.subjects?.find((entry) => String(entry._id) === String(record.subjectId))?.name;
    return [className, subjectName].filter(Boolean).join(" · ") || "Class subject";
  }
  if (key === "sectionId" && record) {
    const className = records.classes?.find((entry) => String(entry._id) === String(record.classId))?.name;
    return [className, record.name].filter(Boolean).join(" · ") || "Section";
  }
  if (record?.name) return record.name;
  return <span className="muted">—</span>;
}

function AcademicFormModal({ tab, editing, busy, sessions, classes, branches, sections, subjects, assignments, teachers, teachersError, sessionId, onClose, onSubmit }) {
  const isEditing = Boolean(editing);
  const teacherOptions = [
    ...teachers.map((item) => [item.id || item._id, item.name ? `${item.name}${item.email ? ` · ${item.email}` : ""}` : String(item.id || item._id)]),
    ...(editing?.teacherId && !teachers.some((item) => String(item.id || item._id) === String(editing.teacherId))
      ? [[editing.teacherId, "Current teacher (not in active list)"]]
      : [])
  ];
  const options = {
    academicSessionId: sessions.map((item) => [item._id, item.name]),
    classId: classes.map((item) => [item._id, `${item.name} · ${item.code}`]),
    branchId: branches.map((item) => [item._id, `${item.name} · ${item.code}`]),
    subjectId: subjects.map((item) => [item._id, `${item.name} · ${item.code}`]),
    sectionId: sections.filter((item) => !sessionId || item.academicSessionId === sessionId).map((item) => [item._id, `${classes.find((cls) => cls._id === item.classId)?.name || "Class"} · ${item.name}`]),
    classSubjectId: assignments.filter((item) => item.teacherId && (!sessionId || item.academicSessionId === sessionId)).map((item) => [item._id, `${classes.find((cls) => cls._id === item.classId)?.name || "Class"} · ${subjects.find((subject) => subject._id === item.subjectId)?.name || "Subject"}`])
  };
  const sessionField = { name: "academicSessionId", label: "Academic session", type: "select", required: true, options: options.academicSessionId, defaultValue: editing?.academicSessionId || sessionId, locked: isEditing && tab === "assignments" };
  const classField = { name: "classId", label: "Class", type: "select", required: true, options: options.classId, defaultValue: editing?.classId || "", locked: isEditing && tab === "assignments" };
  const fields = {
    classes: [{ name: "name", label: "Class name", required: true }, { name: "code", label: "Class code", required: true }, { name: "level", label: "Level", type: "number", min: 0, max: 30 }],
    sessions: [{ name: "name", label: "Session name", required: true }, { name: "startDate", label: "Start date", type: "date", required: true }, { name: "endDate", label: "End date", type: "date", required: true }],
    sections: [sessionField, classField, { name: "branchId", label: "Branch", type: "select", required: true, options: options.branchId }, { name: "name", label: "Section name", required: true }, { name: "capacity", label: "Capacity", type: "number", min: 1, max: 500 }],
    subjects: [{ name: "name", label: "Subject name", required: true }, { name: "code", label: "Subject code", required: true }, { name: "category", label: "Category", type: "select", required: true, options: [["core", "Core"], ["elective", "Elective"]] }],
    assignments: [
      sessionField,
      classField,
      { name: "subjectId", label: "Subject", type: "select", required: true, options: options.subjectId, defaultValue: editing?.subjectId || "", locked: isEditing },
      { name: "teacherId", label: "Teacher", type: "select", options: teacherOptions, defaultValue: editing?.teacherId || "", disabled: Boolean(teachersError), hint: teachersError ? `${teachersError} Assignments can be saved without a teacher and updated later.` : "Only active teachers in this school can be assigned." },
      { name: "periodsPerWeek", label: "Periods per week", type: "number", min: 1, max: 40, defaultValue: editing?.periodsPerWeek ?? "" }
    ],
    timetable: [sessionField, { name: "sectionId", label: "Section", type: "select", required: true, options: options.sectionId }, { name: "classSubjectId", label: "Assigned subject (teacher required)", type: "select", required: true, options: options.classSubjectId }, { name: "dayOfWeek", label: "Day (1 Monday – 7 Sunday)", type: "number", min: 1, max: 7, required: true }, { name: "periodNumber", label: "Period number", type: "number", min: 1, max: 20, required: true }, { name: "startsAt", label: "Starts at", type: "time", required: true }, { name: "endsAt", label: "Ends at", type: "time", required: true }, { name: "room", label: "Room" }]
  }[tab];
  const title = isEditing ? (tab === "assignments" ? "Update class subject" : "Edit class") : `Add ${tabLabel(tab).replace(/s$/, "").toLowerCase()}`;
  return <Modal title={title} size={tab === "assignments" ? "lg" : undefined} onClose={onClose}><form className="form-stack modal-form" onSubmit={onSubmit}><div className="form-grid">{fields.map((field) => <label key={field.name}>{field.label}{field.required && <span className="required"> *</span>}
    {field.type === "select" ? <>
      <select name={field.name} defaultValue={field.defaultValue || ""} required={field.required} disabled={field.disabled || field.locked}>
        <option value="" disabled>{field.disabled ? "Unavailable" : "Select…"}</option>
        {field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      {field.locked && <input type="hidden" name={field.name} defaultValue={field.defaultValue} />}
    </> : <input name={field.name} type={field.type || "text"} min={field.min} max={field.max} minLength={field.minLength} maxLength={field.maxLength} pattern={field.pattern} required={field.required} defaultValue={editing?.[field.name] ?? field.defaultValue ?? ""} />}
    {field.hint && <small className="field-hint">{field.hint}</small>}
  </label>)}</div>
  {tab === "assignments" && !isEditing && <small className="field-hint">A subject must have a teacher assigned before it can be added to the timetable. You can leave the teacher blank and assign one later.</small>}
  {tab === "assignments" && isEditing && <small className="field-hint">Re-submitting updates this class subject. Clearing the teacher is not supported by the API yet — the existing teacher is kept if the field is left blank.</small>}
  {tab === "timetable" && !options.classSubjectId.length && <small className="field-hint">No teacher-assigned class subjects are available for this session. Assign a subject and teacher first.</small>}
  <div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy || (tab === "timetable" && !options.classSubjectId.length)}>{busy ? "Saving…" : isEditing ? "Save changes" : "Create record"}</button></div></form></Modal>;
}
