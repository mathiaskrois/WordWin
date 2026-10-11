import { useRef } from "react";

// Use DOM elements so Safari's Shortcuts extension can work across JS worlds.
export function ShortcutImport({
  onImport,
}: {
  onImport: (file: File) => Promise<boolean>;
}) {
  const data = useRef<HTMLTextAreaElement>(null);
  const receipt = useRef<HTMLOutputElement>(null);
  const pending = useRef(false);

  async function receive() {
    const payload = data.current!.value;
    data.current!.value = "";
    let id = "";
    let ownsRequest = false;
    try {
      const request = JSON.parse(payload);
      if (typeof request.id !== "string" || !request.id || request.id.length > 100)
        throw new Error("Invalid import request.");
      id = request.id;
      if (pending.current) throw new Error("An image is already being imported.");
      pending.current = true;
      ownsRequest = true;
      if (
        typeof request.image !== "string" ||
        request.image.length > 28_000_000 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(request.image)
      ) throw new Error("Invalid image. Choose a screenshot smaller than 20 MB.");
      const bytes = Uint8Array.from(atob(request.image), (c) => c.charCodeAt(0));
      const file = new File([bytes], "shortcut-screenshot.png", { type: "image/png" });
      if (!(await onImport(file)))
        throw new Error("WordWin could not receive the image. Keep the original photo.");
      receipt.current!.textContent = JSON.stringify({ id, received: true });
    } catch (error) {
      receipt.current!.textContent = JSON.stringify({
        id,
        received: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (ownsRequest) pending.current = false;
    }
  }

  return (
    <div hidden aria-hidden="true">
      <textarea id="wordwin-shortcut-data" ref={data} />
      <button id="wordwin-shortcut-import" onClick={() => void receive()} type="button">
        Receive shortcut image
      </button>
      <output id="wordwin-shortcut-receipt" ref={receipt} />
    </div>
  );
}
