const periodPattern = /^\d{4}(?:-(0[1-9]|1[0-2]))?$/;

const validPeriodForFrequency = (period, frequency) => frequency === "annual"
  ? /^\d{4}$/.test(period || "")
  : frequency === "monthly"
    ? /^\d{4}-(0[1-9]|1[0-2])$/.test(period || "")
    : periodPattern.test(period || "");

export function buildFeeAssignmentPayload(values, frequency) {
  const startPeriod = values.startPeriod?.trim();
  const endPeriod = values.endPeriod?.trim();
  if (!validPeriodForFrequency(startPeriod, frequency) || (endPeriod && !validPeriodForFrequency(endPeriod, frequency))) {
    throw new Error(frequency === "annual"
      ? "Use a year in YYYY format for this annual fee structure."
      : frequency === "monthly"
        ? "Use a month in YYYY-MM format for this monthly fee structure."
        : "Use a valid period: YYYY for annual fees or YYYY-MM for monthly fees.");
  }
  if (endPeriod && endPeriod < startPeriod) throw new Error("End period must not precede start period.");
  const fixedDiscount = values.discountAmountMinor === "" || values.discountAmountMinor == null
    ? undefined : Number(values.discountAmountMinor);
  const percent = values.discountBasisPoints === "" || values.discountBasisPoints == null
    ? undefined : Number(values.discountBasisPoints);
  if (fixedDiscount !== undefined && percent !== undefined && fixedDiscount > 0 && percent > 0) {
    throw new Error("Use either a fixed discount or a percentage discount, not both.");
  }
  if (fixedDiscount !== undefined && (!Number.isInteger(fixedDiscount) || fixedDiscount < 0 || fixedDiscount > 100000000)) {
    throw new Error("Fixed discount must be a whole amount in minor units.");
  }
  if (percent !== undefined && (!Number.isInteger(percent) || percent < 0 || percent > 10000)) {
    throw new Error("Percentage discount must be between 0 and 10000 basis points.");
  }
  return {
    studentId: values.studentId,
    feeStructureId: values.feeStructureId,
    ...(fixedDiscount !== undefined ? { discountAmountMinor: fixedDiscount } : {}),
    ...(percent !== undefined ? { discountBasisPoints: percent } : {}),
    ...(values.scholarshipName?.trim() ? { scholarshipName: values.scholarshipName.trim() } : {}),
    startPeriod,
    ...(endPeriod ? { endPeriod } : {})
  };
}

export function buildVoucherGenerationPayload(values, frequency) {
  const period = values.period?.trim();
  const studentIds = [...new Set(values.studentIds || [])];
  if (!validPeriodForFrequency(period, frequency)) {
    throw new Error(frequency === "annual" ? "Enter the year in YYYY format." : "Enter the month in YYYY-MM format.");
  }
  if (studentIds.length < 1 || studentIds.length > 500) throw new Error("Select between 1 and 500 students.");
  return { feeStructureId: values.feeStructureId, period, studentIds };
}
