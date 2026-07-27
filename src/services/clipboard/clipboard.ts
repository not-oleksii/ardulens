/** Copies text to the clipboard, falling back to a hidden textarea + execCommand where the async Clipboard API is unavailable. */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // fall through to the legacy path below
    }
  }

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    if (!document.execCommand("copy")) throw new Error("execCommand('copy') returned false");
  } finally {
    document.body.removeChild(ta);
  }
}
