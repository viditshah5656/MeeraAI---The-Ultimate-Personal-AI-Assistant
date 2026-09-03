import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

export type AgentInteractionType = "choice" | "multi_choice" | "text" | "textarea" | "location" | "confirm";

export type AgentInteractionOption = {
  value: string;
  label: string;
  description?: string;
  recommended?: boolean;
};

export type AgentInteraction = {
  key: string;
  prompt: string;
  title: string;
  description?: string;
  type: AgentInteractionType;
  options: AgentInteractionOption[];
  placeholder?: string;
  submitLabel: string;
  allowCustom: boolean;
  required: boolean;
  rememberResponse: boolean;
};

export type AgentInteractionResponse = {
  value: string;
  selectedValues?: string[];
  action?: "submit" | "request_location" | "deny_location";
  remember?: boolean;
};

const readString = (value: unknown, maxLength = 700): string =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const normalizeType = (value: unknown, hasOptions: boolean, key: string): AgentInteractionType => {
  const raw = readString(value, 64).toLowerCase().replace(/[\s-]+/g, "_");
  if (["choice", "select", "single_select", "multiple_choice", "multiple_choice_question"].includes(raw)) {
    return "choice";
  }
  if (["multi_choice", "multi_select", "checkboxes"].includes(raw)) {
    return "multi_choice";
  }
  if (["textarea", "long_text", "long_answer"].includes(raw)) {
    return "textarea";
  }
  if (["location", "geolocation", "current_location"].includes(raw)) {
    return "location";
  }
  if (["confirm", "confirmation", "permission", "consent"].includes(raw)) {
    return "confirm";
  }
  if (/(?:^|_)(?:location|geolocation)(?:_|$)/.test(key)) {
    return "location";
  }
  return hasOptions ? "choice" : "text";
};

export function normalizeAgentInteraction(value: unknown): AgentInteraction | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const key = readString(record.key, 120).replace(/[^a-zA-Z0-9_.-]/g, "_");
  const prompt = readString(record.prompt ?? record.question ?? record.message, 1400);
  if (!key || !prompt) {
    return null;
  }

  const rawOptions = Array.isArray(record.options) ? record.options : [];
  const options = rawOptions
    .map((option, index): AgentInteractionOption | null => {
      if (typeof option === "string") {
        const label = readString(option, 180);
        return label ? { value: label, label } : null;
      }
      const optionRecord = asRecord(option);
      if (!optionRecord) {
        return null;
      }
      const label = readString(optionRecord.label ?? optionRecord.title ?? optionRecord.value, 180);
      const optionValue = readString(optionRecord.value ?? optionRecord.id ?? label, 300);
      if (!label || !optionValue) {
        return null;
      }
      return {
        value: optionValue,
        label,
        description: readString(optionRecord.description ?? optionRecord.detail, 360) || undefined,
        recommended: optionRecord.recommended === true || (index === 0 && optionRecord.default === true),
      };
    })
    .filter((option): option is AgentInteractionOption => Boolean(option))
    .slice(0, 8);

  const permission = asRecord(record.permission);
  const permissionKind = readString(permission?.kind ?? permission?.name ?? record.permission_kind, 64).toLowerCase();
  const inferredType = normalizeType(record.input_type ?? record.kind ?? record.type, options.length > 0, key);
  const type: AgentInteractionType = permissionKind === "location" ? "location" : inferredType;
  const title =
    readString(record.title ?? record.heading, 180) ||
    (type === "location" ? "Use your location?" : type === "confirm" ? "Confirm this step" : "Meera needs your input");

  return {
    key,
    prompt,
    title,
    description: readString(record.description ?? record.detail, 520) || undefined,
    type,
    options,
    placeholder: readString(record.placeholder, 180) || undefined,
    submitLabel: readString(record.submit_label ?? record.submitLabel, 80) || "Continue",
    allowCustom: record.allow_custom === true || record.allowCustom === true || (type === "location" && record.allow_manual !== false),
    required: record.required !== false,
    rememberResponse: record.remember === true || record.remember_response === true,
  };
}

export function AgentInteractionSummary({
  interaction,
  onOpen,
}: {
  interaction: AgentInteraction;
  onOpen: () => void;
}) {
  const label = interaction.type === "location" ? "Location requested" : "Input needed to continue";
  return (
    <div className="agent-interaction-summary">
      <div className="agent-interaction-summary-copy">
        <span>{label}</span>
        <strong>{interaction.title}</strong>
      </div>
      <button type="button" onClick={onOpen}>
        Answer now
      </button>
    </div>
  );
}

export function AgentInteractionDialog({
  interaction,
  busy = false,
  onSubmit,
  onDismiss,
}: {
  interaction: AgentInteraction | null;
  busy?: boolean;
  onSubmit: (response: AgentInteractionResponse) => void;
  onDismiss?: () => void;
}) {
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [manualLocation, setManualLocation] = useState(false);
  const primaryControlRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement | null>(null);

  useEffect(() => {
    setInput("");
    setSelected([]);
    setManualLocation(false);
    if (!interaction) {
      return;
    }
    const timer = window.setTimeout(() => primaryControlRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [interaction?.key]);

  const options = useMemo(() => {
    if (!interaction) {
      return [];
    }
    if (interaction.type === "confirm" && interaction.options.length === 0) {
      return [
        { value: "Allow", label: "Allow" },
        { value: "Deny", label: "Deny" },
      ];
    }
    return interaction.options;
  }, [interaction]);

  if (!interaction) {
    return null;
  }

  const submitText = () => {
    const value = input.trim();
    if (!value || busy) {
      return;
    }
    onSubmit({ value, action: "submit", remember: interaction.rememberResponse });
  };

  const submitOption = (option: AgentInteractionOption) => {
    if (busy) {
      return;
    }
    if (interaction.type === "multi_choice") {
      setSelected((current) =>
        current.includes(option.value) ? current.filter((value) => value !== option.value) : [...current, option.value],
      );
      return;
    }
    onSubmit({ value: option.value, selectedValues: [option.value], action: "submit", remember: interaction.rememberResponse });
  };

  const submitMultiChoice = () => {
    if (busy || selected.length === 0) {
      return;
    }
    onSubmit({ value: selected.join(", "), selectedValues: selected, action: "submit", remember: interaction.rememberResponse });
  };

  const canDismiss = !interaction.required && !busy;
  const showTextField = interaction.type === "text" || interaction.type === "textarea" || manualLocation || (interaction.allowCustom && options.length > 0);

  return (
    <div
      className="agent-interaction-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && canDismiss) {
          onDismiss?.();
        }
      }}
    >
      <section className="agent-interaction-dialog" role="dialog" aria-modal="true" aria-labelledby="agent-interaction-title">
        <div className="agent-interaction-dialog-topline">
          <span className="agent-interaction-dialog-status">Meera is waiting</span>
          {canDismiss ? (
            <button type="button" className="agent-interaction-dismiss" onClick={onDismiss} aria-label="Close request">
              ×
            </button>
          ) : null}
        </div>
        <h2 id="agent-interaction-title">{interaction.title}</h2>
        <p className="agent-interaction-prompt">{interaction.prompt}</p>
        {interaction.description ? <p className="agent-interaction-description">{interaction.description}</p> : null}

        {interaction.type === "location" && !manualLocation ? (
          <div className="agent-location-actions">
            <button
              ref={primaryControlRef as RefObject<HTMLButtonElement>}
              type="button"
              className="agent-location-primary"
              disabled={busy}
              onClick={() => onSubmit({ value: "", action: "request_location", remember: interaction.rememberResponse })}
            >
              {busy ? "Getting your location..." : "Use my current location"}
            </button>
            {interaction.allowCustom ? (
              <button type="button" className="agent-interaction-secondary" disabled={busy} onClick={() => setManualLocation(true)}>
                Enter a location instead
              </button>
            ) : null}
            <button
              type="button"
              className="agent-interaction-link"
              disabled={busy}
              onClick={() => onSubmit({ value: "Location permission denied by user.", action: "deny_location" })}
            >
              Don't share location
            </button>
          </div>
        ) : null}

        {options.length > 0 && interaction.type !== "location" ? (
          <div className={`agent-interaction-options ${interaction.type === "multi_choice" ? "is-multi" : ""}`}>
            {options.map((option, index) => {
              const isSelected = selected.includes(option.value);
              return (
                <button
                  ref={index === 0 ? (primaryControlRef as RefObject<HTMLButtonElement>) : undefined}
                  key={`${option.value}-${index}`}
                  type="button"
                  className={`agent-interaction-option ${isSelected ? "is-selected" : ""}`}
                  disabled={busy}
                  onClick={() => submitOption(option)}
                >
                  {interaction.type !== "multi_choice" && (
                    <div className="agent-interaction-option-number" aria-hidden="true">
                      {index + 1}
                    </div>
                  )}
                  <div className="agent-interaction-option-copy">
                    <strong>{option.label}</strong>
                    {option.description ? <small>{option.description}</small> : null}
                  </div>
                  {interaction.type === "multi_choice" && (
                    <div className="agent-interaction-option-check" aria-hidden="true">
                      {isSelected ? "✓" : ""}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ) : null}

        {interaction.type === "multi_choice" && options.length > 0 ? (
          <button type="button" className="agent-interaction-submit" disabled={busy || selected.length === 0} onClick={submitMultiChoice}>
            {interaction.submitLabel}
          </button>
        ) : null}

        {showTextField ? (
          <form
            className="agent-interaction-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitText();
            }}
          >
            {interaction.type === "textarea" ? (
              <textarea
                ref={primaryControlRef as RefObject<HTMLTextAreaElement>}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={interaction.placeholder || "Type your answer"}
                disabled={busy}
                rows={4}
              />
            ) : (
              <input
                ref={primaryControlRef as RefObject<HTMLInputElement>}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={interaction.placeholder || (manualLocation ? "City, address, or landmark" : "Type your answer")}
                disabled={busy}
                autoComplete="off"
              />
            )}
            <button type="submit" className="agent-interaction-submit" disabled={busy || !input.trim()}>
              {interaction.submitLabel}
            </button>
          </form>
        ) : null}

        <p className="agent-interaction-privacy-note">
          {interaction.type === "location"
            ? "Your location is only shared with this task after you approve it."
            : "Your response is added to this task so Meera can continue from the work already completed."}
        </p>
      </section>
    </div>
  );
}
