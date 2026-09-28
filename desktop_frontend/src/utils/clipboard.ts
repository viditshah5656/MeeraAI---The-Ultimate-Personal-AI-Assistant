export async function copyText(value: string): Promise<boolean> {
  const text = String(value ?? "");
  if (!text) {
    return false;
  }

  try {
    if (typeof window !== "undefined" && window.meera?.shareChat) {
      const result = await window.meera.shareChat({ target: "copy", text });
      if (result?.ok) {
        return true;
      }
    }
  } catch {
    // Continue through browser and DOM fallbacks.
  }

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Clipboard API may be unavailable outside a secure browser context.
  }

  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}
