// Presentation helpers for the MANUAL subscription payment workflow.
// These functions contain no network calls and deliberately never construct a
// checkout link, payment submission, or any other gateway behaviour.

const TYPE_LABELS = {
  bank_account: "Bank account",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  other: "Other method"
};

export function accountTypeLabel(type) {
  return TYPE_LABELS[type] || String(type ?? "—").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

// A school owner can copy a single detail without exposing the rest of the
// account. Wallet accounts use the mobile number as their primary reference.
export function copyableAccountDetails(account) {
  if (!account) return [];
  const details = [];
  if (account.accountNumber) details.push({ label: "Account number", value: String(account.accountNumber) });
  if (account.iban) details.push({ label: "IBAN", value: String(account.iban) });
  if (account.mobileWalletNumber) details.push({ label: "Mobile wallet number", value: String(account.mobileWalletNumber) });
  return details;
}

export function accountInstructionText(account) {
  if (!account) return "";
  const parts = [`Pay to ${account.accountTitle || "the account title shown above"}`];
  if (account.providerName) parts.push(`at ${account.providerName}`);
  const reference = account.iban || account.accountNumber || account.mobileWalletNumber;
  if (reference) parts.push(`using account reference ${reference}`);
  return parts.join(" ") + ".";
}

export const MANUAL_PAYMENT_STEPS = [
  "View the active receiving account details below.",
  "Send the subscription payment manually outside SchoolFlow (bank transfer or mobile wallet).",
  "The Super Admin verifies the payment independently.",
  "The Super Admin manually activates or renews the subscription using the existing admin workflow."
];

// navigator.clipboard is unavailable on insecure origins, so surface a clear
// message instead of silently pretending the copy succeeded.
export async function copyAccountDetail(text) {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    throw new Error("Clipboard access is unavailable. Select and copy the value manually.");
  }
  await navigator.clipboard.writeText(String(text));
}
