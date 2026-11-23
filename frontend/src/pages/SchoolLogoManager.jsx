import { useEffect, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, Trash2 } from "../components/ui/icon/icons.jsx";
import { del, post } from "../api/client.js";
import { useAuth } from "../auth/AuthProvider.jsx";
import { Notice } from "../components/feedback.jsx";
import { confirmDanger, notify } from "../components/feedback/appFeedback.js";
import { useUnsavedChanges } from "../components/feedback/unsavedChanges.js";
import SchoolLogo from "../components/SchoolLogo.jsx";
import {
  SCHOOL_LOGO_ACCEPT,
  SCHOOL_LOGO_FORMAT_LABEL,
  readFileAsBase64,
  readLogoHeader,
  validateSchoolLogoFile
} from "../utils/school-logo.js";

// Self-contained logo management panel mounted in the School Profile page.
// School identity is implicit in the request path (/schools/me/logo) — the
// client never sends a schoolId, so tenant authority stays server-side.
export default function SchoolLogoManager({ school, onUpdated }) {
  const { refreshIdentity } = useAuth();
  const fileInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // local file-validation feedback only
  const [pending, setPending] = useState(null); // { file, contentType, url, name }

  const hasLogo = Boolean(school?.logo?.version);
  useUnsavedChanges(Boolean(pending) && !busy, "You have a selected logo that has not been saved yet. Leave without saving?");

  useEffect(() => () => {
    if (pending?.url) URL.revokeObjectURL(pending.url);
  }, [pending]);

  const clearPending = () => setPending((old) => {
    if (old?.url) URL.revokeObjectURL(old.url);
    return null;
  });

  const openPicker = () => fileInputRef.current?.click();

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow selecting the same file again
    if (!file) return;
    setNotice(null);

    let validation;
    try {
      validation = validateSchoolLogoFile(file, await readLogoHeader(file));
    } catch {
      validation = { ok: false, error: "The file could not be read." };
    }
    if (!validation.ok) {
      clearPending();
      setNotice({ type: "error", message: validation.error });
      return;
    }

    const url = URL.createObjectURL(file);
    setPending((old) => {
      if (old?.url) URL.revokeObjectURL(old.url);
      return { file, contentType: validation.contentType, url, name: file.name };
    });
  };

  const saveLogo = async () => {
    if (!pending || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const dataBase64 = await readFileAsBase64(pending.file);
      const result = await post("/schools/me/logo", {
        fileName: pending.name,
        contentType: pending.contentType,
        dataBase64
      });
      clearPending();
      await refreshIdentity();
      onUpdated?.(result.logo);
      // Release the busy state before announcing success so the controls are
      // usable as soon as the success message becomes visible.
      setBusy(false);
      notify.success("School logo uploaded successfully. It now appears across all workspaces.");
    } catch (error) {
      setBusy(false);
      notify.error(error, { title: "The logo could not be uploaded" });
    } finally {
      setBusy(false);
    }
  };

  const removeLogo = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      await del("/schools/me/logo");
      await refreshIdentity();
      onUpdated?.(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="content-card logo-manager module-subpanel" aria-labelledby="logo-manager-heading">
      <h2 id="logo-manager-heading">School logo</h2>
      <p className="muted">Upload your school&apos;s logo to display it in the sidebar and header of every workspace.</p>

      <div className="logo-manager-body">
        <div className="logo-preview-wrap">
          <span className="logo-preview">
            {pending ? (
              <SchoolLogo
                src={pending.url}
                size={44}
                label="Selected logo preview"
                fallback={<ImagePlus size={40} aria-hidden="true" />}
                decorative={false}
              />
            ) : (
              <SchoolLogo
                school={school}
                size={44}
                label="Current school logo"
                fallback={school?.name?.slice(0, 1) || "S"}
                decorative={false}
              />
            )}
          </span>
          <div className="logo-preview-meta">
            <strong>{pending ? "Preview — not saved yet" : hasLogo ? "Current logo" : "No logo yet"}</strong>
            <span>{pending ? pending.name : hasLogo ? school.logo.fileName : "A default icon is shown across workspaces."}</span>
          </div>
        </div>

        <div className="logo-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept={SCHOOL_LOGO_ACCEPT}
            className="sr-only"
            onChange={handleFile}
            aria-label="Choose a logo image"
            tabIndex={-1}
          />
          <button type="button" className="button button-primary" onClick={openPicker} disabled={busy}>
            <ImagePlus size={16} aria-hidden="true" />{hasLogo ? "Replace logo" : "Upload school logo"}
          </button>
          {pending && (
            <button type="button" className="button button-primary" onClick={saveLogo} disabled={busy}>
              {busy ? <><LoaderCircle className="spin" size={16} aria-hidden="true" />Saving…</> : "Save logo"}
            </button>
          )}
          {pending && (
            <button type="button" className="button button-outline" onClick={() => { clearPending(); setNotice(null); }} disabled={busy}>
              Cancel
            </button>
          )}
          {hasLogo && !pending && (
            <button type="button" className="button button-outline" disabled={busy} onClick={() => confirmDanger({
              title: "Remove school logo?",
              message: "Your school will return to the default icon across all workspaces. This cannot be undone.",
              confirmText: "Remove logo",
              onConfirm: removeLogo,
              success: { title: "School logo removed", description: "The default icon is now shown." },
              error: { title: "The logo could not be removed" }
            })}>
              <Trash2 size={16} aria-hidden="true" />Remove logo
            </button>
          )}
        </div>
      </div>

      {busy && pending && <div className="upload-status" role="status" aria-live="polite"><span className="upload-status-bar" aria-hidden="true" /><span>Uploading logo… Please keep this window open.</span></div>}
      <p className="field-hint">Supported formats: {SCHOOL_LOGO_FORMAT_LABEL}. Your logo is stored securely and shown only within your school.</p>
      <Notice notice={notice} onClose={() => setNotice(null)} />
    </section>
  );
}
