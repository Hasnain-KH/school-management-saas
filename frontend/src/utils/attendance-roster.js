export function normalizeAttendanceRoster(items = []) {
  return items.map((item) => {
    const student = item?.student || item || {};
    const attendance = item?.attendance || {};
    const id = student.id || student.studentId || student._id || item?.studentId || attendance.studentId;
    const row = {
      ...student,
      id,
      studentId: id,
      status: attendance.status || item?.status || "present"
    };
    // Preserve recorded times so a saved late mark can be edited without losing its check-in.
    if (attendance.checkIn !== undefined) row.checkIn = attendance.checkIn;
    if (attendance.checkOut !== undefined) row.checkOut = attendance.checkOut;
    return row;
  });
}

// Students marked "late" whose check-in time is still missing. The backend rejects a
// late record without a check-in time, so the UI blocks submission until these are filled.
export function lateStudentsMissingCheckIn(roster = [], status = {}, checkIn = {}) {
  return roster.filter((student) => (status[student.id] || "present") === "late" && !checkIn[student.id]);
}

export function buildStudentAttendancePayload({ date, sectionId, roster = [], status = {}, checkIn = {} }) {
  return {
    date,
    sectionId,
    records: roster.map((student) => {
      const value = status[student.id] || "present";
      const record = { studentId: student.id, status: value };
      // Only present/late records may carry a check-in time; absent/leave must omit it.
      if ((value === "present" || value === "late") && checkIn[student.id]) {
        record.checkIn = checkIn[student.id];
      }
      return record;
    })
  };
}
