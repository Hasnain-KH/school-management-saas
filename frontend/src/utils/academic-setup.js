export function buildAcademicSetupPayload(tab, form) {
  const number = (key) => Number(form[key]);
  if (tab === "classes") {
    return { endpoint: "/academics/classes", body: { name: form.name, code: form.code, ...(form.level ? { level: number("level") } : {}) } };
  }
  if (tab === "sessions") {
    return { endpoint: "/academics/sessions", body: { name: form.name, startDate: form.startDate, endDate: form.endDate } };
  }
  if (tab === "sections") {
    return { endpoint: "/academics/sections", body: { academicSessionId: form.academicSessionId, classId: form.classId, branchId: form.branchId, name: form.name, ...(form.capacity ? { capacity: number("capacity") } : {}) } };
  }
  if (tab === "subjects") {
    return { endpoint: "/academics/subjects", body: { name: form.name, code: form.code, category: form.category } };
  }
  if (tab === "assignments") {
    return { endpoint: "/academics/class-subjects", body: { academicSessionId: form.academicSessionId, classId: form.classId, subjectId: form.subjectId, ...(form.teacherId ? { teacherId: form.teacherId } : {}), ...(form.periodsPerWeek ? { periodsPerWeek: number("periodsPerWeek") } : {}) } };
  }
  return {
    endpoint: "/academics/timetable",
    body: {
      academicSessionId: form.academicSessionId,
      sectionId: form.sectionId,
      classSubjectId: form.classSubjectId,
      dayOfWeek: number("dayOfWeek"),
      periodNumber: number("periodNumber"),
      startsAt: form.startsAt,
      endsAt: form.endsAt,
      ...(form.room ? { room: form.room } : {})
    }
  };
}
