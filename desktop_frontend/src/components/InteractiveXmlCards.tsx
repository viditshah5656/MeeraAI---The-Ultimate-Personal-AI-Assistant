import React, { useState, useMemo, useCallback } from "react";
import {
  LuImage,
  LuMaximize2,
  LuX,
  LuChevronLeft,
  LuChevronRight,
  LuClock,
  LuListOrdered,
  LuSparkles,
  LuArrowRight,
  LuMapPin
} from "react-icons/lu";

// Curated high-definition travel & location photography map
const CURATED_DESTINATION_PHOTOS: Record<string, string> = {
  tegallalang: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80",
  ubud: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80",
  kelingking: "https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?auto=format&fit=crop&w=1200&q=80",
  "nusa penida": "https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?auto=format&fit=crop&w=1200&q=80",
  uluwatu: "https://images.unsplash.com/photo-1555400038-63f5ba517a47?auto=format&fit=crop&w=1200&q=80",
  kecak: "https://images.unsplash.com/photo-1555400038-63f5ba517a47?auto=format&fit=crop&w=1200&q=80",
  "tanah lot": "https://images.unsplash.com/photo-1537953773345-d172ccf13cf1?auto=format&fit=crop&w=1200&q=80",
  "tirta empul": "https://images.unsplash.com/photo-1544644181-1484b3fdfc62?auto=format&fit=crop&w=1200&q=80",
  "tirta gangga": "https://images.unsplash.com/photo-1578469550956-0e16b69c6a3d?auto=format&fit=crop&w=1200&q=80",
  waterfall: "https://images.unsplash.com/photo-1546484475-7f7bd55792da?auto=format&fit=crop&w=1200&q=80",
  "kanto lampo": "https://images.unsplash.com/photo-1546484475-7f7bd55792da?auto=format&fit=crop&w=1200&q=80",
  canggu: "https://images.unsplash.com/photo-1512100356356-de1b84283e18?auto=format&fit=crop&w=1200&q=80",
  seminyak: "https://images.unsplash.com/photo-1512100356356-de1b84283e18?auto=format&fit=crop&w=1200&q=80",
  beach: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
  food: "https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=1200&q=80",
  "nasi campur": "https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=1200&q=80",
  warung: "https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=1200&q=80",
  airport: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=80",
  visa: "https://images.unsplash.com/photo-1569154941061-e231b4725ef1?auto=format&fit=crop&w=1200&q=80",
  egates: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=80",
  bali: "https://images.unsplash.com/photo-1539367628448-4bc5c9d171c8?auto=format&fit=crop&w=1200&q=80",
};

// Resolves a given image src into a usable high-quality image URL
export function resolveDestinationImage(src?: string, alt?: string, caption?: string): string {
  if (src && /^https?:\/\//i.test(src) && !src.includes("image_agent_tag")) {
    return src;
  }

  // Combine query terms
  const searchTerms = `${alt || ""} ${caption || ""} ${src || ""}`.toLowerCase();

  for (const [key, url] of Object.entries(CURATED_DESTINATION_PHOTOS)) {
    if (searchTerms.includes(key)) {
      return url;
    }
  }

  // Fallback to general high-res scenery photo
  return "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80";
}

// ============================================================================
// COMPONENT 1: InteractiveImageCard
// ============================================================================
export interface ImageItem {
  alt?: string;
  caption?: string;
  src?: string;
}

export const InteractiveImageCard: React.FC<ImageItem & { onOpenLightbox?: () => void }> = ({
  alt,
  caption,
  src,
  onOpenLightbox,
}) => {
  const [hasError, setHasError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);

  const resolvedUrl = useMemo(() => resolveDestinationImage(src, alt, caption), [src, alt, caption]);
  const displayCaption = caption || alt || "Visual Location Spotlight";

  const handleOpen = () => {
    if (onOpenLightbox) {
      onOpenLightbox();
    } else {
      setShowLightbox(true);
    }
  };

  return (
    <>
      <div className="interactive-image-card">
        <div className="interactive-image-frame" onClick={handleOpen}>
          {!hasError ? (
            <img
              src={resolvedUrl}
              alt={alt || caption || "Location Image"}
              className={`interactive-image-img ${loaded ? "loaded" : "loading"}`}
              onLoad={() => setLoaded(true)}
              onError={() => setHasError(true)}
              loading="lazy"
            />
          ) : (
            <div className="interactive-image-fallback">
              <LuMapPin size={24} className="fallback-pin-icon" />
              <span>{displayCaption}</span>
            </div>
          )}

          <div className="image-frame-overlay">
            <span className="image-zoom-btn" title="View full size">
              <LuMaximize2 size={14} />
            </span>
          </div>
        </div>

        {displayCaption && (
          <div className="interactive-image-caption">
            <LuImage className="caption-icon" size={13} />
            <span className="caption-text">{displayCaption}</span>
          </div>
        )}
      </div>

      {showLightbox && (
        <div className="image-lightbox-backdrop" onClick={() => setShowLightbox(false)}>
          <div className="image-lightbox-dialog" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="lightbox-close-btn"
              onClick={() => setShowLightbox(false)}
              aria-label="Close image preview"
            >
              <LuX size={18} />
            </button>
            <img src={resolvedUrl} alt={alt || displayCaption} className="lightbox-img" />
            <div className="lightbox-footer">
              <span className="lightbox-caption">{displayCaption}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ============================================================================
// COMPONENT 2: InteractiveCarouselCard
// ============================================================================
export const InteractiveCarouselCard: React.FC<{ images: ImageItem[] }> = ({ images }) => {
  const [activeIndex, setActiveIndex] = useState(0);

  if (!images || images.length === 0) return null;

  const current = images[activeIndex] || images[0];

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  return (
    <div className="interactive-carousel-card">
      <div className="carousel-view-container">
        <InteractiveImageCard {...current} />

        {images.length > 1 && (
          <>
            <button
              type="button"
              className="carousel-nav-btn prev"
              onClick={handlePrev}
              aria-label="Previous image"
            >
              <LuChevronLeft size={18} />
            </button>
            <button
              type="button"
              className="carousel-nav-btn next"
              onClick={handleNext}
              aria-label="Next image"
            >
              <LuChevronRight size={18} />
            </button>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="carousel-indicators">
          <span className="carousel-counter">
            {activeIndex + 1} / {images.length}
          </span>
          <div className="carousel-dots">
            {images.map((_, idx) => (
              <button
                key={`dot-${idx}`}
                type="button"
                className={`carousel-dot ${idx === activeIndex ? "active" : ""}`}
                onClick={() => setActiveIndex(idx)}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// COMPONENT 3: InteractiveTimelineCard
// ============================================================================
export interface TimelineEventItem {
  time?: string;
  title?: string;
  content?: string;
}

export const InteractiveTimelineCard: React.FC<{ events: TimelineEventItem[] }> = ({ events }) => {
  if (!events || events.length === 0) return null;

  return (
    <div className="interactive-timeline-card">
      <div className="timeline-header">
        <span className="timeline-badge">
          <LuClock className="timeline-badge-icon" />
          <span>Timeline & Milestones</span>
        </span>
      </div>

      <div className="timeline-track">
        {events.map((ev, idx) => (
          <div key={`tl-${idx}`} className="timeline-event-item">
            <div className="timeline-node">
              <div className="timeline-dot" />
              {idx < events.length - 1 && <div className="timeline-line" />}
            </div>
            <div className="timeline-content-card">
              <div className="timeline-event-meta">
                {ev.time && (
                  <span className="timeline-time-pill">
                    <LuClock size={11} />
                    <span>{ev.time}</span>
                  </span>
                )}
                {ev.title && <h5 className="timeline-event-title">{ev.title}</h5>}
              </div>
              {ev.content && <p className="timeline-event-text">{ev.content}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// COMPONENT 4: InteractiveSequenceCard
// ============================================================================
export interface SequenceStepItem {
  title?: string;
  subtitle?: string;
  content?: string;
}

export const InteractiveSequenceCard: React.FC<{ steps: SequenceStepItem[] }> = ({ steps }) => {
  if (!steps || steps.length === 0) return null;

  return (
    <div className="interactive-sequence-card">
      <div className="sequence-header">
        <span className="sequence-badge">
          <LuListOrdered className="sequence-badge-icon" />
          <span>Step-by-Step Procedure</span>
        </span>
      </div>

      <div className="sequence-steps-list">
        {steps.map((st, idx) => (
          <div key={`step-${idx}`} className="sequence-step-row">
            <div className="step-num-col">
              <span className="step-number-circle">{idx + 1}</span>
              {idx < steps.length - 1 && <div className="step-connector" />}
            </div>
            <div className="step-content-card">
              <div className="step-card-header">
                {st.title && <h5 className="step-title">{st.title}</h5>}
                {st.subtitle && <span className="step-subtitle-pill">{st.subtitle}</span>}
              </div>
              {st.content && <p className="step-desc">{st.content}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// COMPONENT 5: InteractiveElicitationsCard
// ============================================================================
export interface ElicitationItem {
  label: string;
  query: string;
}

export const InteractiveElicitationsCard: React.FC<{
  message?: string;
  items: ElicitationItem[];
}> = ({ message, items }) => {
  if (!items || items.length === 0) return null;

  const headerText = message || "Recommended Follow-up Inquiries";

  const handleSelect = (query: string) => {
    // Dispatches query to App.tsx chat input or submits directly
    window.dispatchEvent(new CustomEvent("meera:send_mcq", { detail: query }));
  };

  return (
    <div className="interactive-elicitations-card">
      <div className="elicitations-header">
        <LuSparkles className="elicitations-icon" />
        <span className="elicitations-title">{headerText}</span>
      </div>

      <div className="elicitations-grid">
        {items.map((item, idx) => (
          <button
            key={`el-${idx}`}
            type="button"
            className="elicitation-chip-btn"
            onClick={() => handleSelect(item.query || item.label)}
          >
            <span className="chip-label">{item.label}</span>
            <LuArrowRight className="chip-arrow" size={13} />
          </button>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// XML PARSERS
// ============================================================================

export function parseXmlImages(xmlChunk: string): ImageItem[] {
  const images: ImageItem[] = [];
  const regex = /<Image\s+([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(xmlChunk)) !== null) {
    const attrs = m[1];
    const alt = attrs.match(/alt="([^"]*)"/i)?.[1] || "";
    const caption = attrs.match(/caption="([^"]*)"/i)?.[1] || "";
    const src = attrs.match(/src="([^"]*)"/i)?.[1] || "";
    images.push({ alt, caption, src });
  }

  return images;
}

export function parseXmlTimeline(xmlChunk: string): TimelineEventItem[] {
  const events: TimelineEventItem[] = [];
  const regex = /<TimelineEvent\s+([^>]*)>([\s\S]*?)<\/TimelineEvent>/gi;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(xmlChunk)) !== null) {
    const attrs = m[1];
    const content = m[2].trim();
    const time = attrs.match(/time="([^"]*)"/i)?.[1] || attrs.match(/date="([^"]*)"/i)?.[1] || "";
    const title = attrs.match(/title="([^"]*)"/i)?.[1] || "";
    events.push({ time, title, content });
  }

  return events;
}

export function parseXmlSequence(xmlChunk: string): SequenceStepItem[] {
  const steps: SequenceStepItem[] = [];
  const regex = /<Step\s+([^>]*)>([\s\S]*?)<\/Step>/gi;
  let m: RegExpExecArray | null;

  while ((m = regex.exec(xmlChunk)) !== null) {
    const attrs = m[1];
    const content = m[2].trim();
    const title = attrs.match(/title="([^"]*)"/i)?.[1] || "";
    const subtitle = attrs.match(/subtitle="([^"]*)"/i)?.[1] || "";
    steps.push({ title, subtitle, content });
  }

  return steps;
}

export function parseXmlElicitations(xmlChunk: string): { message: string; items: ElicitationItem[] } {
  const msgMatch = xmlChunk.match(/<ElicitationsGroup\s+message="([^"]*)"/i);
  const message = msgMatch?.[1] || "Where would you like to focus next?";

  const items: ElicitationItem[] = [];

  // Parse <Elicitation>
  const elRegex = /<Elicitation\s+([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = elRegex.exec(xmlChunk)) !== null) {
    const attrs = m[1];
    const label = attrs.match(/label="([^"]*)"/i)?.[1] || "";
    const query = attrs.match(/query="([^"]*)"/i)?.[1] || label;
    if (label) items.push({ label, query });
  }

  // Parse standalone <FollowUp>
  const fuRegex = /<FollowUp\s+([^>]*)\/?>/gi;
  while ((m = fuRegex.exec(xmlChunk)) !== null) {
    const attrs = m[1];
    const label = attrs.match(/label="([^"]*)"/i)?.[1] || "";
    const query = attrs.match(/query="([^"]*)"/i)?.[1] || label;
    if (label) items.push({ label, query });
  }

  return { message, items };
}
