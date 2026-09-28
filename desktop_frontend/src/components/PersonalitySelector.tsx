import { useEffect, useState } from "react";
import { PiCaretDown, PiCheck, PiPower } from "react-icons/pi";

export type PersonalitySummary = {
  id: string;
  name: string;
  purpose: string;
  state: "active" | "paused" | "exited";
  knowledge?: { version?: number; sources?: string[] };
};

type PersonalitySelectorProps = {
  apiBase: string;
  activeId: string | null;
  onActiveChange: (id: string | null) => void;
};

export function PersonalitySelector({ apiBase, activeId, onActiveChange }: PersonalitySelectorProps) {
  const [roles, setRoles] = useState<PersonalitySummary[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const activeRole = roles.find((role) => role.id === activeId) ?? null;

  const refresh = async () => {
    try {
      const response = await fetch(`${apiBase}/api/v1/personalities`);
      if (!response.ok) return;
      const payload = await response.json();
      setRoles(Array.isArray(payload.personalities) ? payload.personalities : []);
      const current = Array.isArray(payload.active) ? payload.active[0] : null;
      onActiveChange(typeof current === "string" ? current : null);
    } catch {
      // Chat remains available when the optional role surface is unavailable.
    }
  };

  useEffect(() => { void refresh(); }, [apiBase]);

  const activate = async (role: PersonalitySummary) => {
    setBusy(true);
    try {
      const response = await fetch(`${apiBase}/api/v1/personalities/${encodeURIComponent(role.id)}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lifecycle: role.id === "coding-agent" ? "project" : "session" }),
      });
      if (response.ok) {
        onActiveChange(role.id);
        setOpen(false);
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    if (!activeRole) return;
    setBusy(true);
    try {
      const response = await fetch(`${apiBase}/api/v1/personalities/${encodeURIComponent(activeRole.id)}/deactivate`, { method: "POST" });
      if (response.ok) {
        onActiveChange(null);
        setOpen(false);
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="personality-selector">
      <button className="personality-selector-trigger" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="personality-selector-status" aria-hidden="true" />
        <span>{activeRole?.name ?? "Default Meera"}</span>
        <PiCaretDown aria-hidden="true" />
      </button>
      {open && (
        <div className="personality-selector-menu" role="menu">
          <div className="personality-selector-heading">Working identity</div>
          {roles.map((role) => (
            <button className="personality-selector-option" type="button" role="menuitem" key={role.id} onClick={() => void activate(role)} disabled={busy}>
              <span>
                <strong>{role.name}</strong>
                <small>{role.purpose}</small>
              </span>
              {role.id === activeId && <PiCheck aria-label="Active" />}
            </button>
          ))}
          {activeRole && (
            <button className="personality-selector-exit" type="button" onClick={() => void deactivate()} disabled={busy}>
              <PiPower aria-hidden="true" /> Exit {activeRole.name}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
