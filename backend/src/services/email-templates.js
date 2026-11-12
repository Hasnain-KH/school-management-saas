const escapeHtml = (value) =>
    String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

const layout = (heading, bodyHtml) => `<!doctype html>
<html><body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.5">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(heading)}</h1>
    ${bodyHtml}
    <p style="margin-top:24px;font-size:12px;color:#64748b">SchoolFlow — School Management Platform</p>
  </div>
</body></html>`;

const button = (href, label) =>
    `<p><a href="${escapeHtml(href)}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${escapeHtml(label)}</a></p>`;

export const appBaseUrl = () => (process.env.APP_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");

export const passwordResetTemplate = ({ token }) => {
    const link = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    return {
        subject: "Reset your SchoolFlow password",
        html: layout("Reset your password", `<p>Use the button below to choose a new password. This link expires in 30 minutes and can only be used once.</p>${button(link, "Reset password")}`),
        text: `Reset your SchoolFlow password: ${link}`
    };
};

export const emailVerificationTemplate = ({ token }) => {
    const link = `${appBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
    return {
        subject: "Verify your SchoolFlow email",
        html: layout("Verify your email", `<p>Confirm your email address to activate your SchoolFlow account.</p>${button(link, "Verify email")}`),
        text: `Verify your SchoolFlow email: ${link}`
    };
};

const formatMoney = (minor, currency) => {
    const amount = (Number(minor ?? 0) / 100).toFixed(2);
    return `${currency ?? ""} ${amount}`.trim();
};

export const overdueFeeReminderTemplate = ({ guardianName, period, dueDate, balanceMinor, currency }) => {
    const due = dueDate ? new Date(dueDate).toISOString().slice(0, 10) : "an earlier date";
    return {
        subject: `School fee reminder — ${period ?? "outstanding balance"}`,
        html: layout("School fee reminder", `<p>Dear ${escapeHtml(guardianName ?? "Guardian")},</p>
      <p>Our records show an outstanding school fee balance of <strong>${escapeHtml(formatMoney(balanceMinor, currency))}</strong> for <strong>${escapeHtml(period ?? "the current period")}</strong>, which was due on ${escapeHtml(due)}.</p>
      <p>Please contact the school office to settle this balance at your earliest convenience.</p>`),
        text: `Outstanding fee balance of ${formatMoney(balanceMinor, currency)} for ${period ?? "the current period"} due ${due}.`
    };
};

export const welcomeTemplate = ({ name, schoolName }) => ({
    subject: "Welcome to SchoolFlow",
    html: layout("Welcome to SchoolFlow", `<p>Hi ${escapeHtml(name ?? "there")},</p>
    <p>Your ${escapeHtml(schoolName ?? "school")} account on SchoolFlow is ready. Sign in to complete your school setup.</p>${button(`${appBaseUrl()}/login`, "Sign in")}`),
    text: `Welcome to SchoolFlow. Sign in: ${appBaseUrl()}/login`
});

export const notificationTemplate = ({ name, title, body }) => ({
    subject: title,
    html: layout(title, `<p>Hi ${escapeHtml(name ?? "there")},</p><p>${escapeHtml(body)}</p>${button(`${appBaseUrl()}/notifications`, "View in SchoolFlow")}`),
    text: `${title}\n\n${body}`
});
