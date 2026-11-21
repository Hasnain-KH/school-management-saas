import { useSyncExternalStore } from "react";
import { appFeedback } from "./feedbackStore.js";
import StatusDialog from "./StatusDialog.jsx";
import ToastViewport from "./ToastViewport.jsx";

/** Mounted once near the app root; renders queued dialogs and toasts. */
export default function FeedbackHost() {
  const snapshot = useSyncExternalStore(appFeedback.subscribe, appFeedback.getSnapshot, appFeedback.getSnapshot);
  const dialog = snapshot.dialogs[0];

  return <>
    {dialog && <StatusDialog
      key={dialog.id}
      dialog={dialog}
      onClose={(id, outcome) => appFeedback.closeDialog(id, outcome)}
    />}
    <ToastViewport
      toasts={snapshot.toasts}
      onDismiss={appFeedback.dismissToast}
      onPause={appFeedback.pauseToast}
      onResume={appFeedback.resumeToast}
    />
  </>;
}
