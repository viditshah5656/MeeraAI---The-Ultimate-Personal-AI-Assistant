import React from "react";

type Badge = { label: string; tone?: "muted" | "accent" | "ok" };

type Props = {
  title: string;
  subtitle?: string;
  badges?: Badge[];
  active?: boolean;
  onClick?: () => void;
  actions?: React.ReactNode;
  titleToolTip?: string;
};

export default function ModelCard({ title, subtitle, badges = [], active, onClick, actions, titleToolTip }: Props) {
  return (
    <button
      type="button"
      className={`model-card ${active ? "active" : ""}`}
      onClick={onClick}
      title={titleToolTip || title}
    >
      <div className="model-card-body">
        <div className="model-card-title">
          <strong>{title}</strong>
        </div>
        {subtitle && <div className="model-card-sub">{subtitle}</div>}
      </div>

      <div className="model-card-meta">
        <div className="model-card-badges">
          {badges.map((b, i) => (
            <span key={i} className={`model-card-badge ${b.tone || "muted"}`}>{b.label}</span>
          ))}
        </div>
        {actions && <div className="model-card-actions">{actions}</div>}
      </div>
    </button>
  );
}
