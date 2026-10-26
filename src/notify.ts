import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

/**
 * Shows a Windows notification only when the window is not in front, so a long
 * cherry-pick can run in the background. Failures only lose the notification.
 */
export async function notifyInBackground(title: string, body: string): Promise<void> {
  if (document.hasFocus()) return;
  try {
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (granted) sendNotification({ title, body });
  } catch {
    // The in-app banner still shows the state.
  }
}
