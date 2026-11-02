export function normalizeAttendanceRoster(items = []) {
  return items.map((item) => {
    const student = item?.student || item || {};
    const attendance = item?.attendance || {};
    const id = student.id || student.studentId || student._id || item?.studentId || attendance.studentId;
    return {
      ...student,
      id,
      studentId: id,
      status: attendance.status || item?.status || "present"
    };
  });
}
