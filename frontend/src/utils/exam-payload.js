const validTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || "");
const validDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};

export function buildExamPayload(values) {
  const gradingScale = values.gradingScale.map((band) => ({
    minPercent: Number(band.minPercent),
    maxPercent: Number(band.maxPercent),
    grade: band.grade.trim(),
    ...(band.remark.trim() ? { remark: band.remark.trim() } : {})
  }));
  const bands = [...gradingScale].sort((a, b) => a.minPercent - b.minPercent);
  if (!bands.length || bands[0].minPercent !== 0 || bands.at(-1).maxPercent !== 100
    || new Set(bands.map((band) => band.grade)).size !== bands.length
    || bands.some((band, index) => !band.grade
      || !Number.isFinite(band.minPercent)
      || !Number.isFinite(band.maxPercent)
      || band.minPercent < 0
      || band.maxPercent > 100
      || band.maxPercent < band.minPercent
      || (index > 0 && bands[index - 1].maxPercent !== band.minPercent))) {
    throw new Error("Grading bands must uniquely and continuously cover 0 to 100 percent.");
  }

  const subjects = values.subjects.map((subject) => ({
    classSubjectId: subject.classSubjectId,
    examDate: subject.examDate,
    startTime: subject.startTime,
    durationMinutes: Number(subject.durationMinutes),
    maxMarks: Number(subject.maxMarks),
    passingMarks: Number(subject.passingMarks)
  }));
  if (!subjects.length || new Set(subjects.map((subject) => subject.classSubjectId)).size !== subjects.length) {
    throw new Error("Select each scheduled class subject only once.");
  }
  const byDay = new Map();
  for (const subject of subjects) {
    if (!validDate(subject.examDate) || !validTime(subject.startTime)
      || !Number.isInteger(subject.durationMinutes) || subject.durationMinutes < 1 || subject.durationMinutes > 600
      || !Number.isFinite(subject.maxMarks) || subject.maxMarks <= 0 || subject.maxMarks > 10000
      || !Number.isFinite(subject.passingMarks) || subject.passingMarks < 0
      || subject.passingMarks > subject.maxMarks) {
      throw new Error("Each subject needs a valid date, time, duration, and marks range.");
    }
    const start = Number(subject.startTime.slice(0, 2)) * 60 + Number(subject.startTime.slice(3));
    const scheduled = byDay.get(subject.examDate) || [];
    if (scheduled.some((slot) => start < slot.end && start + subject.durationMinutes > slot.start)) {
      throw new Error("Subject schedules on the same day must not overlap.");
    }
    scheduled.push({ start, end: start + subject.durationMinutes });
    byDay.set(subject.examDate, scheduled);
  }

  return {
    academicSessionId: values.academicSessionId,
    classId: values.classId,
    name: values.name.trim(),
    gradingScale,
    subjects
  };
}
