import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { get, patch, post, queryString } from "../api/client.js";
import Modal from "../components/Modal.jsx";
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
  sections: [["name", "Section"], ["classId", "Class ID"], ["academicSessionId", "Session ID"], ["branchId", "Branch ID"], ["capacity", "Capacity"], ["enrolledCount", "Enrolled"], ["isActive", "Active"]],
  subjects: [["name", "Subject"], ["code", "Code"], ["category", "Category"], ["isActive", "Active"]],
  assignments: [["academicSessionId", "Session ID"], ["classId", "Class ID"], ["subjectId", "Subject ID"], ["teacherId", "Teacher ID"], ["periodsPerWeek", "Periods / week"], ["isActive", "Active"]],
  timetable: [["dayOfWeek", "Day"], ["periodNumber", "Period"], ["startsAt", "Starts"], ["endsAt", "Ends"], ["room", "Room"], ["sectionId", "Section ID"], ["classSubjectId", "Class subject ID"]]
};

const LIST_PATHS = {
  classes: "/academics/classes?limit=100",
  sessions: "/academics/sessions?limit=100",
  branches: "/academics/branches?limit=100",
  sections: "/academics/sections?limit=100",
  subjects: "/academics/subjects?limit=100",
  assignments: "/academics/class-subjects?limit=100"
};

export default function AcademicSetupPage() {
  const [tab, setTab] = useState("classes");
  const [records, setRecords] = useState({});
  const [sessions, setSessions] = useState([]);
  const [classes, setClasses] = useState([]);
  const [branches, setBranches] = useState([]);
  const [sections, setSections] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [sessionId, setSessionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
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
      if (editingClass) await patch(`/academics/classes/${editingClass._id}`, body);
      else await post(endpoint, body);
      setNotice({ type: "success", message: editingClass ? "Class updated." : `${TABS.find(([key]) => key === tab)?.[1]} record created.` });
      setDialog(false);
      setEditingClass(null);
      await load();
    } catch (reason) {
      setNotice({ type: "error", message: reason.message || "Could not create academic record." });
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

  const items = records[tab] || [];
  const onTabKeyDown = (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const index = TABS.findIndex(([key]) => key === tab);
    const next = TABS[(index + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length][0];
    setTab(next);
    setEditingClass(null);
    setDialog(false);
    event.currentTarget.parentElement.querySelector(`[data-academic-tab="${next}"]`)?.focus();
  };
  return <>
    <header className="page-intro"><div><div className="page-kicker">SCHOOLFLOW WORKSPACE</div><h1>Academic setup</h1><p>Manage sessions, classes, sections, subjects, and timetables.</p></div><div className="intro-action"><button className="button button-primary" onClick={() => { setEditingClass(null); setDialog(true); }}><Plus size={16} />Add {TABS.find(([key]) => key === tab)?.[1].replace(/s$/, "")}</button></div></header>
    <Notice notice={notice} onClose={() => setNotice(null)} />
    <section className="content-card table-card">
      <div className="tabs" role="tablist" aria-label="Academic setup categories">{TABS.map(([key, label]) => <button key={key} type="button" role="tab" id={`academic-tab-${key}`} aria-controls="academic-tab-panel" data-academic-tab={key} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} className={tab === key ? "tab active-tab" : "tab"} onKeyDown={onTabKeyDown} onClick={() => { setTab(key); setEditingClass(null); setDialog(false); }}>{label}</button>)}</div>
      <div id="academic-tab-panel" role="tabpanel" aria-labelledby={`academic-tab-${tab}`}>
        {tab === "timetable" && <div className="filter-toolbar"><label>Academic session<select value={sessionId} onChange={(event) => setSessionId(event.target.value)}><option value="">Select a session</option>{sessions.map((item) => <option value={item._id} key={item._id}>{item.name} · {item.status}</option>)}</select></label></div>}
        {loading ? <SkeletonRows /> : error ? <ErrorState error={{ message: error }} onRetry={load} /> : items.length ? <div className="table-scroll"><table><thead><tr>{TABLES[tab].map(([, label]) => <th key={label}>{label}</th>)}{tab === "sessions" && <th>Action</th>}{tab === "classes" && <th>Action</th>}</tr></thead><tbody>{items.map((item) => <tr key={item._id}>{TABLES[tab].map(([key]) => <td key={key}>{key === "status" || key === "isActive" ? <span className={`badge badge-${String(item[key]).toLowerCase()}`}>{key === "isActive" ? item[key] ? "Active" : "Inactive" : item[key]}</span> : key.endsWith("Date") ? new Date(item[key]).toLocaleDateString() : key.endsWith("Id") ? academicReference(key, item[key], item, records) : item[key] ?? "—"}</td>)}{tab === "sessions" && <td>{item.status !== "active" && item.status !== "completed" && <button className="button button-small button-outline" onClick={() => activateSession(item._id)}>Activate</button>}</td>}{tab === "classes" && <td><button className="button button-small button-outline" onClick={() => { setEditingClass(item); setDialog(true); }}>Edit</button></td>}</tr>)}</tbody></table></div> : <EmptyState title={`No ${TABS.find(([key]) => key === tab)?.[1].toLowerCase()} yet`} detail={tab === "timetable" && !sessionId ? "Create an academic session before scheduling periods." : "Create a record to get started."} />}
      </div>
    </section>
    {dialog && <AcademicCreateModal tab={tab} editingClass={editingClass} busy={busy} sessions={sessions} classes={classes} branches={branches} sections={sections} subjects={subjects} assignments={assignments} sessionId={sessionId} onClose={() => { setDialog(false); setEditingClass(null); }} onSubmit={submit} />}
  </>;
}

function academicReference(key, value, item, records) {
  const reference = typeof value === "object" ? value?._id || value?.id : value;
  if (!reference) return "—";
  if (typeof value === "object" && (value.name || value.title)) return value.name || value.title;
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
  if (record?.name) return record.name;
  if (key === "teacherId") return item.teacher?.name || item.teacherName || "Assigned teacher";
  return "—";
}

function AcademicCreateModal({ tab, editingClass, busy, sessions, classes, branches, sections, subjects, assignments, sessionId, onClose, onSubmit }) {
  const options = {
    academicSessionId: sessions.map((item) => [item._id, item.name]),
    classId: classes.map((item) => [item._id, `${item.name} · ${item.code}`]),
    branchId: branches.map((item) => [item._id, `${item.name} · ${item.code}`]),
    subjectId: subjects.map((item) => [item._id, `${item.name} · ${item.code}`]),
    sectionId: sections.filter((item) => !sessionId || item.academicSessionId === sessionId).map((item) => [item._id, `${classes.find((cls) => cls._id === item.classId)?.name || "Class"} · ${item.name}`]),
    classSubjectId: assignments.filter((item) => item.teacherId && (!sessionId || item.academicSessionId === sessionId)).map((item) => [item._id, `${classes.find((cls) => cls._id === item.classId)?.name || "Class"} · ${subjects.find((subject) => subject._id === item.subjectId)?.name || "Subject"}`])
  };
  const sessionField = { name: "academicSessionId", label: "Academic session", type: "select", required: true, options: options.academicSessionId, defaultValue: sessionId };
  const classField = { name: "classId", label: "Class", type: "select", required: true, options: options.classId };
  const fields = {
    classes: [{ name: "name", label: "Class name", required: true }, { name: "code", label: "Class code", required: true }, { name: "level", label: "Level", type: "number", min: 0, max: 30 }],
    sessions: [{ name: "name", label: "Session name", required: true }, { name: "startDate", label: "Start date", type: "date", required: true }, { name: "endDate", label: "End date", type: "date", required: true }],
    sections: [sessionField, classField, { name: "branchId", label: "Branch", type: "select", required: true, options: options.branchId }, { name: "name", label: "Section name", required: true }, { name: "capacity", label: "Capacity", type: "number", min: 1, max: 500 }],
    subjects: [{ name: "name", label: "Subject name", required: true }, { name: "code", label: "Subject code", required: true }, { name: "category", label: "Category", type: "select", required: true, options: [["core", "Core"], ["elective", "Elective"]] }],
    assignments: [sessionField, classField, { name: "subjectId", label: "Subject", type: "select", required: true, options: options.subjectId }, { name: "teacherId", label: "Teacher ID (optional)", minLength: 24, maxLength: 24, pattern: "[a-fA-F0-9]{24}" }, { name: "periodsPerWeek", label: "Periods per week", type: "number", min: 1, max: 40 }],
    timetable: [sessionField, { name: "sectionId", label: "Section", type: "select", required: true, options: options.sectionId }, { name: "classSubjectId", label: "Assigned subject (teacher required)", type: "select", required: true, options: options.classSubjectId }, { name: "dayOfWeek", label: "Day (1 Monday – 7 Sunday)", type: "number", min: 1, max: 7, required: true }, { name: "periodNumber", label: "Period number", type: "number", min: 1, max: 20, required: true }, { name: "startsAt", label: "Starts at", type: "time", required: true }, { name: "endsAt", label: "Ends at", type: "time", required: true }, { name: "room", label: "Room" }]
  }[tab];
  return <Modal title={editingClass ? "Edit class" : `Add ${TABS.find(([key]) => key === tab)?.[1]}`} onClose={onClose}><form className="form-stack modal-form" onSubmit={onSubmit}><div className="form-grid">{fields.map((field) => <label key={field.name}>{field.label}{field.type === "select" ? <select name={field.name} defaultValue={field.defaultValue || ""} required={field.required}><option value="" disabled>Select…</option>{field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <input name={field.name} type={field.type || "text"} min={field.min} max={field.max} minLength={field.minLength} maxLength={field.maxLength} pattern={field.pattern} required={field.required} defaultValue={editingClass?.[field.name] ?? ""} />}</label>)}</div>{tab === "assignments" && <small className="field-hint">A subject must have a teacher assigned before it can be added to the timetable. Enter the teacher’s 24-character user ID, or create the assignment without one and assign a teacher later.</small>}{tab === "timetable" && !options.classSubjectId.length && <small className="field-hint">No teacher-assigned class subjects are available for this session. Assign a subject and teacher first.</small>}<div className="modal-actions"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy || (tab === "timetable" && !options.classSubjectId.length)}>{busy ? "Saving…" : editingClass ? "Save changes" : "Create record"}</button></div></form></Modal>;
}
