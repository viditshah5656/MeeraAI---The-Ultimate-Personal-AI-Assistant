// Meera Browser Shell - Clean DevTools & Layout Engine
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import browserLogo from "./browser.png";
import {
  PiBrain,
  PiCheckCircle,
  PiLightningFill,
  PiPlus,
  PiSparkleFill,
  PiWarningCircleFill,
  PiX,
  PiGearSixDuotone,
  PiPaperclip,
  PiPaperPlaneTiltFill,
  PiUser,
  PiBookmarkSimple,
  PiBookmarkSimpleFill,
  PiList,
  PiCursor,
  PiChatCircleText,
  PiPuzzlePiece,
  PiDownloadSimple,
  PiStar,
  PiStarFill,
  PiClock,
  PiGear,
  PiDotsThreeVertical,
  PiDotsThreeOutlineVertical,
  PiMagnifyingGlass,
  PiMagnifyingGlassPlus,
  PiMagnifyingGlassMinus,
  PiCopySimple,
  PiArrowSquareOut,
  PiPushPin,
  PiPushPinFill,
  PiSpeakerSimpleHigh,
  PiSpeakerSimpleSlash,
  PiFolderSimple,
  PiFolderSimplePlus,
  PiCaretDown,
  PiCaretRight,
  PiCaretUp,
  PiPrinter,
  PiShareFat,
  PiTextAa,
  PiArrowsOutSimple,
  PiArrowsInSimple,
  PiShield,
  PiBrowser,
  PiShieldCheck,
  PiShieldWarning,
  PiCookie,
  PiTrash,
  PiKey,
  PiEye,
  PiEyeSlash,
  PiMonitorPlay,
  PiFileArrowDown,
  PiFolderOpen,
  PiStopCircle,
  PiArrowCounterClockwise,
  PiUserFocus,
  PiSquaresFour,
  PiBookOpenText,
  PiPalette,
  PiBell,
  PiBellSlash,
  PiGlobe,
  PiMoon,
  PiSun,
  PiTerminalWindow,
  PiChartBar,
  PiWifiHigh,
  PiWifiSlash,
  PiCircleFill,
  PiCheckSquare,
  PiSquare,
  PiFloppyDisk,
  PiUploadSimple,
  PiLinkSimple,
  PiCode,
  PiCommand,
  PiKeyboard,
  PiTrashSimple,
  PiDownload,
  PiPause,
  PiPlay,
  PiXCircle,
  PiPencilSimple,
  PiDotsSixVertical,
  PiArrowsOutCardinal,
  PiCornersOut,
  PiCloudSun,
  PiCloudRain,
  PiCloudFill,
  PiSnowflake,
  PiCaretLeft,
  PiTrendUp,
  PiTrendDown,
  PiBackspace,
  PiGridNine,
  PiNewspaper,
  PiSpinnerGap,
  PiFileText,
} from "react-icons/pi";
import { LuGlobe, LuLink, LuSearch, LuChevronLeft, LuChevronRight, LuRotateCw, LuLock, LuLockOpen, LuChevronDown } from "react-icons/lu";
import { useAuth } from "../AuthProvider";
import { SiYoutube, SiGmail, SiWikipedia, SiReddit } from "react-icons/si";
import { copyText } from "../utils/clipboard";

type BrowserMode = "local" | "hybrid" | "cloud";
type BrowserWorkspace = "research" | "sandbox" | "build" | "workspaces";

type BrowserTab = {
  id: string;
  title: string;
  url: string;
  initialUrl?: string;
  loading: boolean;
  workspace: BrowserWorkspace;
  pinned?: boolean;
  muted?: boolean;
  favicon?: string;
  groupId?: string | null;
  incognito?: boolean;
  zoom?: number;
  canGoBack?: boolean;
  canGoForward?: boolean;
  progress?: number;
  suspended?: boolean;
  readerMode?: boolean;
  memoryMb?: number;
};

type TabGroup = {
  id: string;
  name: string;
  color: string;
  collapsed?: boolean;
};

type DownloadStatus = "in-progress" | "completed" | "cancelled" | "paused";

type BrowserDownload = {
  id: string;
  filename: string;
  url: string;
  totalBytes: number;
  receivedBytes: number;
  status: DownloadStatus;
  startedAt: number;
  savePath?: string;
};

type FindInPageState = {
  open: boolean;
  query: string;
  activeMatch: number;
  totalMatches: number;
};

type ContextMenuState = {
  open: boolean;
  x: number;
  y: number;
  kind: "tab" | "page" | "link" | "bookmark" | "history" | null;
  targetId?: string;
  targetUrl?: string;
};

type SitePermission = "allow" | "block" | "ask";

type SiteSettingsEntry = {
  hostname: string;
  camera: SitePermission;
  microphone: SitePermission;
  location: SitePermission;
  notifications: SitePermission;
  popups: SitePermission;
};

type SavedPassword = {
  id: string;
  hostname: string;
  username: string;
  password: string;
  passwordMasked: string;
  lastUsed: number;
};

type BrowserExtension = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  icon: string;
  pinned?: boolean;
};

type BrowserSettings = {
  searchEngine: "google" | "bing" | "duckduckgo" | "brave";
  homepageUrl: string;
  showBookmarksBar: boolean;
  blockPopups: boolean;
  blockTrackers: boolean;
  doNotTrack: boolean;
  clearOnExit: boolean;
  themeMode: "system" | "light" | "dark";
  fontSize: number;
  downloadPath: string;
  askWhereToSave: boolean;
  autofillPasswords: boolean;
  autofillAddresses: boolean;
  restoreTabsOnStartup: boolean;
  hardwareAcceleration: boolean;
  smoothScrolling: boolean;
  spellCheck: boolean;
  notificationsEnabled: boolean;
  showWidgetPanel: boolean;
  ntpWallpaper: string;
};

const DEFAULT_SETTINGS: BrowserSettings = {
  searchEngine: "google",
  homepageUrl: "meera://newtab",
  showBookmarksBar: true,
  ntpWallpaper: "",
  blockPopups: true,
  blockTrackers: true,
  doNotTrack: false,
  clearOnExit: false,
  themeMode: "system",
  fontSize: 100,
  downloadPath: "Downloads",
  askWhereToSave: false,
  autofillPasswords: true,
  autofillAddresses: true,
  restoreTabsOnStartup: true,
  hardwareAcceleration: true,
  smoothScrolling: true,
  spellCheck: true,
  notificationsEnabled: true,
  showWidgetPanel: true,
};

// ── Home widget dashboard ─────────────────────────────
type WidgetType =
  | "clock"
  | "notes"
  | "todo"
  | "topsites"
  | "news"
  | "calendar"
  | "calculator"
  | "bookmarks"
  | "downloads"
  | "stocks"
  | "focus";

type WidgetSize = "s" | "m" | "l";

type WidgetInstance = {
  id: string;
  type: WidgetType;
  size: WidgetSize;
};

type WidgetMeta = {
  type: WidgetType;
  label: string;
  description: string;
  icon: React.ReactNode;
  defaultSize: WidgetSize;
  sizes: WidgetSize[];
};

type TodoItem = { id: string; text: string; done: boolean };

type FocusState = {
  mode: "focus" | "break";
  running: boolean;
  remainingSec: number;
  focusMinutes: number;
  breakMinutes: number;
  sessionsCompleted: number;
};

type WidgetDataState = {
  notes: string;
  todos: TodoItem[];
  focus: FocusState;
  stocksWatchlist: string[];
  newsTopic: string;
};

const DEFAULT_WIDGET_DATA: WidgetDataState = {
  notes: "",
  todos: [],
  focus: { mode: "focus", running: false, remainingSec: 25 * 60, focusMinutes: 25, breakMinutes: 5, sessionsCompleted: 0 },
  stocksWatchlist: ["AAPL", "MSFT", "NVDA", "TSLA"],
  newsTopic: "Technology",
};

const DEFAULT_WIDGET_LAYOUT: WidgetInstance[] = [
  { id: "w-clock", type: "clock", size: "s" },
  { id: "w-todo", type: "todo", size: "m" },
  { id: "w-notes", type: "notes", size: "m" },
  { id: "w-topsites", type: "topsites", size: "l" },
  { id: "w-news", type: "news", size: "m" },
  { id: "w-focus", type: "focus", size: "s" },
];

const WIDGET_SIZE_ORDER: WidgetSize[] = ["s", "m", "l"];

// Simulated stock quotes so the widget has believable numbers without a live API.
const MOCK_STOCK_BASE: Record<string, number> = {
  AAPL: 227.5, MSFT: 421.3, NVDA: 118.2, TSLA: 251.4, GOOGL: 172.8,
  AMZN: 186.9, META: 512.6, NFLX: 671.2, AMD: 148.7, INTC: 31.4,
};

const TAB_GROUP_COLORS = ["#10a37f", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7", "#ec4899", "#06b6d4"];

const SETTINGS_NAV: { id: string; label: string }[] = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "search-engine", label: "Search engine" },
  { id: "privacy", label: "Privacy" },
  { id: "autofill", label: "Autofill" },
  { id: "downloads", label: "Downloads" },
  { id: "widgets", label: "Home widgets" },
  { id: "system", label: "System" },
  { id: "about", label: "About" },
];

const SEARCH_ENGINES: Record<string, { label: string; url: (q: string) => string }> = {
  google: { label: "Google", url: (q) => `https://www.google.com/search?q=${q}` },
  bing: { label: "Bing", url: (q) => `https://www.bing.com/search?q=${q}` },
  duckduckgo: { label: "DuckDuckGo", url: (q) => `https://duckduckgo.com/?q=${q}` },
  brave: { label: "Brave Search", url: (q) => `https://search.brave.com/search?q=${q}` },
};

const DEFAULT_EXTENSIONS: BrowserExtension[] = [
  { id: "ext-adblock", name: "Shield Ad Blocker", description: "Blocks intrusive ads and pop-ups across every site.", enabled: true, icon: "🛡️", pinned: true },
  { id: "ext-darkreader", name: "Night Reader", description: "Applies a dark theme to any website you visit.", enabled: false, icon: "🌙" },
  { id: "ext-grammar", name: "WriteRight Grammar", description: "Real-time grammar and spelling suggestions as you type.", enabled: true, icon: "✍️" },
  { id: "ext-password", name: "Vault Password Manager", description: "Saves and autofills logins securely.", enabled: true, icon: "🔐", pinned: true },
  { id: "ext-translate", name: "Universal Translate", description: "Translates any page into your language instantly.", enabled: false, icon: "🌐" },
  { id: "ext-screenshot", name: "Capture Pro", description: "Full-page screenshots and quick annotation tools.", enabled: false, icon: "📸" },
  { id: "ext-tabmanager", name: "Tab Wrangler", description: "Automatically suspends inactive tabs to save memory.", enabled: false, icon: "🧹" },
  { id: "ext-coupon", name: "SaveMore Coupons", description: "Finds and applies coupon codes at checkout.", enabled: false, icon: "🏷️" },
];

const WIDGET_META: Record<WidgetType, WidgetMeta> = {
  clock: { type: "clock", label: "Clock & Weather", description: "Local time, date, and today's weather.", icon: <PiSun size={16} />, defaultSize: "s", sizes: ["s", "m"] },
  todo: { type: "todo", label: "To-Do List", description: "A simple checklist for your day.", icon: <PiCheckSquare size={16} />, defaultSize: "m", sizes: ["s", "m", "l"] },
  notes: { type: "notes", label: "Quick Notes", description: "A scratchpad that saves as you type.", icon: <PiPencilSimple size={16} />, defaultSize: "m", sizes: ["s", "m", "l"] },
  topsites: { type: "topsites", label: "Top Sites", description: "Your bookmarks and frequent sites in a grid.", icon: <PiSquaresFour size={16} />, defaultSize: "l", sizes: ["m", "l"] },
  news: { type: "news", label: "Headlines", description: "Top headlines and stories.", icon: <PiNewspaper size={16} />, defaultSize: "m", sizes: ["s", "m", "l"] },
  calendar: { type: "calendar", label: "Calendar", description: "This month at a glance.", icon: <PiBookOpenText size={16} />, defaultSize: "m", sizes: ["s", "m"] },
  calculator: { type: "calculator", label: "Calculator", description: "A quick calculator for simple math.", icon: <PiTerminalWindow size={16} />, defaultSize: "s", sizes: ["s", "m"] },
  bookmarks: { type: "bookmarks", label: "Bookmarks", description: "Jump back into your saved pages.", icon: <PiBookmarkSimple size={16} />, defaultSize: "m", sizes: ["s", "m", "l"] },
  downloads: { type: "downloads", label: "Recent Downloads", description: "Your most recent downloaded files.", icon: <PiDownloadSimple size={16} />, defaultSize: "m", sizes: ["s", "m", "l"] },
  stocks: { type: "stocks", label: "Stocks", description: "A simulated watchlist ticker.", icon: <PiChartBar size={16} />, defaultSize: "m", sizes: ["s", "m", "l"] },
  focus: { type: "focus", label: "Focus Timer", description: "A Pomodoro-style focus and break timer.", icon: <PiClock size={16} />, defaultSize: "s", sizes: ["s", "m"] },
};

const WIDGET_TYPES_ORDERED: WidgetType[] = ["clock", "todo", "notes", "topsites", "news", "calendar", "calculator", "bookmarks", "downloads", "stocks", "focus"];

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function guessFilenameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    return last && last.includes(".") ? decodeURIComponent(last) : "download.file";
  } catch {
    return "download.file";
  }
}

function isSecureUrl(url: string): boolean {
  return url.startsWith("https://") || url.startsWith("meera://");
}

const KEYBOARD_SHORTCUTS: { keys: string; action: string; category: string }[] = [
  { keys: "Ctrl+T", action: "New tab", category: "Tabs" },
  { keys: "Ctrl+Shift+T", action: "Reopen closed tab", category: "Tabs" },
  { keys: "Ctrl+W", action: "Close tab", category: "Tabs" },
  { keys: "Ctrl+Tab", action: "Next tab", category: "Tabs" },
  { keys: "Ctrl+Shift+Tab", action: "Previous tab", category: "Tabs" },
  { keys: "Ctrl+1-9", action: "Jump to tab", category: "Tabs" },
  { keys: "Ctrl+L", action: "Focus address bar", category: "Navigation" },
  { keys: "Alt+Left", action: "Go back", category: "Navigation" },
  { keys: "Alt+Right", action: "Go forward", category: "Navigation" },
  { keys: "Ctrl+R", action: "Reload page", category: "Navigation" },
  { keys: "Ctrl+F", action: "Find in page", category: "Page" },
  { keys: "Ctrl+D", action: "Bookmark page", category: "Page" },
  { keys: "Ctrl+P", action: "Print page", category: "Page" },
  { keys: "Ctrl+U", action: "View page source", category: "Page" },
  { keys: "F12", action: "Toggle developer tools", category: "Page" },
  { keys: "Ctrl+Shift+R", action: "Hard reload (bypass cache)", category: "Page" },
  { keys: "Ctrl+Plus", action: "Zoom in", category: "Page" },
  { keys: "Ctrl+Minus", action: "Zoom out", category: "Page" },
  { keys: "Ctrl+0", action: "Reset zoom", category: "Page" },
  { keys: "Ctrl+Shift+N", action: "New private window", category: "Window" },
  { keys: "Ctrl+J", action: "Open downloads", category: "Window" },
  { keys: "Ctrl+H", action: "Open history", category: "Window" },
  { keys: "Ctrl+Shift+Delete", action: "Clear browsing data", category: "Window" },
  { keys: "Esc", action: "Stop loading / close overlay", category: "Window" },
];

type BrowserMessage = {
  type: "meera-browser:mission";
  payload: {
    prompt: string;
    url: string;
    title: string;
    mode: BrowserMode;
    workspace: BrowserWorkspace;
    autoExecute?: boolean;
    autoOpenAssistant?: boolean;
  };
};

type BrowserLogItem = {
  id: string;
  title: string;
  detail: string;
  tone: "info" | "success" | "warning";
};

export type BrowserHistoryItem = {
  id: string;
  url: string;
  title: string;
  timestamp: number;
  favicon?: string;
};

export type BrowserBookmark = {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  dateAdded: number;
};

type BrowserChatAttachment = {
  favicon?: string;
  title: string;
  url: string;
};

type BrowserChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  attachment?: BrowserChatAttachment;
};

const MEERA_API_BASE = (import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000").replace(/\/$/, "");
const BROWSER_CHAT_API = `${MEERA_API_BASE}/api/v1/chat/stream`;

type ServerGeneratedFile = {
  name: string;
  size: number;
  modified: string;
};

export type ReaderTheme = "light" | "sepia" | "dark" | "oled";
export type ReaderFontFamily = "serif" | "sans" | "mono";

export type ReaderArticlePayload = {
  title: string;
  author: string;
  siteName: string;
  publishedTime: string;
  leadImage: string;
  paragraphs: Array<{
    type: "paragraph" | "heading" | "blockquote" | "code" | "list" | "image";
    text?: string;
    level?: number;
    ordered?: boolean;
    items?: string[];
    src?: string;
    alt?: string;
  }>;
  fullText: string;
  readingTimeMins: number;
  wordCount: number;
};

type BrowserWebViewElement = HTMLElement & {
  loadURL?: (url: string) => void;
  getURL?: () => string;
  goBack?: () => void;
  goForward?: () => void;
  reload?: () => void;
  reloadIgnoringCache?: () => void;
  stop?: () => void;
  insertCSS?: (css: string) => void;
  executeJavaScript?: (code: string, userGesture?: boolean) => Promise<any>;
  print?: () => void;
  printToPDF?: (options?: any) => Promise<Uint8Array | ArrayBuffer>;
  setZoomFactor?: (factor: number) => void;
  setAudioMuted?: (muted: boolean) => void;
  openDevTools?: () => void;
  closeDevTools?: () => void;
  isDevToolsOpened?: () => boolean;
};

const WebviewWrapper = React.memo(({ tab, registerRef, allowPopups }: { tab: BrowserTab, registerRef: (node: BrowserWebViewElement | null) => void, allowPopups?: boolean }) => {
  const [initialSrc] = useState(tab.url.startsWith("meera://") ? "about:blank" : tab.url);
  return (
    <webview
      ref={registerRef}
      src={initialSrc}
      title={tab.title}
      allowpopups={allowPopups !== false}
      partition="persist:meera-browser"
      className="meera-browser-webview"
    />
  );
});

const EXTRACT_READER_PAYLOAD_JS = `(function() {
  try {
    const doc = document;
    const title = doc.querySelector('meta[property="og:title"]')?.content || doc.title || "Untitled Article";
    const author = doc.querySelector('meta[name="author"]')?.content || doc.querySelector('[rel="author"], .byline, .author')?.innerText?.trim() || "";
    const siteName = doc.querySelector('meta[property="og:site_name"]')?.content || window.location.hostname.replace(/^www\\./, '');
    const publishedTime = doc.querySelector('meta[property="article:published_time"]')?.content || doc.querySelector('time')?.getAttribute('datetime') || "";
    const leadImage = doc.querySelector('meta[property="og:image"]')?.content || doc.querySelector('article img, main img, figure img')?.src || "";

    const candidateNodes = Array.from(doc.querySelectorAll('article, main, [role="main"], .post-content, .article-body, .entry-content, #content, .mw-parser-output, body'));
    let bestNode = candidateNodes[0] || doc.body;
    let highestScore = 0;

    candidateNodes.forEach(node => {
      let score = 0;
      const paragraphs = node.querySelectorAll('p');
      score += paragraphs.length * 25;
      score += (node.innerText || "").length * 0.1;
      const classAndId = (node.className + ' ' + node.id).toLowerCase();
      if (/article|body|content|entry|main|post|story/.test(classAndId)) score += 50;
      if (/comment|footer|header|nav|sidebar|ad|promo/.test(classAndId)) score -= 100;
      if (score > highestScore) {
        highestScore = score;
        bestNode = node;
      }
    });

    const clone = bestNode.cloneNode(true);
    clone.querySelectorAll('script, style, noscript, iframe, svg, button, input, nav, footer, header, aside, .advertisement, [aria-hidden="true"]').forEach(el => el.remove());

    const paragraphs = [];
    const elements = Array.from(clone.querySelectorAll('h1, h2, h3, h4, p, blockquote, pre, ul, ol, img, figure'));
    
    elements.forEach(el => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'img') {
        if (el.src && el.naturalWidth !== 0 && !el.src.includes('data:image')) {
          paragraphs.push({ type: 'image', src: el.src, alt: el.alt || '' });
        }
      } else if (tag.startsWith('h')) {
        const text = el.innerText.trim();
        if (text && text.length > 2) paragraphs.push({ type: 'heading', level: parseInt(tag[1]), text });
      } else if (tag === 'blockquote') {
        const text = el.innerText.trim();
        if (text) paragraphs.push({ type: 'blockquote', text });
      } else if (tag === 'pre') {
        const text = el.innerText.trim();
        if (text) paragraphs.push({ type: 'code', text });
      } else if (tag === 'ul' || tag === 'ol') {
        const items = Array.from(el.querySelectorAll('li')).map(li => li.innerText.trim()).filter(Boolean);
        if (items.length > 0) paragraphs.push({ type: 'list', ordered: tag === 'ol', items });
      } else {
        const text = el.innerText.trim();
        if (text && text.length > 20) paragraphs.push({ type: 'paragraph', text });
      }
    });

    const fullText = paragraphs.map(p => p.text || (p.items ? p.items.join(' ') : '')).join(' ');
    const wordCount = fullText.split(/\\s+/).filter(Boolean).length;
    const readingTimeMins = Math.max(1, Math.ceil(wordCount / 225));

    return {
      title,
      author,
      siteName,
      publishedTime,
      leadImage,
      paragraphs,
      fullText: fullText.slice(0, 12000),
      readingTimeMins,
      wordCount
    };
  } catch (err) {
    return null;
  }
})();`;

export function ReaderModeOverlay({
  article,
  onClose,
  onExportPdf,
  onExportMarkdown,
  onExportDocx,
}: {
  article: ReaderArticlePayload;
  onClose: () => void;
  onExportPdf?: () => void;
  onExportMarkdown?: () => void;
  onExportDocx?: () => void;
}) {
  const [theme, setTheme] = useState<ReaderTheme>("sepia");
  const [fontFamily, setFontFamily] = useState<ReaderFontFamily>("serif");
  const [fontSize, setFontSize] = useState<number>(19);
  const [lineHeight] = useState<number>(1.7);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  const toggleSpeech = () => {
    if (!window.speechSynthesis) return;
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    } else {
      const utterance = new SpeechSynthesisUtterance(`${article.title}. ${article.fullText}`);
      utterance.rate = 1.0;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
      setIsSpeaking(true);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const max = el.scrollHeight - el.clientHeight;
    setScrollProgress(max > 0 ? (el.scrollTop / max) * 100 : 0);
  };

  const fontStyle =
    fontFamily === "serif"
      ? '"Fraunces", "Georgia", "Charter", serif'
      : fontFamily === "sans"
      ? '"Inter", "Segoe UI", system-ui, sans-serif'
      : '"JetBrains Mono", "Consolas", monospace';

  return (
    <div className={`meera-reader-overlay theme-${theme}`}>
      <div className="reader-progress-bar" style={{ width: `${scrollProgress}%` }} />

      <header className="reader-toolbar">
        <div className="reader-toolbar-left">
          <span className="reader-badge">
            <PiBookOpenText size={14} /> Reader Mode
          </span>
          <span className="reader-meta-time">
            <PiClock size={13} /> {article.readingTimeMins} min read ({article.wordCount} words)
          </span>
        </div>

        <div className="reader-toolbar-center">
          <div className="reader-theme-pills">
            {(["light", "sepia", "dark", "oled"] as ReaderTheme[]).map((t) => (
              <button
                key={t}
                className={`theme-dot ${t} ${theme === t ? "active" : ""}`}
                onClick={() => setTheme(t)}
                title={`${t.charAt(0).toUpperCase() + t.slice(1)} Theme`}
              />
            ))}
          </div>

          <div className="reader-divider" />

          <div className="reader-font-group">
            <button
              className={`font-btn ${fontFamily === "serif" ? "active" : ""}`}
              onClick={() => setFontFamily("serif")}
            >
              Serif
            </button>
            <button
              className={`font-btn ${fontFamily === "sans" ? "active" : ""}`}
              onClick={() => setFontFamily("sans")}
            >
              Sans
            </button>
            <button
              className={`font-btn ${fontFamily === "mono" ? "active" : ""}`}
              onClick={() => setFontFamily("mono")}
            >
              Mono
            </button>
          </div>

          <div className="reader-divider" />

          <div className="reader-size-controls">
            <button
              className="size-btn"
              onClick={() => setFontSize((s) => Math.max(14, s - 1))}
              title="Decrease text size"
            >
              <PiMagnifyingGlassMinus size={14} />
            </button>
            <span className="size-label">{fontSize}px</span>
            <button
              className="size-btn"
              onClick={() => setFontSize((s) => Math.min(28, s + 1))}
              title="Increase text size"
            >
              <PiMagnifyingGlassPlus size={14} />
            </button>
          </div>
        </div>

        <div className="reader-toolbar-right">
          {onExportPdf && (
            <button className="reader-action-btn" onClick={onExportPdf} title="Save as PDF to Device">
              <PiDownloadSimple size={16} />
            </button>
          )}
          <button
            className={`reader-action-btn ${isSpeaking ? "active" : ""}`}
            onClick={toggleSpeech}
            title={isSpeaking ? "Stop Narration" : "Listen (Text to Speech)"}
          >
            {isSpeaking ? <PiSpeakerSimpleSlash size={16} /> : <PiSpeakerSimpleHigh size={16} />}
          </button>
          <button className="reader-close-btn" onClick={onClose} title="Exit Reader Mode (Esc)">
            <PiX size={18} />
          </button>
        </div>
      </header>

      <div className="reader-scroll-container" onScroll={handleScroll}>
        <article
          className="reader-article-body"
          style={{
            maxWidth: "760px",
            fontFamily: fontStyle,
            fontSize: `${fontSize}px`,
            lineHeight,
          }}
        >
          <div className="reader-article-header">
            <div className="reader-site-name">{article.siteName}</div>
            <h1 className="reader-article-title">{article.title}</h1>
            {(article.author || article.publishedTime) && (
              <div className="reader-byline">
                {article.author && <span>By {article.author}</span>}
                {article.publishedTime && (
                  <span>
                    Published{" "}
                    {new Date(article.publishedTime).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                )}
              </div>
            )}
          </div>

          {article.leadImage && (
            <figure className="reader-lead-figure">
              <img src={article.leadImage} alt={article.title} />
            </figure>
          )}

          <div className="reader-content-blocks">
            {article.paragraphs.map((p, idx) => {
              if (p.type === "heading") {
                const Tag = `h${Math.min(4, Math.max(2, p.level || 2))}` as keyof JSX.IntrinsicElements;
                return <Tag key={idx} className="reader-heading">{p.text}</Tag>;
              }
              if (p.type === "blockquote") {
                return <blockquote key={idx} className="reader-quote">{p.text}</blockquote>;
              }
              if (p.type === "code") {
                return (
                  <pre key={idx} className="reader-code">
                    <code>{p.text}</code>
                  </pre>
                );
              }
              if (p.type === "list") {
                return p.ordered ? (
                  <ol key={idx} className="reader-list">
                    {p.items?.map((it, i) => <li key={i}>{it}</li>)}
                  </ol>
                ) : (
                  <ul key={idx} className="reader-list">
                    {p.items?.map((it, i) => <li key={i}>{it}</li>)}
                  </ul>
                );
              }
              if (p.type === "image" && p.src) {
                return (
                  <figure key={idx} className="reader-inline-figure">
                    <img src={p.src} alt={p.alt || ""} />
                    {p.alt && <figcaption>{p.alt}</figcaption>}
                  </figure>
                );
              }
              return <p key={idx} className="reader-p">{p.text}</p>;
            })}
          </div>
        </article>
      </div>
    </div>
  );
}

const STORAGE_KEYS = {
  tabs: "meera.browser.v2.tabs",
  activeTab: "meera.browser.v2.activeTab",
  mode: "meera.browser.v2.mode",
  workspace: "meera.browser.v2.workspace",
  history: "meera.browser.v2.history",
  bookmarks: "meera.browser.v2.bookmarks",
  tabGroups: "meera.browser.v2.tabGroups",
  downloads: "meera.browser.v2.downloads",
  settings: "meera.browser.v2.settings",
  extensions: "meera.browser.v2.extensions",
  passwords: "meera.browser.v2.passwords",
  siteSettings: "meera.browser.v2.siteSettings",
  closedTabsStack: "meera.browser.v2.closedTabsStack",
  widgetLayout: "meera.browser.v2.widgetLayout",
  widgetData: "meera.browser.v2.widgetData",
} as const;

const DEFAULT_HOME_URL = "meera://newtab";
const DEFAULT_INSPECTOR_WIDTH = 400;
const DEFAULT_WORKSPACE: BrowserWorkspace = "research";

function createId(prefix = "tab"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

function getHostname(rawUrl: string): string {
  if (rawUrl === DEFAULT_HOME_URL) return "New Tab";
  try {
    return new URL(rawUrl).hostname.replace(/^www\./i, "");
  } catch {
    return "meera";
  }
}

function getTabTitle(rawUrl: string): string {
  if (rawUrl === DEFAULT_HOME_URL) return "New Tab";
  const hostname = getHostname(rawUrl);
  return hostname ? hostname.split(".")[0].replace(/^\w/, (char) => char.toUpperCase()) : "New tab";
}

function normalizeBrowserInput(input: string, engineKey?: string): string {
  const value = input.trim();
  if (!value) {
    return DEFAULT_HOME_URL;
  }

  if (/^(https?|mailto|tel|whatsapp|meera):/i.test(value)) {
    return value;
  }

  if (/^[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(value)) {
    return `https://${value}`;
  }

  const query = encodeURIComponent(value.replace(/\s+/g, " "));
  const engine = SEARCH_ENGINES[engineKey || "google"] || SEARCH_ENGINES.google;
  return engine.url(query);
}

function readInitialTarget(): string {
  const params = new URLSearchParams(window.location.search);
  const start = params.get("start") || "";
  return start || DEFAULT_HOME_URL;
}

function createInitialTab(target: string): BrowserTab {
  const url = normalizeBrowserInput(target);
  return {
    id: createId("tab"),
    title: getTabTitle(url),
    url,
    initialUrl: url,
    loading: false,
    workspace: DEFAULT_WORKSPACE,
    favicon: url === DEFAULT_HOME_URL ? "" : `https://www.google.com/s2/favicons?domain=${encodeURIComponent(getHostname(url))}&sz=64`,
  };
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function sanitizeBrowserChatContent(content: string): string {
  if (!content) return "";
  let cleaned = content
    .replace(/Terminal result\s*\n\s*\n\s*Command:\s*```[a-z0-9_-]*\n[\s\S]*?```\s*\n\s*\n\s*Output:\s*```[a-z0-9_-]*\n[\s\S]*?```/gi, "")
    .replace(/Command:\s*```[a-z0-9_-]*\n[\s\S]*?```/gi, "")
    .replace(/Output:\s*```[a-z0-9_-]*\n[\s\S]*?```/gi, "");

  cleaned = cleaned.replace(/```(?:bash|sh|zsh|powershell|pwsh|cmd|console|text)?\n[\s\S]*?```/gi, "");
  cleaned = cleaned.replace(/(?:^|\n)(?:Get-ChildItem|dir|ls|pwd|npm|yarn|python|pip|git|docker|kubectl|ssh|ipconfig|ifconfig|netstat|tasklist|ps|az|gcloud|curl|wget)[^\n]*\n?/gi, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return cleaned;
}

type BrowserChatCitation = { label: string; url: string; desc?: string };

function extractBrowserChatCitations(content: string): { body: string; citations: BrowserChatCitation[] } {
  const citations: BrowserChatCitation[] = [];
  const body = content
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)(?:\s+"([^"]*)")?\)/g, (_match, label, url, desc) => {
      citations.push({
        label: String(label).trim(),
        url: String(url).trim(),
        desc: desc ? String(desc).trim() : undefined,
      });
      return "";
    })
    .replace(/[ \t]+([.,!?;:])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { body, citations };
}

function BrowserChatMarkdown({ content }: { content: string }) {
  const normalized = useMemo(() => sanitizeBrowserChatContent(content), [content]);
  const { body, citations } = useMemo(() => extractBrowserChatCitations(normalized), [normalized]);

  return (
    <div className="browser-chat-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {body}
      </ReactMarkdown>
      {citations.length > 0 && (
        <div className="browser-chat-citation-footer">
          {citations.map((citation, index) => (
            <a
              key={`citation-${index}`}
              href={citation.url}
              className="browser-chat-citation-pill"
              target="_blank"
              rel="noreferrer"
              title={citation.url}
            >
              {citation.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

async function extractActivePageContext(activeTab: BrowserTab | null, activeWebview: BrowserWebViewElement | undefined): Promise<string | null> {
  if (!activeTab || activeTab.url === DEFAULT_HOME_URL || !activeWebview?.executeJavaScript) {
    return null;
  }

  try {
    const pageSnapshot = await activeWebview.executeJavaScript(`(function() {
      const title = document.title || "";
      const description = document.querySelector('meta[name="description"]')?.content || "";
      const candidates = Array.from(document.querySelectorAll('article, main, [role="main"]'));
      const root = candidates.find(el => (el.innerText || "").length > 200) || document.body;
      const text = (root.innerText || document.body.innerText || "").replace(/\s+/g, " ").trim();
      const links = Array.from(root.querySelectorAll('a[href]')).map(a => ({
        text: (a.innerText || a.getAttribute('aria-label') || a.href).trim().replace(/\s+/g, ' '),
        href: a.href,
      })).filter(item => item.href && item.text).slice(0, 16);
      return { title, description, text, links };
    })();`, true);

    if (!pageSnapshot || typeof pageSnapshot.text !== "string") {
      return null;
    }

    const text = pageSnapshot.text.trim().slice(0, 16000);
    const title = pageSnapshot.title || activeTab.title || "";
    const description = pageSnapshot.description || "";
    const links = Array.isArray(pageSnapshot.links) ? pageSnapshot.links.slice(0, 8) : [];

    let context = `Extracted webpage content from ${title} (${activeTab.url}):\n`;
    if (description) context += `Description: ${description}\n`;
    context += `Page text:\n${text}\n`;
    if (links.length > 0) {
      context += `\nTop links on this page:\n`;
      context += links.map((link: any) => `- ${link.text} -> ${link.href}`).join("\n");
      context += `\n`;
    }
    context += `\nUse this exact page content to answer the user's question. Cite the page URL and any relevant page links where appropriate, and do not hallucinate information unrelated to the page.`;
    return context;
  } catch {
    return null;
  }
}

// ── Home widget presentational components ─────────────────────────
function ClockWidget({ size }: { size: WidgetSize }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000 * 15);
    return () => window.clearInterval(t);
  }, []);
  const hours = now.getHours();
  const weatherIcon = hours >= 6 && hours < 18 ? <PiSun size={size === "m" ? 34 : 26} /> : <PiCloudFill size={size === "m" ? 34 : 26} />;
  return (
    <div className="widget-clock">
      <div className="widget-clock-time">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
      <div className="widget-clock-date">{now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</div>
      <div className="widget-clock-weather">
        {weatherIcon}
        <span>72°F · Clear</span>
      </div>
    </div>
  );
}

function NotesWidget({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      className="widget-notes-textarea"
      placeholder="Jot something down…"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
    />
  );
}

function TodoWidget({ size, todos, onAdd, onToggle, onRemove }: { size: WidgetSize; todos: TodoItem[]; onAdd: (text: string) => void; onToggle: (id: string) => void; onRemove: (id: string) => void }) {
  const [draft, setDraft] = useState("");
  const visibleCount = size === "s" ? 3 : size === "m" ? 6 : 12;
  const remaining = todos.filter((t) => !t.done).length;
  return (
    <div className="widget-todo">
      <form
        className="widget-todo-input-row"
        onSubmit={(e) => { e.preventDefault(); onAdd(draft); setDraft(""); }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a task…"
        />
        <button type="submit" aria-label="Add task"><PiPlus size={13} /></button>
      </form>
      {todos.length === 0 ? (
        <p className="widget-empty">Nothing on your list yet.</p>
      ) : (
        <>
          <div className="widget-todo-list">
            {todos.slice(0, visibleCount).map((t) => (
              <div className="widget-todo-row" key={t.id}>
                <button className={`widget-todo-check ${t.done ? "done" : ""}`} onClick={() => onToggle(t.id)}>
                  {t.done && <PiCheckCircle size={12} />}
                </button>
                <span className={t.done ? "done" : ""}>{t.text}</span>
                <button className="widget-todo-remove" onClick={() => onRemove(t.id)}><PiX size={11} /></button>
              </div>
            ))}
          </div>
          <div className="widget-todo-footer">{remaining} left</div>
        </>
      )}
    </div>
  );
}

function TopSitesWidget({ size, bookmarks, history, onOpen }: { size: WidgetSize; bookmarks: BrowserBookmark[]; history: BrowserHistoryItem[]; onOpen: (url: string) => void }) {
  const count = size === "m" ? 6 : 10;
  const seen = new Set<string>();
  const items: { title: string; url: string }[] = [];
  for (const b of bookmarks) {
    if (items.length >= count) break;
    if (seen.has(b.url)) continue;
    seen.add(b.url);
    items.push({ title: b.title, url: b.url });
  }
  for (const h of history) {
    if (items.length >= count) break;
    if (seen.has(h.url)) continue;
    seen.add(h.url);
    items.push({ title: h.title, url: h.url });
  }
  if (items.length === 0) {
    return <p className="widget-empty">Sites you visit or bookmark will show up here.</p>;
  }
  return (
    <div className={`widget-topsites-grid ${size}`}>
      {items.map((item, i) => (
        <button className="widget-topsite-tile" key={item.url + i} onClick={() => onOpen(item.url)} title={item.url}>
          <img src={`https://www.google.com/s2/favicons?domain=${item.url}&sz=64`} alt="" />
          <span>{item.title || item.url}</span>
        </button>
      ))}
    </div>
  );
}



function DiscoverFeed({ topic, onTopicChange, onOpen }: { topic: string, onTopicChange: (topic: string) => void, onOpen: (url: string) => void }) {
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const topics = ["Technology", "Business", "Science", "Health", "Sports", "World", "Entertainment"];

  useEffect(() => {
    let active = true;
    setLoading(true);
    const feedUrl = encodeURIComponent("https://news.google.com/rss/search?q=" + encodeURIComponent(topic));
    fetch("https://api.rss2json.com/v1/api.json?rss_url=" + feedUrl)
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        if (data.status === 'ok') {
          const parsed = data.items.map((item: any, index: number) => {
            const imgMatch = item.description?.match(/<img[^>]+src="([^">]+)"/);
            let image = item.enclosure?.link || (imgMatch ? imgMatch[1] : `https://loremflickr.com/600/400/${encodeURIComponent(topic.split(' ')[0])},news?lock=${index + 10}`);
            const pubDate = item.pubDate ? new Date(item.pubDate) : null;
            let timeAgo = '';
            if (pubDate) {
              const diff = Date.now() - pubDate.getTime();
              const hours = Math.floor(diff / 3600000);
              timeAgo = hours < 1 ? 'Just now' : hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
            }
            const sourceDomain = item.link ? new URL(item.link).hostname.replace('www.', '') : '';
            return { title: item.title, source: item.source || topic, image, link: item.link, timeAgo, sourceDomain };
          });
          setArticles(parsed);
        }
        setLoading(false);
      })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [topic]);

  const displayArticles = articles.slice(0, 9);

  return (
    <div className="discover-feed-container">
      <div className="discover-feed-header">
        <div className="discover-feed-header-left">
          <div className="discover-feed-icon">
            <PiNewspaper size={18} />
          </div>
          <div className="discover-feed-header-text">
            <h2 className="discover-feed-title">Discover</h2>
            <span className="discover-feed-subtitle">Curated stories for you</span>
          </div>
        </div>
        <div className="discover-feed-topics">
          {topics.map(t => (
            <button
              key={t}
              className={`discover-topic-pill ${topic === t ? 'active' : ''}`}
              onClick={() => onTopicChange(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="discover-feed-masonry">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div className={`discover-card-skeleton ${i === 0 ? 'featured' : ''}`} key={i}>
              <div className="skeleton-shimmer" />
            </div>
          ))
        ) : displayArticles.map((h, i) => (
          <div className="discover-card" key={i} style={{ backgroundImage: "url(" + h.image + ")" }} onClick={() => onOpen(h.link)}>
            <div className="discover-card-content">
              <div className="discover-card-meta">
                <img
                  className="discover-card-favicon"
                  src={`https://www.google.com/s2/favicons?domain=${h.sourceDomain}&sz=32`}
                  alt=""
                  loading="lazy"
                />
                <span className="discover-card-source">{h.source}</span>
                {h.timeAgo && <span className="discover-card-time">{h.timeAgo}</span>}
              </div>
              <span className="discover-card-headline">{h.title}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarWidget() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  return (
    <div className="widget-calendar">
      <div className="widget-calendar-header">{today.toLocaleDateString([], { month: "long", year: "numeric" })}</div>
      <div className="widget-calendar-grid">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span className="widget-calendar-dow" key={i}>{d}</span>
        ))}
        {cells.map((day, i) => (
          <span key={i} className={`widget-calendar-cell ${day === today.getDate() ? "today" : ""} ${day === null ? "empty" : ""}`}>
            {day || ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function CalculatorWidget() {
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState<string>("0");

  const evaluate = (input: string) => {
    if (!/^[0-9+\-*/.() %]*$/.test(input)) return "Error";
    try {
      // eslint-disable-next-line no-new-func
      const val = Function(`"use strict"; return (${input.replace(/%/g, "/100")})`)();
      if (typeof val !== "number" || !isFinite(val)) return "Error";
      return String(Math.round(val * 1e8) / 1e8);
    } catch {
      return "Error";
    }
  };

  const press = (key: string) => {
    if (key === "C") { setExpr(""); setResult("0"); return; }
    if (key === "⌫") { const next = expr.slice(0, -1); setExpr(next); setResult(next ? evaluate(next) : "0"); return; }
    if (key === "=") { setResult(evaluate(expr)); return; }
    const next = expr + key;
    setExpr(next);
    setResult(evaluate(next));
  };

  return (
    <div className="widget-calculator">
      <div className="widget-calc-display">
        <div className="widget-calc-expr">{expr || " "}</div>
        <div className="widget-calc-result">{result}</div>
      </div>
      <div className="widget-calc-keys">
        {["C", "⌫", "%", "/", "7", "8", "9", "*", "4", "5", "6", "-", "1", "2", "3", "+", "0", ".", "="].map((k) => (
          <button
            key={k}
            className={`widget-calc-key ${["/", "*", "-", "+", "="].includes(k) ? "op" : ""} ${k === "=" ? "equals" : ""}`}
            onClick={() => press(k)}
          >
            {k === "⌫" ? <PiBackspace size={13} /> : k}
          </button>
        ))}
      </div>
    </div>
  );
}

function BookmarksWidget({ size, bookmarks, onOpen }: { size: WidgetSize; bookmarks: BrowserBookmark[]; onOpen: (url: string) => void }) {
  const count = size === "s" ? 4 : size === "m" ? 7 : 12;
  if (bookmarks.length === 0) {
    return <p className="widget-empty">Bookmarked pages will appear here.</p>;
  }
  return (
    <div className="widget-bookmarks-list">
      {bookmarks.slice(0, count).map((b) => (
        <button className="widget-bookmarks-row" key={b.id} onClick={() => onOpen(b.url)} title={b.url}>
          <img src={`https://www.google.com/s2/favicons?domain=${b.url}&sz=32`} alt="" />
          <span>{b.title || b.url}</span>
        </button>
      ))}
    </div>
  );
}

function DownloadsWidget({ downloads }: { downloads: BrowserDownload[] }) {
  const recent = [...downloads].sort((a, b) => b.startedAt - a.startedAt).slice(0, 5);
  if (recent.length === 0) {
    return <p className="widget-empty">Your recent downloads will appear here.</p>;
  }
  return (
    <div className="widget-downloads-list">
      {recent.map((d) => (
        <div className="widget-downloads-row" key={d.id}>
          <PiFileArrowDown size={15} />
          <div className="widget-downloads-info">
            <span className="widget-downloads-name">{d.filename}</span>
            <span className="widget-downloads-meta">{d.status === "completed" ? formatBytes(d.totalBytes) : d.status}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function StocksWidget({ size, watchlist }: { size: WidgetSize; watchlist: string[] }) {
  const count = size === "s" ? 3 : size === "m" ? 5 : 8;
  // Deterministic pseudo-random daily change so numbers don't jitter on every render.
  const seedFor = (sym: string) => {
    let h = 0;
    for (let i = 0; i < sym.length; i++) h = (h * 31 + sym.charCodeAt(i)) % 10000;
    const dayIndex = Math.floor(Date.now() / 86400000);
    return ((h + dayIndex * 17) % 2000) / 100 - 10; // -10.00 .. +10.00
  };
  return (
    <div className="widget-stocks-list">
      {watchlist.slice(0, count).map((sym) => {
        const base = MOCK_STOCK_BASE[sym] ?? 100;
        const pct = seedFor(sym);
        const price = base * (1 + pct / 100);
        const up = pct >= 0;
        return (
          <div className="widget-stocks-row" key={sym}>
            <span className="widget-stocks-symbol">{sym}</span>
            <span className="widget-stocks-price">${price.toFixed(2)}</span>
            <span className={`widget-stocks-change ${up ? "up" : "down"}`}>
              {up ? <PiTrendUp size={12} /> : <PiTrendDown size={12} />} {Math.abs(pct).toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function FocusWidget({ focus, onUpdate }: { focus: FocusState; onUpdate: (updater: (prev: FocusState) => FocusState) => void }) {
  const mins = Math.floor(focus.remainingSec / 60).toString().padStart(2, "0");
  const secs = (focus.remainingSec % 60).toString().padStart(2, "0");
  const totalDuration = (focus.mode === "focus" ? focus.focusMinutes : focus.breakMinutes) * 60;
  const progress = totalDuration > 0 ? 1 - focus.remainingSec / totalDuration : 0;

  return (
    <div className="widget-focus">
      <div className="widget-focus-mode">{focus.mode === "focus" ? "Focus" : "Break"}</div>
      <div className="widget-focus-ring" style={{ background: `conic-gradient(var(--browser-accent) ${progress * 360}deg, rgba(0,0,0,0.08) 0deg)` }}>
        <div className="widget-focus-ring-inner">{mins}:{secs}</div>
      </div>
      <div className="widget-focus-controls">
        <button
          className="widget-focus-btn primary"
          onClick={() => onUpdate((prev) => ({ ...prev, running: !prev.running }))}
        >
          {focus.running ? <PiPause size={13} /> : <PiPlay size={13} />} {focus.running ? "Pause" : "Start"}
        </button>
        <button
          className="widget-focus-btn"
          onClick={() => onUpdate((prev) => ({ ...prev, running: false, remainingSec: (prev.mode === "focus" ? prev.focusMinutes : prev.breakMinutes) * 60 }))}
        >
          <PiArrowCounterClockwise size={13} />
        </button>
      </div>
      <div className="widget-focus-sessions">{focus.sessionsCompleted} session{focus.sessionsCompleted !== 1 ? "s" : ""} completed</div>
    </div>
  );
}

export function MeeraBrowserShell() {
  const { user } = useAuth();
  const isMac = useMemo(() => /mac/i.test(navigator.platform), []);
  const initialTarget = useMemo(() => readInitialTarget(), []);
  const initialTab = useMemo(() => createInitialTab(initialTarget), [initialTarget]);
  const [tabs, setTabs] = useState<BrowserTab[]>(() => {
    const saved = safeJsonParse<BrowserTab[]>(localStorage.getItem(STORAGE_KEYS.tabs), []);
    const startUrl = new URLSearchParams(window.location.search).get("start");
    if (saved && saved.length > 0) {
      if (startUrl && startUrl !== DEFAULT_HOME_URL) {
        return [...saved, initialTab];
      }
      return saved;
    }
    return [initialTab];
  });
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    const saved = safeJsonParse<BrowserTab[]>(localStorage.getItem(STORAGE_KEYS.tabs), []);
    const startUrl = new URLSearchParams(window.location.search).get("start");
    if (saved && saved.length > 0 && startUrl && startUrl !== DEFAULT_HOME_URL) {
      return initialTab.id;
    }
    const savedId = localStorage.getItem(STORAGE_KEYS.activeTab);
    return savedId || initialTab.id;
  });
  const [mode, setMode] = useState<BrowserMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.mode);
    return saved === "local" || saved === "cloud" ? saved : "hybrid";
  });
  const [workspace, setWorkspace] = useState<BrowserWorkspace>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.workspace);
    return (saved === "sandbox" || saved === "build" || saved === "workspaces" ? saved : DEFAULT_WORKSPACE) as BrowserWorkspace;
  });
  const [address, setAddress] = useState(initialTab.url === DEFAULT_HOME_URL ? "" : initialTab.url);
  const [missionDraft, setMissionDraft] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem("meera.browser.v2.inspectorWidth"));
    return saved >= 280 && saved <= 720 ? saved : DEFAULT_INSPECTOR_WIDTH;
  });
  const [isResizingInspector, setIsResizingInspector] = useState(false);
  const inspectorAsideRef = useRef<HTMLElement | null>(null);
  const inspectorCardRef = useRef<HTMLElement | null>(null);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(DEFAULT_INSPECTOR_WIDTH);
  const [pageAiMenuOpen, setPageAiMenuOpen] = useState(false);
  const [leftSidebarView, setLeftSidebarView] = useState<"history" | "bookmarks" | "downloads" | "extensions" | "none">("none");
  const [leftSidebarSearch, setLeftSidebarSearch] = useState("");
  const [history, setHistory] = useState<BrowserHistoryItem[]>(() => safeJsonParse(localStorage.getItem(STORAGE_KEYS.history), []));
  const [bookmarks, setBookmarks] = useState<BrowserBookmark[]>(() => safeJsonParse(localStorage.getItem(STORAGE_KEYS.bookmarks), []));

  // ── New browser-feature state ─────────────────────────
  const [tabGroups, setTabGroups] = useState<TabGroup[]>(() => safeJsonParse(localStorage.getItem(STORAGE_KEYS.tabGroups), []));
  const [downloads, setDownloads] = useState<BrowserDownload[]>(() => safeJsonParse(localStorage.getItem(STORAGE_KEYS.downloads), []));
  const [settings, setSettings] = useState<BrowserSettings>(() => ({ ...DEFAULT_SETTINGS, ...safeJsonParse(localStorage.getItem(STORAGE_KEYS.settings), {}) }));
  const [extensions, setExtensions] = useState<BrowserExtension[]>(() => safeJsonParse(localStorage.getItem(STORAGE_KEYS.extensions), DEFAULT_EXTENSIONS));
  const [passwords, setPasswords] = useState<SavedPassword[]>(() => safeJsonParse(localStorage.getItem(STORAGE_KEYS.passwords), []));
  const [siteSettings, setSiteSettings] = useState<SiteSettingsEntry[]>(() => safeJsonParse(localStorage.getItem(STORAGE_KEYS.siteSettings), []));
  const [closedTabsStack, setClosedTabsStack] = useState<BrowserTab[]>(() => safeJsonParse(localStorage.getItem(STORAGE_KEYS.closedTabsStack), []));
  const [widgetLayout, setWidgetLayout] = useState<WidgetInstance[]>(() => {
    const saved = safeJsonParse(localStorage.getItem(STORAGE_KEYS.widgetLayout), DEFAULT_WIDGET_LAYOUT);
    return saved.filter((w: WidgetInstance) => w.type in WIDGET_META);
  });
  const [widgetData, setWidgetData] = useState<WidgetDataState>(() => ({ ...DEFAULT_WIDGET_DATA, ...safeJsonParse(localStorage.getItem(STORAGE_KEYS.widgetData), {}) }));
  const [addWidgetMenuOpen, setAddWidgetMenuOpen] = useState(false);
  const [draggedWidgetId, setDraggedWidgetId] = useState<string | null>(null);
  const [dragOverWidgetId, setDragOverWidgetId] = useState<string | null>(null);
  const addWidgetMenuRef = useRef<HTMLDivElement | null>(null);
  const focusIntervalRef = useRef<number | null>(null);
  const [savePasswordPrompt, setSavePasswordPrompt] = useState<{ hostname: string; username: string; password: string } | null>(null);
  const [manualPasswordForm, setManualPasswordForm] = useState<{ hostname: string; username: string; password: string } | null>(null);
  const [revealedPasswordIds, setRevealedPasswordIds] = useState<Set<string>>(new Set());

  // registerWebview's callbacks are set up once per tab attach/detach cycle
  // and read settings/passwords asynchronously (after executeJavaScript
  // resolves), so they use refs to always see current values instead of
  // whatever was current when the listener was attached.
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  const passwordsRef = useRef(passwords);
  useEffect(() => { passwordsRef.current = passwords; }, [passwords]);
  const siteSettingsRef = useRef(siteSettings);
  useEffect(() => { siteSettingsRef.current = siteSettings; }, [siteSettings]);

  const [isIncognito, setIsIncognito] = useState(false);
  const [findInPage, setFindInPage] = useState<FindInPageState>({ open: false, query: "", activeMatch: 0, totalMatches: 0 });
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ open: false, x: 0, y: 0, kind: null });
  const [mainMenuOpen, setMainMenuOpen] = useState(false);
  const [tabSwitcherOpen, setTabSwitcherOpen] = useState(false);
  const [tabSwitcherIndex, setTabSwitcherIndex] = useState(0);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [downloadsTab, setDownloadsTab] = useState<"browser" | "ai-files">("browser");
  const [serverFiles, setServerFiles] = useState<ServerGeneratedFile[]>([]);
  const [serverFilesLoading, setServerFilesLoading] = useState(false);
  const [siteInfoOpen, setSiteInfoOpen] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [readerModeActive, setReaderModeActive] = useState(false);
  const [pipActive, setPipActive] = useState(false);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: string; message: string; icon?: React.ReactNode } | null>(null);
  const [tabSearchQuery, setTabSearchQuery] = useState("");
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [omniboxSuggestOpen, setOmniboxSuggestOpen] = useState(false);
  const [customTooltip, setCustomTooltip] = useState({ text: '', x: 0, y: 0, visible: false });

  const isAnyPopoverOpen = useMemo(() => (
    mainMenuOpen ||
    downloadsOpen ||
    notificationsOpen ||
    siteInfoOpen ||
    shareMenuOpen ||
    zoomMenuOpen ||
    leftSidebarView !== 'none' ||
    pageAiMenuOpen ||
    omniboxSuggestOpen ||
    contextMenu.open
  ), [mainMenuOpen, downloadsOpen, notificationsOpen, siteInfoOpen, shareMenuOpen, zoomMenuOpen, leftSidebarView, pageAiMenuOpen, omniboxSuggestOpen, contextMenu.open]);

  const closeAllPopovers = useCallback(() => {
    setMainMenuOpen(false);
    setDownloadsOpen(false);
    setNotificationsOpen(false);
    setSiteInfoOpen(false);
    setShareMenuOpen(false);
    setZoomMenuOpen(false);
    setLeftSidebarView('none');
    setPageAiMenuOpen(false);
    setOmniboxSuggestOpen(false);
    setContextMenu((prev) => (prev.open ? { ...prev, open: false } : prev));
  }, []);

  useEffect(() => {
    if (!isAnyPopoverOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target || !target.closest) return;
      if (
        target.closest('.omnibox-popover') ||
        target.closest('.main-menu-popover') ||
        target.closest('.downloads-popover') ||
        target.closest('.notifications-popover') ||
        target.closest('.share-popover') ||
        target.closest('.zoom-popover') ||
        target.closest('.site-info-popover') ||
        target.closest('.meera-left-drawer') ||
        target.closest('.dock-btn') ||
        target.closest('.omnipill-icon-action') ||
        target.closest('.omnipill-site-info-btn') ||
        target.closest('.meera-modal-backdrop') ||
        target.closest('.meera-modal')
      ) {
        return;
      }
      closeAllPopovers();
    };

    window.addEventListener('mousedown', handlePointerDown, true);
    return () => window.removeEventListener('mousedown', handlePointerDown, true);
  }, [isAnyPopoverOpen, closeAllPopovers]);

  const windowControls = (
    window as {
      meera?: {
        windowControls?: {
          minimize: () => void;
          maximize: () => void;
          close: () => void;
        };
      };
    }
  ).meera?.windowControls;

  const [clockNow, setClockNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setClockNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const localTime = useMemo(
    () => clockNow.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    [clockNow],
  );

  const localSeconds = useMemo(
    () => clockNow.toLocaleTimeString([], { second: "2-digit" }),
    [clockNow],
  );

  const [selectedTextInfo, setSelectedTextInfo] = useState<{ text: string; x: number; y: number } | null>(null);
  const [splitTabId, setSplitTabId] = useState<string | null>(null);
  const [splitRatio, setSplitRatio] = useState<number>(() => {
    const saved = Number(localStorage.getItem("meera.browser.v2.splitRatio"));
    return saved >= 20 && saved <= 80 ? saved : 50;
  });
  const [isResizingSplit, setIsResizingSplit] = useState(false);
  const [focusedPane, setFocusedPane] = useState<"primary" | "secondary">("primary");
  const [readerArticle, setReaderArticle] = useState<ReaderArticlePayload | null>(null);
  const splitDragStartX = useRef(0);
  const splitDragStartRatio = useRef(50);
  const viewportFrameRef = useRef<HTMLDivElement | null>(null);

  const startSplitResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    splitDragStartX.current = e.clientX;
    splitDragStartRatio.current = splitRatio;
    setIsResizingSplit(true);
  }, [splitRatio]);

  useEffect(() => {
    if (!isResizingSplit) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!viewportFrameRef.current) return;
      const rect = viewportFrameRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const newRatio = Math.min(80, Math.max(20, (currentX / rect.width) * 100));
      setSplitRatio(Math.round(newRatio * 10) / 10);
    };

    const handleMouseUp = () => {
      setIsResizingSplit(false);
      localStorage.setItem("meera.browser.v2.splitRatio", String(splitRatio));
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingSplit, splitRatio]);

  const resetSplitRatio = useCallback(() => {
    setSplitRatio(50);
    localStorage.setItem("meera.browser.v2.splitRatio", "50");
  }, []);

  const swapSplitTabs = useCallback(() => {
    if (!splitTabId) return;
    const currentActive = activeTabId;
    setActiveTabId(splitTabId);
    setSplitTabId(currentActive);
  }, [splitTabId, activeTabId]);

  const [shieldBlockedCount, setShieldBlockedCount] = useState(0);
  const activeTabIdRef = useRef(activeTabId);
  useEffect(() => { activeTabIdRef.current = activeTabId; }, [activeTabId]);

  useEffect(() => {
    let mounted = true;
    const fetchShield = async () => {
      try {
        const stats = await (window as any).meera?.getShieldStats?.().catch(() => null);
        if (mounted && stats && typeof stats.blockedCount === "number") {
          setShieldBlockedCount(stats.blockedCount);
        }
      } catch { }
    };
    fetchShield();
    const interval = setInterval(fetchShield, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target || !target.closest) return;

      const el = target.closest('[title], [data-meera-tooltip]') as HTMLElement;
      if (el) {
        if (el.hasAttribute('title')) {
          el.setAttribute('data-meera-tooltip', el.getAttribute('title') || '');
          el.removeAttribute('title');
        }

        const text = el.getAttribute('data-meera-tooltip');
        if (text) {
          const rect = el.getBoundingClientRect();
          let x = rect.left + rect.width / 2;
          let y = rect.bottom + 8;

          if (x < 60) x = 60;
          if (x > window.innerWidth - 60) x = window.innerWidth - 60;

          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            setCustomTooltip({ text, x, y, visible: true });
          }, 400); // 400ms delay to prevent flashing
        }
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target || !target.closest) return;
      clearTimeout(timeoutId);
      setCustomTooltip(prev => ({ ...prev, visible: false }));
    };

    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);

    return () => {
      document.removeEventListener('mouseover', handleMouseOver, true);
      document.removeEventListener('mouseout', handleMouseOut, true);
      clearTimeout(timeoutId);
    };
  }, []);
  const [newGroupPromptTabId, setNewGroupPromptTabId] = useState<string | null>(null);
  const [clearDataModalOpen, setClearDataModalOpen] = useState(false);
  const [clearDataRange, setClearDataRange] = useState<"hour" | "day" | "week" | "all">("day");
  const [clearDataOptions, setClearDataOptions] = useState({ history: true, cookies: true, cache: true, downloads: false, passwords: false });
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [settingsQuery, setSettingsQuery] = useState("");
  const [activeSettingsSection, setActiveSettingsSection] = useState("appearance");
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const settingsContentRef = useRef<HTMLDivElement | null>(null);
  const settingsSectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const settingsScrollSpySuspended = useRef(false);
  const mainMenuRef = useRef<HTMLDivElement | null>(null);
  const zoomMenuRef = useRef<HTMLDivElement | null>(null);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);
  const siteInfoRef = useRef<HTMLDivElement | null>(null);
  const notifRef = useRef<HTMLDivElement | null>(null);
  const findInputRef = useRef<HTMLInputElement | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = useCallback((message: string, icon?: React.ReactNode) => {
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    const id = createId("toast");
    setToast({ id, message, icon });
    toastTimeoutRef.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const scrollToSettingsSection = useCallback((sectionId: string) => {
    setActiveSettingsSection(sectionId);
    const node = settingsSectionRefs.current[sectionId];
    const container = settingsContentRef.current;
    if (node && container) {
      settingsScrollSpySuspended.current = true;
      const top = node.offsetTop - 12;
      container.scrollTo({ top, behavior: "smooth" });
      window.setTimeout(() => { settingsScrollSpySuspended.current = false; }, 500);
    }
  }, []);

  const handleSettingsScroll = useCallback(() => {
    if (settingsScrollSpySuspended.current) return;
    const container = settingsContentRef.current;
    if (!container) return;
    const scrollPos = container.scrollTop + 24;
    let current: string | null = null;
    for (const [id, node] of Object.entries(settingsSectionRefs.current)) {
      if (node && node.offsetTop <= scrollPos) current = id;
    }
    if (current) setActiveSettingsSection((prev) => (prev === current ? prev : current!));
  }, []);

  const resetSettingsToDefaults = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
    setResetConfirmOpen(false);
    showToast("Settings reset to defaults", <PiArrowCounterClockwise size={14} />);
  }, [showToast]);

  // ── Widget dashboard management ───────────────────────
  const addWidget = useCallback((type: WidgetType) => {
    const meta = WIDGET_META[type];
    setWidgetLayout((prev) => [...prev, { id: createId("widget"), type, size: meta.defaultSize }]);
    setAddWidgetMenuOpen(false);
    showToast(`${meta.label} added`, meta.icon);
  }, [showToast]);

  const removeWidget = useCallback((id: string) => {
    setWidgetLayout((prev) => prev.filter((w) => w.id !== id));
  }, []);

  const cycleWidgetSize = useCallback((id: string) => {
    setWidgetLayout((prev) => prev.map((w) => {
      if (w.id !== id) return w;
      const allowed = WIDGET_META[w.type].sizes;
      const currentIdx = allowed.indexOf(w.size);
      const next = allowed[(currentIdx + 1) % allowed.length];
      return { ...w, size: next };
    }));
  }, []);

  const resetWidgetLayout = useCallback(() => {
    setWidgetLayout([...DEFAULT_WIDGET_LAYOUT]);
    showToast("Widget layout reset", <PiArrowCounterClockwise size={14} />);
  }, [showToast]);

  const clearAllWidgets = useCallback(() => {
    setWidgetLayout([]);
    showToast("All widgets removed", <PiTrash size={14} />);
  }, [showToast]);

  const handleWidgetDragStart = useCallback((id: string) => (e: React.DragEvent) => {
    setDraggedWidgetId(id);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", id); } catch { /* noop */ }
  }, []);

  const handleWidgetDragOver = useCallback((id: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (id !== draggedWidgetId) setDragOverWidgetId(id);
  }, [draggedWidgetId]);

  const handleWidgetDrop = useCallback((targetId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverWidgetId(null);
    const sourceId = draggedWidgetId;
    setDraggedWidgetId(null);
    if (!sourceId || sourceId === targetId) return;
    setWidgetLayout((prev) => {
      const next = [...prev];
      const fromIdx = next.findIndex((w) => w.id === sourceId);
      const toIdx = next.findIndex((w) => w.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, [draggedWidgetId]);

  const handleWidgetDragEnd = useCallback(() => {
    setDraggedWidgetId(null);
    setDragOverWidgetId(null);
  }, []);

  const toggleTodo = useCallback((id: string) => {
    setWidgetData((prev) => ({ ...prev, todos: prev.todos.map((t) => t.id === id ? { ...t, done: !t.done } : t) }));
  }, []);

  const addTodo = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setWidgetData((prev) => ({ ...prev, todos: [{ id: createId("todo"), text: trimmed, done: false }, ...prev.todos] }));
  }, []);

  const removeTodo = useCallback((id: string) => {
    setWidgetData((prev) => ({ ...prev, todos: prev.todos.filter((t) => t.id !== id) }));
  }, []);

  const groupedHistory = useMemo(() => {
    const groups: { title: string; items: BrowserHistoryItem[] }[] = [
      { title: 'Today', items: [] },
      { title: 'Yesterday', items: [] },
      { title: 'Earlier this week', items: [] },
      { title: 'Older', items: [] }
    ];

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const lastWeek = today - 86400000 * 7;

    history.forEach(item => {
      if (item.timestamp >= today) groups[0].items.push(item);
      else if (item.timestamp >= yesterday) groups[1].items.push(item);
      else if (item.timestamp >= lastWeek) groups[2].items.push(item);
      else groups[3].items.push(item);
    });

    return groups.filter(g => g.items.length > 0);
  }, [history]);
  const [logItems, setLogItems] = useState<BrowserLogItem[]>([
    {
      id: createId("log"),
      title: "Browser shell online",
      detail: "Ready for local, hybrid, or cloud-backed browsing.",
      tone: "success",
    },
  ]);
  // ── Browser Chat State ─────────────────────────────────
  const [browserChatMessages, setBrowserChatMessages] = useState<BrowserChatMessage[]>([]);
  const [isBrowserChatStreaming, setIsBrowserChatStreaming] = useState(false);
  const browserChatAbortRef = useRef<AbortController | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const scrollChatToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
      }
    });
  }, []);

  const sendBrowserChat = useCallback(async (userMessage: string, displayText?: string, attachment?: BrowserChatAttachment) => {
    if (!userMessage.trim() || isBrowserChatStreaming) return;

    // Abort any existing stream
    if (browserChatAbortRef.current) {
      browserChatAbortRef.current.abort();
    }
    const controller = new AbortController();
    browserChatAbortRef.current = controller;

    const userMsg: BrowserChatMessage = {
      id: createId("msg"),
      role: "user",
      content: (displayText ?? userMessage).trim(),
      timestamp: Date.now(),
      attachment,
    };
    const assistantMsg: BrowserChatMessage = {
      id: createId("msg"),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    setBrowserChatMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsBrowserChatStreaming(true);
    setMissionDraft("");
    setAssistantOpen(true);
    scrollChatToBottom();

    // Build message history for context. The backend always gets the full
    // technical payload (userMessage) for the current turn — never the
    // display-only label — so grounding/context is never silently dropped.
    const pageContext = await extractActivePageContext(activeTab, activeWebview);
    const pageInstruction: { role: "system"; content: string } = {
      role: "system",
      content: pageContext
        ? pageContext
        : activeTab && activeTab.url !== DEFAULT_HOME_URL
          ? `The user is viewing this webpage: ${activeTab.url}. Prefer answering from the page itself when possible. Only search the web if the page does not contain enough information or the user explicitly wants outside verification. Do not hallucinate or invent details. Respond with a detailed, structured answer, and include reasoning plus practical next steps when helpful.`
          : `This request is coming from the browser. Stay concise only when the user clearly wants a short reply. Otherwise, give a detailed, structured answer. Use web search only when it materially improves accuracy or the user explicitly asked for it. Do not invent details or rely only on memory.`,
    };

    const payloadMessages: { role: string; content: string }[] = ([pageInstruction] as { role: string; content: string }[])
      .concat(browserChatMessages.map(m => ({ role: m.role, content: m.content })))
      .concat([{ role: "user", content: userMessage.trim() }]);

    try {
      const res = await fetch(BROWSER_CHAT_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.trim(),
          model: "auto",
          stream: true,
          max_tokens: 4096,
          messages: payloadMessages,
          quant_bits: 4,
          use_mcp: false,
          enable_file_tools: false,
          use_rag: false,
          enable_image_search: false,
          use_web_grounding: true,
          web: "on",
          tools: "auto",
          skip_terminal_autoexec: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let textAcc = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === "[DONE]") continue;

          try {
            const wire = JSON.parse(raw);
            const parsed = wire?.data && typeof wire.data === "object" ? wire.data : wire;
            const eventType = typeof wire?.type === "string" ? wire.type : "";
            const tokenChunk = eventType === "generation.token" && typeof parsed.text === "string"
              ? parsed.text
              : typeof parsed.token === "string" && parsed.token
                ? parsed.token
                : typeof parsed.chunk === "string" && parsed.chunk
                  ? parsed.chunk
                  : "";
            if (tokenChunk) {
              textAcc += tokenChunk;
              const snapshot = textAcc;
              setBrowserChatMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === "assistant") {
                  updated[updated.length - 1] = { ...last, content: snapshot };
                }
                return updated;
              });
              scrollChatToBottom();
            }
            if (parsed.reply && !textAcc) {
              textAcc = parsed.reply;
              const snapshot = textAcc;
              setBrowserChatMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.role === "assistant") {
                  updated[updated.length - 1] = { ...last, content: snapshot };
                }
                return updated;
              });
              scrollChatToBottom();
            }
          } catch {
            // Non-JSON line, skip
          }
        }
      }

      // If we got no tokens at all, show a fallback
      if (!textAcc) {
        setBrowserChatMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.role === "assistant" && !last.content) {
            updated[updated.length - 1] = { ...last, content: "I couldn't generate a response. Please try again." };
          }
          return updated;
        });
      }
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setBrowserChatMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === "assistant") {
          updated[updated.length - 1] = { ...last, content: `⚠️ Connection error: ${err?.message || "Failed to reach Meera backend."}` };
        }
        return updated;
      });
    } finally {
      setIsBrowserChatStreaming(false);
      browserChatAbortRef.current = null;
    }
  }, [browserChatMessages, isBrowserChatStreaming, scrollChatToBottom]);

  const webviewRefs = useRef(new Map<string, BrowserWebViewElement>());
  const cleanupRefs = useRef(new Map<string, (() => void) | undefined>());
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const pendingAgentMissionRef = useRef<{ prompt: string; tabId: string } | null>(null);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? initialTab;
  const activeWebview = webviewRefs.current.get(activeTab.id);

  const handleQuickAction = useCallback(async (action: string) => {
    const pageTitle = activeTab?.title || "this page";
    const pageUrl = activeTab?.url || "";
    const pageContext = await extractActivePageContext(activeTab, activeWebview);
    const basePrompt = pageContext
      ? `${pageContext}\n\nNow answer the user's query based on the exact webpage content above.`
      : `Use the webpage title and URL to answer carefully. ${pageTitle} at ${pageUrl}`;

    const prompts: Record<string, string> = {
      summarize: `${basePrompt}\nSummarize this webpage in a clear, concise way, and include at least one citation to the page URL or a page link.`,
      explain: `${basePrompt}\nExplain what this webpage is about in simple terms, and cite the page URL where relevant.`,
      takeaways: `${basePrompt}\nList the key takeaways from this webpage and cite the page URL when referencing its content.`,
      similar: `${basePrompt}\nSuggest similar websites or content related to this page, and include the page URL as the source.`,
    };

    // Short instruction only -- the page itself is shown as a separate
    // attachment card above the bubble (see BrowserChatAttachment), not
    // fused into this label. Previously this was `Summarize ${pageTitle}`,
    // which put the entire page title inside the green bubble alongside
    // the instruction with no visual separation between "what to do" and
    // "what page it's about".
    const displayLabels: Record<string, string> = {
      summarize: "Summarize this webpage.",
      explain: "Explain what this webpage is about.",
      takeaways: "List the key takeaways from this webpage.",
      similar: "Suggest similar websites or content related to this page.",
    };

    const attachment: BrowserChatAttachment | undefined =
      activeTab && activeTab.url !== DEFAULT_HOME_URL
        ? { favicon: activeTab.favicon, title: pageTitle, url: pageUrl }
        : undefined;

    sendBrowserChat(prompts[action] || `${basePrompt}\n${action}`, displayLabels[action], attachment);
  }, [activeTab, activeWebview, sendBrowserChat]);


  useEffect(() => {
    document.body.classList.add("meera-browser-body");
    document.body.classList.remove("meera-workspace-body");
    document.title = `Meera Browser${activeTab?.title ? ` - ${activeTab.title}` : ""}`;

    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("meera-browser-link") : null;
    broadcastRef.current = channel;

    const handleMessage = (event: MessageEvent<BrowserMessage>) => {
      const type = event.data?.type;
      if ((type as string) === "meera-browser:open-tab") {
        const payload = (event.data as any)?.payload;
        if (payload?.url) {
          openTab(payload.url);
          window.focus();
        }
        return;
      }
      if (event.data?.type !== "meera-browser:mission") {
        return;
      }
      const payload = event.data.payload;
      if (!payload?.prompt) {
        return;
      }
      setMissionDraft(payload.prompt);
      setMode(payload.mode);
      setWorkspace(payload.workspace);
      setPageAiMenuOpen(false);
      setAssistantOpen(true);
      // A mission is actionable only when the browser actually navigates to
      // the supplied live page.  Previously the chat passed a URL here but
      // the shell merely displayed the prompt, leaving the agent stranded on
      // its prior tab.
      if (payload.url) {
        const missionUrl = normalizeBrowserInput(payload.url, settingsRef.current.searchEngine);
        setTabs((current) => current.map((tab) => (
          tab.id === activeTabId
            ? { ...tab, title: payload.title || getTabTitle(missionUrl), url: missionUrl, loading: true }
            : tab
        )));
        setAddress(missionUrl);
        pendingAgentMissionRef.current = { prompt: payload.prompt, tabId: activeTabId };
        window.setTimeout(() => {
          const webview = webviewRefs.current.get(activeTabId);
          if (webview?.loadURL) {
            webview.loadURL(missionUrl);
          }
        }, 0);
      }
    };

    channel?.addEventListener("message", handleMessage as EventListener);
    return () => {
      channel?.removeEventListener("message", handleMessage as EventListener);
      channel?.close();
      broadcastRef.current = null;
      document.body.classList.remove("meera-browser-body");
    };
  }, [activeTab?.title]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.tabs, JSON.stringify(tabs));
    localStorage.setItem(STORAGE_KEYS.activeTab, activeTabId);
    localStorage.setItem(STORAGE_KEYS.mode, mode);
    localStorage.setItem(STORAGE_KEYS.workspace, workspace);
  }, [tabs, activeTabId, mode, workspace]);

  useEffect(() => {
    try {
      const pending = localStorage.getItem("meera.browser.pendingTab");
      if (pending) {
        localStorage.removeItem("meera.browser.pendingTab");
        setTimeout(() => openTab(pending), 100);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.bookmarks, JSON.stringify(bookmarks));
  }, [bookmarks]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.tabGroups, JSON.stringify(tabGroups));
  }, [tabGroups]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.downloads, JSON.stringify(downloads));
  }, [downloads]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.extensions, JSON.stringify(extensions));
  }, [extensions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.passwords, JSON.stringify(passwords));
  }, [passwords]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.siteSettings, JSON.stringify(siteSettings));
  }, [siteSettings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.closedTabsStack, JSON.stringify(closedTabsStack.slice(-20)));
  }, [closedTabsStack]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.widgetLayout, JSON.stringify(widgetLayout));
  }, [widgetLayout]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.widgetData, JSON.stringify(widgetData));
  }, [widgetData]);

  // Focus timer ticking
  useEffect(() => {
    if (focusIntervalRef.current) { window.clearInterval(focusIntervalRef.current); focusIntervalRef.current = null; }
    if (!widgetData.focus.running) return;
    focusIntervalRef.current = window.setInterval(() => {
      setWidgetData((prev) => {
        if (!prev.focus.running) return prev;
        if (prev.focus.remainingSec <= 1) {
          const nextMode = prev.focus.mode === "focus" ? "break" : "focus";
          const nextDuration = (nextMode === "focus" ? prev.focus.focusMinutes : prev.focus.breakMinutes) * 60;
          return {
            ...prev,
            focus: {
              ...prev.focus,
              mode: nextMode,
              remainingSec: nextDuration,
              sessionsCompleted: prev.focus.mode === "focus" ? prev.focus.sessionsCompleted + 1 : prev.focus.sessionsCompleted,
            },
          };
        }
        return { ...prev, focus: { ...prev.focus, remainingSec: prev.focus.remainingSec - 1 } };
      });
    }, 1000);
    return () => { if (focusIntervalRef.current) window.clearInterval(focusIntervalRef.current); };
  }, [widgetData.focus.running]);

  // Close "add widget" menu on outside click
  useEffect(() => {
    if (!addWidgetMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (addWidgetMenuRef.current && !addWidgetMenuRef.current.contains(e.target as Node)) {
        setAddWidgetMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [addWidgetMenuOpen]);

  // Apply theme mode
  useEffect(() => {
    if (settings.themeMode === 'dark' || (settings.themeMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [settings.themeMode]);

  // Deep-link into a settings sub-section, e.g. meera://settings/privacy
  useEffect(() => {
    if (!activeTab || !activeTab.url.startsWith("meera://settings")) return;
    const sub = activeTab.url.replace("meera://settings", "").replace(/^\//, "").split(/[/?#]/)[0];
    const target = sub && settingsSectionRefs.current[sub] ? sub : "appearance";
    const raf = requestAnimationFrame(() => scrollToSettingsSection(target));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id, activeTab?.url]);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Close dropdown menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (mainMenuOpen && mainMenuRef.current && !mainMenuRef.current.contains(target)) setMainMenuOpen(false);
      if (zoomMenuOpen && zoomMenuRef.current && !zoomMenuRef.current.contains(target)) setZoomMenuOpen(false);
      if (shareMenuOpen && shareMenuRef.current && !shareMenuRef.current.contains(target)) setShareMenuOpen(false);
      if (siteInfoOpen && siteInfoRef.current && !siteInfoRef.current.contains(target)) setSiteInfoOpen(false);
      if (notificationsOpen && notifRef.current && !notifRef.current.contains(target)) setNotificationsOpen(false);
      if (contextMenu.open) setContextMenu((prev) => ({ ...prev, open: false }));
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mainMenuOpen, zoomMenuOpen, shareMenuOpen, siteInfoOpen, notificationsOpen, contextMenu.open]);

  useEffect(() => {
    if (!isResizingInspector) return;

    const startX = resizeStartXRef.current;
    const startWidth = resizeStartWidthRef.current;
    const asideEl = inspectorAsideRef.current;
    const cardEl = inspectorCardRef.current;
    let latestWidth = startWidth;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = startX - e.clientX;
      const next = Math.min(720, Math.max(320, startWidth + delta));
      latestWidth = next;
      if (asideEl) asideEl.style.width = `${next}px`;
      if (cardEl) cardEl.style.width = `${next}px`;
    };
    const handleMouseUp = () => {
      setIsResizingInspector(false);
      setInspectorWidth(latestWidth);
      localStorage.setItem("meera.browser.v2.inspectorWidth", String(latestWidth));
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp, { once: true });
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingInspector]);

  const startInspectorResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = inspectorWidth;
    setIsResizingInspector(true);
  }, [inspectorWidth]);

  const resetInspectorWidth = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const asideEl = inspectorAsideRef.current;
    const cardEl = inspectorCardRef.current;
    asideEl?.classList.add("snap-reset");
    cardEl?.classList.add("snap-reset");
    if (asideEl) asideEl.style.width = `${DEFAULT_INSPECTOR_WIDTH}px`;
    if (cardEl) cardEl.style.width = `${DEFAULT_INSPECTOR_WIDTH}px`;
    setInspectorWidth(DEFAULT_INSPECTOR_WIDTH);
    localStorage.setItem("meera.browser.v2.inspectorWidth", String(DEFAULT_INSPECTOR_WIDTH));
    window.setTimeout(() => {
      asideEl?.classList.remove("snap-reset");
      cardEl?.classList.remove("snap-reset");
    }, 250);
  }, []);

  useEffect(() => {
    if (!activeTab) {
      return;
    }
    setAddress(activeTab.url === DEFAULT_HOME_URL ? "" : activeTab.url);
  }, [activeTab?.id, activeTab?.url]);

  const goBack = () => activeWebview?.goBack?.();
  const goForward = () => activeWebview?.goForward?.();
  const reloadTab = () => activeWebview?.reload?.();
  const goHome = () => navigateActiveTab(DEFAULT_HOME_URL);

  const updateTab = (tabId: string, patch: Partial<BrowserTab>) => {
    setTabs((current) => current.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)));
  };

  const openTab = (rawTarget?: string) => {
    const nextUrl = normalizeBrowserInput(rawTarget || DEFAULT_HOME_URL, settingsRef.current.searchEngine);
    const nextTab: BrowserTab = {
      id: createId("tab"),
      title: getTabTitle(nextUrl),
      url: nextUrl,
      initialUrl: nextUrl,
      loading: nextUrl !== DEFAULT_HOME_URL,
      workspace: workspace,
      favicon: nextUrl === DEFAULT_HOME_URL ? "" : `https://www.google.com/s2/favicons?domain=${encodeURIComponent(getHostname(nextUrl))}&sz=64`,
    };
    setTabs((current) => [...current, nextTab]);
    setActiveTabId(nextTab.id);
  };

  const closeTab = (tabId: string) => {
    setTabs((current) => {
      if (current.length === 1) return current;
      const tabToClose = current.find(t => t.id === tabId);
      if (tabToClose) {
        setClosedTabsStack(prev => [...prev, tabToClose]);
      }
      const nextTabs = current.filter((tab) => tab.id !== tabId);
      if (activeTabId === tabId) {
        const nextActive = nextTabs[nextTabs.length - 1];
        setActiveTabId(nextActive.id);
      }
      return nextTabs;
    });
  };

  const undoCloseTab = () => {
    if (closedTabsStack.length === 0) return;
    const tabToRestore = closedTabsStack[closedTabsStack.length - 1];
    const restored: BrowserTab = { ...tabToRestore, id: createId("tab") };
    setClosedTabsStack(prev => prev.slice(0, -1));
    setTabs(current => [...current, restored]);
    setActiveTabId(restored.id);
    showToast("Tab reopened");
  };

  const focusTab = (tabId: string) => {
    setActiveTabId(tabId);
    updateTab(tabId, { suspended: false });
  };

  const navigateActiveTab = (rawTarget: string) => {
    const nextUrl = normalizeBrowserInput(rawTarget, settingsRef.current.searchEngine);
    updateTab(activeTab.id, {
      title: getTabTitle(nextUrl),
      url: nextUrl,
      loading: nextUrl !== DEFAULT_HOME_URL,
      favicon: nextUrl === DEFAULT_HOME_URL ? "" : `https://www.google.com/s2/favicons?domain=${encodeURIComponent(getHostname(nextUrl))}&sz=64`,
    });
    setAddress(nextUrl === DEFAULT_HOME_URL ? "" : nextUrl);

    if (nextUrl !== DEFAULT_HOME_URL && !nextUrl.startsWith("meera://")) {
      const webview = webviewRefs.current.get(activeTab.id);
      if (webview?.loadURL) webview.loadURL(nextUrl);
    }
  };

  const navigate = navigateActiveTab;

  const toggleBookmark = (url?: string, title?: string, favicon?: string) => {
    const targetUrl = url || address;
    if (!targetUrl || targetUrl.startsWith("meera://")) return;
    setBookmarks((prev) => {
      const exists = prev.some((b) => b.url === targetUrl);
      if (exists) {
        showToast("Bookmark removed", <PiBookmarkSimple size={14} />);
        return prev.filter((b) => b.url !== targetUrl);
      }
      showToast("Bookmark added", <PiCheckCircle size={14} />);
      return [
        {
          id: createId("bm"),
          url: targetUrl,
          title: title || activeTab?.title || targetUrl,
          favicon: favicon || activeTab?.favicon,
          dateAdded: Date.now(),
        },
        ...prev,
      ];
    });
  };

  // Called when a real login-form submission was captured on a page. If we
  // already have this exact hostname+username saved, just refresh it
  // silently (matches normal browser behavior for a login that already
  // works). Otherwise surface a save prompt for the user to confirm —
  // passwords are never saved without explicit confirmation.
  const onCredentialCaptured = useCallback((hostname: string, username: string, password: string) => {
    if (!settingsRef.current.autofillPasswords || !hostname || !password) return;
    const existing = passwordsRef.current.find((p) => p.hostname === hostname && p.username === username);
    if (existing) {
      if (existing.password !== password) {
        setPasswords((prev) => prev.map((p) => p.id === existing.id
          ? { ...p, password, passwordMasked: "•".repeat(Math.min(password.length, 12)), lastUsed: Date.now() }
          : p));
      } else {
        setPasswords((prev) => prev.map((p) => p.id === existing.id ? { ...p, lastUsed: Date.now() } : p));
      }
      return;
    }
    setSavePasswordPrompt({ hostname, username, password });
  }, []);

  const confirmSavePassword = useCallback(() => {
    if (!savePasswordPrompt) return;
    const { hostname, username, password } = savePasswordPrompt;
    setPasswords((prev) => [{
      id: createId("pw"),
      hostname,
      username,
      password,
      passwordMasked: "•".repeat(Math.min(password.length, 12)),
      lastUsed: Date.now(),
    }, ...prev]);
    setSavePasswordPrompt(null);
    showToast("Password saved");
  }, [savePasswordPrompt, showToast]);

  const dismissSavePassword = useCallback(() => setSavePasswordPrompt(null), []);

  const registerWebview = (tabId: string) => (node: BrowserWebViewElement | null) => {
    const previousCleanup = cleanupRefs.current.get(tabId);
    if (previousCleanup) {
      previousCleanup();
      cleanupRefs.current.delete(tabId);
    }

    if (!node) {
      webviewRefs.current.delete(tabId);
      return;
    }

    webviewRefs.current.set(tabId, node);

    const handleStartLoading = () => {
      updateTab(tabId, { loading: true });
      handleCapturePendingCredential();
    };
    const handleStopLoading = () => {
      updateTab(tabId, { loading: false });
      const mission = pendingAgentMissionRef.current;
      if (!mission || mission.tabId !== tabId) return;
      pendingAgentMissionRef.current = null;
      // Run the first observation only after the live booking/search page is
      // loaded, so the browser agent receives page text rather than a URL.
      window.setTimeout(() => void sendBrowserChat(mission.prompt), 150);
    };
    const handleNavigate = () => {
      const currentUrl = node.getURL?.() || "";
      if (!currentUrl || currentUrl.startsWith("meera://")) return;

      const parsedTitle = getTabTitle(currentUrl);
      updateTab(tabId, {
        url: currentUrl,
        title: parsedTitle,
        loading: false,
        favicon: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(getHostname(currentUrl))}&sz=64`,
      });
      if (activeTabId === tabId) setAddress(currentUrl);

      setHistory((prev) => {
        if (prev.length > 0 && prev[0].url === currentUrl) return prev;
        return [{
          id: createId('hist'),
          url: currentUrl,
          title: parsedTitle,
          timestamp: Date.now()
        }, ...prev].slice(0, 500);
      });
    };

    const handleTitle = (event: Event & { title?: string }) => {
      const title = event.title;
      if (!title) return;
      updateTab(tabId, { title });

      setHistory((prev) => {
        if (prev.length > 0) {
          const currentUrl = node.getURL?.();
          if (prev[0].url === currentUrl && prev[0].title !== title) {
            const next = [...prev];
            next[0] = { ...next[0], title };
            return next;
          }
        }
        return prev;
      });
    };

    const handleLoadCommit = (event: any) => {
      if (event.isMainFrame && node.insertCSS) {
        node.insertCSS('*::-webkit-scrollbar { display: none !important; width: 0px !important; height: 0px !important; } * { -ms-overflow-style: none !important; scrollbar-width: none !important; }');
      }
    };

    const handleFavicon = (event: any) => {
      const favicons = event?.favicons;
      if (Array.isArray(favicons) && favicons.length > 0) {
        updateTab(tabId, { favicon: favicons[0] });
      }
    };

    const handleWillDownload = (event: any) => {
      const item = event?.item;
      if (!item) return;
      const dlId = createId("dl");
      const filename = item.getFilename?.() || "download";
      const totalBytes = item.getTotalBytes?.() || 0;
      setDownloads((prev) => [{
        id: dlId,
        filename,
        url: item.getURL?.() || "",
        totalBytes,
        receivedBytes: 0,
        status: "in-progress" as DownloadStatus,
        startedAt: Date.now(),
        savePath: item.getSavePath?.() || "",
      }, ...prev]);
      setDownloadsOpen(true);
      item.on?.("updated", (_e: any, state: string) => {
        setDownloads((prev) => prev.map((d) => d.id === dlId ? { ...d, receivedBytes: item.getReceivedBytes?.() || d.receivedBytes, status: state === "interrupted" ? "cancelled" : d.status } : d));
      });
      item.on?.("done", (_e: any, state: string) => {
        setDownloads((prev) => prev.map((d) => d.id === dlId ? { ...d, receivedBytes: d.totalBytes, status: state === "completed" ? "completed" : "cancelled" } : d));
      });
    };

    const handleNewWindow = (event: any) => {
      const url = event?.url;
      if (!url) return;
      const hostname = getHostname((node as any).getURL?.() || "");
      const siteEntry = siteSettingsRef.current.find((s) => s.hostname === hostname);
      const popupSetting: SitePermission = siteEntry?.popups ?? (settingsRef.current.blockPopups ? "block" : "allow");
      if (popupSetting === "block") {
        showToast(`Popup blocked from ${hostname}`, <PiShieldWarning size={14} />);
        return;
      }
      openTab(url);
    };

    const handleDomReady = () => {
      const currentZoom = tabs.find((t) => t.id === tabId)?.zoom;
      const webviewAny = node as any;
      if (currentZoom && webviewAny.setZoomFactor) {
        try { webviewAny.setZoomFactor(currentZoom); } catch { }
      }
      // Real autofill: only runs if the user has autofill enabled and has a
      // saved credential for this exact hostname. Finds a visible
      // username/email + password field pair and sets their values via the
      // native input value setter (so React/Vue-controlled fields on the
      // target page pick up the change too), without submitting anything.
      if (settingsRef.current.autofillPasswords) {
        try {
          const url: string = webviewAny.getURL?.() || "";
          if (url && !url.startsWith("meera://")) {
            const hostname = getHostname(url);
            const match = passwordsRef.current.find((p) => p.hostname === hostname);
            if (match) {
              webviewAny.executeJavaScript?.(`(function(user, pass) {
                try {
                  const setNativeValue = (el, value) => {
                    const proto = Object.getPrototypeOf(el);
                    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                    if (setter) setter.call(el, value); else el.value = value;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                  };
                  const pwField = document.querySelector('input[type="password"]');
                  if (!pwField) return false;
                  const form = pwField.closest('form') || document;
                  const userField = form.querySelector('input[type="email"], input[type="text"][name*="user" i], input[type="text"][name*="email" i], input[autocomplete="username"]');
                  if (userField) setNativeValue(userField, user);
                  setNativeValue(pwField, pass);
                  return true;
                } catch (e) { return false; }
              })(${JSON.stringify(match.username)}, ${JSON.stringify(match.password)});`, true).catch(() => { });
            }
          }
        } catch { }
      }
      // Real "offer to save password": hook a submit listener on this
      // document so that if the page has a real login form, we capture
      // what was typed the moment it's submitted (before navigation away
      // destroys the DOM). Guarded so it only attaches once per document.
      try {
        webviewAny.executeJavaScript?.(`(function() {
          if (window.__meeraPwHooked) return;
          window.__meeraPwHooked = true;
          document.addEventListener('submit', function(e) {
            try {
              const form = e.target;
              const pwField = form.querySelector && form.querySelector('input[type="password"]');
              if (!pwField || !pwField.value) return;
              const userField = form.querySelector('input[type="email"], input[type="text"][name*="user" i], input[type="text"][name*="email" i], input[autocomplete="username"]');
              window.__meeraPendingCredential = { username: userField ? userField.value : '', password: pwField.value };
            } catch (err) {}
          }, true);
        })();`, true).catch(() => { });
      } catch { }

      try {
        webviewAny.executeJavaScript?.(`(function() {
          if (window.__meeraSelectionHooked) return;
          window.__meeraSelectionHooked = true;
          document.addEventListener('mouseup', function(e) {
            try {
              const sel = window.getSelection();
              const text = sel ? sel.toString().trim() : '';
              if (text && text.length >= 2) {
                const range = sel.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                console.log('__MEERA_SEL__:' + JSON.stringify({
                  text: text.slice(0, 1000),
                  x: Math.max(20, Math.min(window.innerWidth - 240, rect.left + rect.width / 2)),
                  y: Math.max(10, rect.top - 12)
                }));
              } else {
                console.log('__MEERA_SEL_CLEAR__');
              }
            } catch (err) {}
          }, true);
          document.addEventListener('selectionchange', function() {
            try {
              const sel = window.getSelection();
              if (!sel || !sel.toString().trim()) {
                console.log('__MEERA_SEL_CLEAR__');
              }
            } catch (err) {}
          });
        })();`, true).catch(() => { });
      } catch { }
    };

    const handleCapturePendingCredential = async () => {
      try {
        const result = await (node as any).executeJavaScript?.(`(function() {
          const c = window.__meeraPendingCredential;
          window.__meeraPendingCredential = null;
          return c || null;
        })();`, true);
        if (result && result.password) {
          const url = (node as any).getURL?.() || "";
          const hostname = getHostname(url);
          onCredentialCaptured(hostname, result.username, result.password);
        }
      } catch { }
    };

    const handleConsoleMessage = (e: any) => {
      const msg = e.message || "";
      if (msg.startsWith("__MEERA_SEL__:")) {
        try {
          const data = JSON.parse(msg.slice("__MEERA_SEL__:".length));
          if (tabId === activeTabIdRef.current) {
            setSelectedTextInfo(data);
          }
        } catch { }
      } else if (msg === "__MEERA_SEL_CLEAR__") {
        if (tabId === activeTabIdRef.current) {
          setSelectedTextInfo(null);
        }
      }
    };

    node.addEventListener("did-start-loading", handleStartLoading as EventListener);
    node.addEventListener("did-stop-loading", handleStopLoading as EventListener);
    node.addEventListener("did-navigate", handleNavigate as EventListener);
    node.addEventListener("did-navigate-in-page", handleNavigate as EventListener);
    node.addEventListener("page-title-updated", handleTitle as EventListener);
    node.addEventListener("load-commit", handleLoadCommit as EventListener);
    node.addEventListener("page-favicon-updated", handleFavicon as EventListener);
    node.addEventListener("new-window", handleNewWindow as EventListener);
    node.addEventListener("dom-ready", handleDomReady as EventListener);
    node.addEventListener("console-message", handleConsoleMessage as EventListener);
    (node as any).addEventListener?.("will-download", handleWillDownload);

    cleanupRefs.current.set(tabId, () => {
      node.removeEventListener("did-start-loading", handleStartLoading as EventListener);
      node.removeEventListener("did-stop-loading", handleStopLoading as EventListener);
      node.removeEventListener("did-navigate", handleNavigate as EventListener);
      node.removeEventListener("did-navigate-in-page", handleNavigate as EventListener);
      node.removeEventListener("page-title-updated", handleTitle as EventListener);
      node.removeEventListener("load-commit", handleLoadCommit as EventListener);
      node.removeEventListener("page-favicon-updated", handleFavicon as EventListener);
      node.removeEventListener("new-window", handleNewWindow as EventListener);
      node.removeEventListener("dom-ready", handleDomReady as EventListener);
      node.removeEventListener("console-message", handleConsoleMessage as EventListener);
      (node as any).removeEventListener?.("will-download", handleWillDownload);
    });
  };

  const handleNewTabSearchSubmit = (query: string) => {
    navigateActiveTab(query);
  };

  // ── Find in page ─────────────────────────────────────
  const openFindInPage = useCallback(() => {
    setFindInPage((prev) => ({ ...prev, open: true }));
    requestAnimationFrame(() => findInputRef.current?.focus());
  }, []);

  const closeFindInPage = useCallback(() => {
    activeWebview?.executeJavaScript?.(`window.stop && window.find ? null : null;`, false).catch(() => { });
    activeWebview?.executeJavaScript?.(`document.querySelectorAll('mark[data-meera-find]').forEach(m => { const t = document.createTextNode(m.textContent); m.replaceWith(t); });`, false).catch(() => { });
    setFindInPage({ open: false, query: "", activeMatch: 0, totalMatches: 0 });
  }, [activeWebview]);

  const runFindInPage = useCallback(async (query: string, direction: "next" | "prev" = "next") => {
    setFindInPage((prev) => ({ ...prev, query }));
    if (!activeWebview?.executeJavaScript || !query) {
      setFindInPage((prev) => ({ ...prev, totalMatches: 0, activeMatch: 0 }));
      return;
    }
    try {
      const result = await activeWebview.executeJavaScript(`(function(q, dir) {
        document.querySelectorAll('mark[data-meera-find]').forEach(m => { const t = document.createTextNode(m.textContent); m.replaceWith(t); });
        if (!q) return { total: 0, active: 0 };
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        const nodes = [];
        let n;
        while (n = walker.nextNode()) {
          if (n.nodeValue && n.nodeValue.toLowerCase().includes(q.toLowerCase()) && n.parentElement && n.parentElement.offsetParent !== null) {
            nodes.push(n);
          }
        }
        let count = 0;
        let firstMark = null;
        nodes.forEach(node => {
          const regex = new RegExp(q.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'), 'gi');
          const parts = node.nodeValue.split(regex);
          const matches = node.nodeValue.match(regex);
          if (!matches) return;
          const frag = document.createDocumentFragment();
          parts.forEach((part, i) => {
            frag.appendChild(document.createTextNode(part));
            if (i < matches.length) {
              const mark = document.createElement('mark');
              mark.dataset.meeraFind = 'true';
              mark.style.background = '#ffd54f';
              mark.style.color = '#000';
              mark.textContent = matches[i];
              frag.appendChild(mark);
              count++;
              if (!firstMark) firstMark = mark;
            }
          });
          node.parentNode.replaceChild(frag, node);
        });
        const marks = document.querySelectorAll('mark[data-meera-find]');
        if (marks.length > 0) {
          marks[0].style.background = '#ff9800';
          marks[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return { total: marks.length, active: marks.length > 0 ? 1 : 0 };
      })(${JSON.stringify(query)}, ${JSON.stringify(direction)});`, true);
      if (result) {
        setFindInPage((prev) => ({ ...prev, totalMatches: result.total || 0, activeMatch: result.active || 0 }));
      }
    } catch {
      // page may not support script injection (cross-origin restrictions)
    }
  }, [activeWebview]);

  const jumpFindMatch = useCallback(async (direction: "next" | "prev") => {
    if (!activeWebview?.executeJavaScript) return;
    try {
      const result = await activeWebview.executeJavaScript(`(function(dir) {
        const marks = Array.from(document.querySelectorAll('mark[data-meera-find]'));
        if (marks.length === 0) return { total: 0, active: 0 };
        let currentIdx = marks.findIndex(m => m.style.background === 'rgb(255, 152, 0)');
        marks.forEach(m => m.style.background = '#ffd54f');
        let nextIdx = dir === 'next' ? (currentIdx + 1) % marks.length : (currentIdx - 1 + marks.length) % marks.length;
        marks[nextIdx].style.background = '#ff9800';
        marks[nextIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
        return { total: marks.length, active: nextIdx + 1 };
      })(${JSON.stringify(direction)});`, true);
      if (result) setFindInPage((prev) => ({ ...prev, totalMatches: result.total, activeMatch: result.active }));
    } catch { }
  }, [activeWebview]);

  // ── Zoom controls ────────────────────────────────────
  const applyZoom = useCallback((tabId: string, zoom: number) => {
    const clamped = Math.min(3, Math.max(0.25, zoom));
    updateTab(tabId, { zoom: clamped });
    const webview = webviewRefs.current.get(tabId) as any;
    if (webview?.setZoomFactor) {
      try { webview.setZoomFactor(clamped); } catch { }
    }
  }, []);

  const zoomIn = useCallback(() => applyZoom(activeTab.id, (activeTab.zoom || 1) + 0.1), [activeTab, applyZoom]);
  const zoomOut = useCallback(() => applyZoom(activeTab.id, (activeTab.zoom || 1) - 0.1), [activeTab, applyZoom]);
  const zoomReset = useCallback(() => applyZoom(activeTab.id, 1), [activeTab, applyZoom]);

  // ── Tab operations: duplicate, pin, mute, group, close-variants ──
  const duplicateTab = useCallback((tabId: string) => {
    const source = tabs.find((t) => t.id === tabId);
    if (!source) return;
    const nextTab: BrowserTab = { ...source, id: createId("tab"), pinned: false };
    setTabs((current) => {
      const idx = current.findIndex((t) => t.id === tabId);
      const next = [...current];
      next.splice(idx + 1, 0, nextTab);
      return next;
    });
    setActiveTabId(nextTab.id);
    showToast("Tab duplicated");
  }, [tabs, showToast]);

  const toggleSplitView = useCallback((targetTabId?: string) => {
    if (splitTabId) {
      setSplitTabId(null);
      showToast("Split view closed");
    } else {
      const chosen = targetTabId || tabs.find((t) => t.id !== activeTabId)?.id;
      if (chosen) {
        setSplitTabId(chosen);
        showToast("Split view active");
      } else {
        const newSplitTab: BrowserTab = {
          id: createId("tab"),
          title: "Google",
          url: "https://www.google.com",
          initialUrl: "https://www.google.com",
          loading: true,
          workspace: workspace,
          favicon: "https://www.google.com/s2/favicons?domain=google.com&sz=64",
        };
        setTabs((prev) => [...prev, newSplitTab]);
        setSplitTabId(newSplitTab.id);
        showToast("Split view opened");
      }
    }
  }, [splitTabId, tabs, activeTabId, workspace, showToast]);

  const toggleMuteTab = useCallback((tabId: string) => {
    setTabs((current) => current.map((t) => {
      if (t.id !== tabId) return t;
      const nextMuted = !t.muted;
      const webview = webviewRefs.current.get(tabId) as any;
      if (webview?.setAudioMuted) { try { webview.setAudioMuted(nextMuted); } catch { } }
      return { ...t, muted: nextMuted };
    }));
  }, []);

  const togglePinTab = useCallback((tabId: string) => {
    setTabs((current) => current.map((t) => (t.id === tabId ? { ...t, pinned: !t.pinned } : t)));
  }, []);

  const closeOtherTabs = useCallback((tabId: string) => {
    setTabs((current) => {
      const keep = current.filter((t) => t.id === tabId || t.pinned);
      const closed = current.filter((t) => t.id !== tabId && !t.pinned);
      if (closed.length) setClosedTabsStack((prev) => [...prev, ...closed]);
      return keep.length > 0 ? keep : current;
    });
    setActiveTabId(tabId);
  }, []);

  const closeTabsToRight = useCallback((tabId: string) => {
    setTabs((current) => {
      const idx = current.findIndex((t) => t.id === tabId);
      if (idx === -1) return current;
      const keep = current.filter((t, i) => i <= idx || t.pinned);
      const closed = current.filter((t, i) => i > idx && !t.pinned);
      if (closed.length) setClosedTabsStack((prev) => [...prev, ...closed]);
      return keep;
    });
  }, []);

  const createTabGroup = useCallback((tabId: string, name: string) => {
    const color = TAB_GROUP_COLORS[tabGroups.length % TAB_GROUP_COLORS.length];
    const group: TabGroup = { id: createId("group"), name: name || "New Group", color };
    setTabGroups((prev) => [...prev, group]);
    updateTab(tabId, { groupId: group.id });
    setNewGroupPromptTabId(null);
  }, [tabGroups.length]);

  const addTabToGroup = useCallback((tabId: string, groupId: string | null) => {
    updateTab(tabId, { groupId });
  }, []);

  const toggleGroupCollapsed = useCallback((groupId: string) => {
    setTabGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, collapsed: !g.collapsed } : g)));
  }, []);

  const renameTabGroup = useCallback((groupId: string, name: string) => {
    setTabGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name } : g)));
  }, []);

  const deleteTabGroup = useCallback((groupId: string) => {
    setTabGroups((prev) => prev.filter((g) => g.id !== groupId));
    setTabs((current) => current.map((t) => (t.groupId === groupId ? { ...t, groupId: null } : t)));
  }, []);

  // ── Downloads ────────────────────────────────────────
  // Real downloads are driven entirely by the "will-download" listener wired
  // in registerWebview (handleWillDownload) — that's a genuine Electron
  // DownloadItem, not a simulation. This function triggers one for the
  // current page by asking the webview to serialize its own DOM and then
  // navigating a hidden download link inside the page itself, which fires
  // a real will-download event the same way a normal file link would.
  const savePageAs = useCallback(async (url: string, filename?: string) => {
    if (!activeWebview?.executeJavaScript) {
      showToast("Can't save this page");
      return;
    }
    try {
      await activeWebview.executeJavaScript(`(function(name) {
        try {
          const html = '<!DOCTYPE html>\\n' + document.documentElement.outerHTML;
          const blob = new Blob([html], { type: 'text/html' });
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
          return true;
        } catch (e) {
          return false;
        }
      })(${JSON.stringify(filename || guessFilenameFromUrl(url))});`, true);
    } catch {
      showToast("Couldn't save this page");
    }
  }, [activeWebview, showToast]);

  const cancelDownload = useCallback((id: string) => {
    setDownloads((prev) => prev.map((d) => (d.id === id ? { ...d, status: "cancelled" as DownloadStatus } : d)));
  }, []);

  const pauseResumeDownload = useCallback((id: string) => {
    setDownloads((prev) => prev.map((d) => (d.id === id ? { ...d, status: d.status === "paused" ? "in-progress" as DownloadStatus : "paused" as DownloadStatus } : d)));
  }, []);

  const clearCompletedDownloads = useCallback(() => {
    setDownloads((prev) => prev.filter((d) => d.status === "in-progress" || d.status === "paused"));
  }, []);

  const removeDownload = useCallback((id: string) => {
    setDownloads((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const activeDownloadsCount = useMemo(() => downloads.filter((d) => d.status === "in-progress").length, [downloads]);

  const fetchServerFiles = useCallback(async () => {
    setServerFilesLoading(true);
    try {
      const res = await fetch(`${MEERA_API_BASE}/api/v1/files/list`);
      if (res.ok) {
        const data = await res.json();
        setServerFiles(Array.isArray(data?.files) ? data.files : []);
      }
    } catch {
      // Silently fail — server may not be running
    } finally {
      setServerFilesLoading(false);
    }
  }, []);

  const downloadServerFile = useCallback(async (name: string) => {
    try {
      showToast(`Downloading ${name}...`, <PiFileArrowDown size={14} />);
      const res = await fetch(`${MEERA_API_BASE}/api/v1/files/download/${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();
      await (window as any).meera?.saveAndOpenFile?.({
        filename: name,
        buffer: arrayBuffer,
        openInFolder: true,
      });
      showToast(`Saved ${name} to Downloads`, <PiCheckCircle size={14} />);
    } catch {
      showToast(`Failed to download ${name}`, <PiWarningCircleFill size={14} />);
    }
  }, [showToast]);

  // Auto-fetch server files when AI-files tab is selected
  useEffect(() => {
    if (downloadsOpen && downloadsTab === "ai-files" && serverFiles.length === 0) {
      void fetchServerFiles();
    }
  }, [downloadsOpen, downloadsTab, serverFiles.length, fetchServerFiles]);

  // ── Smart In-App Reader mode ──────────────────────────────
  const toggleReaderMode = useCallback(async () => {
    if (readerArticle) {
      setReaderArticle(null);
      setReaderModeActive(false);
      return;
    }
    if (!activeWebview?.executeJavaScript) return;
    try {
      showToast("Extracting article...", <PiBookOpenText size={14} />);
      const payload: ReaderArticlePayload = await activeWebview.executeJavaScript(EXTRACT_READER_PAYLOAD_JS, true);
      if (payload && (payload.paragraphs?.length > 0 || payload.fullText?.length > 50)) {
        setReaderArticle(payload);
        setReaderModeActive(true);
      } else {
        showToast("No readable article content found on this page", <PiWarningCircleFill size={14} />);
      }
    } catch (err) {
      showToast("Could not extract reader mode content", <PiWarningCircleFill size={14} />);
    }
  }, [activeWebview, readerArticle, showToast]);

  // ── Automated AI File Generation & Save to Device ─────────────────
  const exportPageAsPdf = useCallback(async (tabId?: string) => {
    const targetId = tabId || activeTabId;
    const webview = webviewRefs.current.get(targetId) as BrowserWebViewElement | undefined;
    const tab = tabs.find((t) => t.id === targetId);
    if (!webview?.printToPDF) {
      showToast("PDF generation not available", <PiWarningCircleFill size={14} />);
      return;
    }
    try {
      showToast("Generating PDF document...", <PiFileArrowDown size={14} />);
      const pdfBuffer = await webview.printToPDF({
        printBackground: true,
        pageSize: "A4",
        margins: { marginType: "default" },
      });
      const title = (tab?.title || "Document").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50);
      const res = await (window as any).meera?.saveAndOpenFile?.({
        filename: `${title}.pdf`,
        buffer: pdfBuffer,
        openInFolder: true,
      });
      if (res?.ok) {
        showToast(`Saved ${res.filename} to Downloads`, <PiCheckCircle size={14} />);
      } else {
        showToast("Failed to save PDF", <PiWarningCircleFill size={14} />);
      }
    } catch (err) {
      showToast("PDF generation error", <PiWarningCircleFill size={14} />);
    }
  }, [activeTabId, tabs, showToast]);

  const exportContentAsMarkdown = useCallback(async (title: string, markdownText: string) => {
    try {
      const cleanTitle = title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50) || "document";
      const res = await (window as any).meera?.saveAndOpenFile?.({
        filename: `${cleanTitle}.md`,
        content: markdownText,
        openInFolder: true,
      });
      if (res?.ok) {
        showToast(`Saved ${res.filename} to Downloads`, <PiCheckCircle size={14} />);
      }
    } catch {
      showToast("Failed to save Markdown file", <PiWarningCircleFill size={14} />);
    }
  }, [showToast]);

  const exportTableAsCsv = useCallback(async () => {
    if (!activeWebview?.executeJavaScript) return;
    try {
      showToast("Extracting tables to CSV...", <PiFileArrowDown size={14} />);
      const csvContent: string = await activeWebview.executeJavaScript(`(function() {
        const tables = Array.from(document.querySelectorAll('table'));
        if (!tables.length) return "";
        return tables.map(table =>
          Array.from(table.querySelectorAll('tr')).map(tr =>
            Array.from(tr.querySelectorAll('th, td'))
              .map(td => '"' + td.innerText.replace(/"/g, '""').trim() + '"')
              .join(',')
          ).join('\\n')
        ).join('\\n\\n=== NEXT TABLE ===\\n\\n');
      })();`, true);

      if (!csvContent || !csvContent.trim()) {
        showToast("No data tables found on this page", <PiWarningCircleFill size={14} />);
        return;
      }

      const cleanTitle = (activeTab?.title || "data_tables").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50);
      const res = await (window as any).meera?.saveAndOpenFile?.({
        filename: `${cleanTitle}.csv`,
        content: csvContent,
        openInFolder: true,
      });
      if (res?.ok) {
        showToast(`Saved ${res.filename} to Downloads`, <PiCheckCircle size={14} />);
      }
    } catch {
      showToast("Failed to extract CSV", <PiWarningCircleFill size={14} />);
    }
  }, [activeWebview, activeTab?.title, showToast]);

  const exportContentAsDocx = useCallback(async (title: string, content: string) => {
    try {
      const cleanTitle = title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50) || "document";
      const docHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1e293b; padding: 40px; }
h1 { color: #0f172a; font-size: 24pt; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; }
h2 { color: #1e40af; font-size: 18pt; margin-top: 24px; }
h3 { color: #2563eb; font-size: 14pt; }
p { font-size: 11pt; margin-bottom: 12px; }
table { border-collapse: collapse; width: 100%; margin: 20px 0; }
th, td { border: 1px solid #cbd5e1; padding: 8px 12px; font-size: 10pt; }
th { background: #f1f5f9; font-weight: bold; }
</style>
</head>
<body>
<h1>${title}</h1>
<p style="color: #64748b; font-size: 10pt;">Generated by Meera AI Browser &bull; ${new Date().toLocaleDateString()}</p>
<hr/>
${content.replace(/\\n\\n/g, '<p>').replace(/\\n/g, '<br/>')}
</body>
</html>`;

      const res = await (window as any).meera?.saveAndOpenFile?.({
        filename: `${cleanTitle}.doc`,
        content: docHtml,
        openInFolder: true,
      });
      if (res?.ok) {
        showToast(`Saved ${res.filename} to Downloads`, <PiCheckCircle size={14} />);
      }
    } catch {
      showToast("Failed to save Word document", <PiWarningCircleFill size={14} />);
    }
  }, [showToast]);

  // ── Picture-in-picture ───────────────────────────────
  const togglePip = useCallback(async () => {
    if (!activeWebview?.executeJavaScript) return;
    try {
      await activeWebview.executeJavaScript(`(function() {
        if (document.pictureInPictureElement) { document.exitPictureInPicture(); return; }
        const video = document.querySelector('video');
        if (video && video.requestPictureInPicture) video.requestPictureInPicture().catch(() => {});
      })();`, true);
      setPipActive((prev) => !prev);
    } catch { }
  }, [activeWebview]);

  // ── Print (Export High-Quality PDF to Device) ───────
  const printPage = useCallback(() => {
    exportPageAsPdf();
  }, [exportPageAsPdf]);

  // ── Hard reload (bypasses cache) ──────────────────────
  const hardReloadTab = useCallback(() => {
    const webview = activeWebview as any;
    if (webview?.reloadIgnoringCache) { try { webview.reloadIgnoringCache(); return; } catch { } }
    reloadTab();
  }, [activeWebview]);

  // ── View page source ───────────────────────────────────
  const viewPageSource = useCallback(() => {
    if (!activeTab?.url || activeTab.url.startsWith("meera://")) return;
    openTab(`view-source:${activeTab.url}`);
  }, [activeTab]);

  // ── DevTools (Frameless Custom Glass Window with Dock) ────
  const toggleDevTools = useCallback(() => {
    const targetId = splitTabId && focusedPane === "secondary" ? splitTabId : activeTabId;
    const targetTab = tabs.find((t) => t.id === targetId) || activeTab;
    const guestWebview = webviewRefs.current.get(targetId) as any;
    if (!guestWebview) return;

    try {
      const guestId = guestWebview.getWebContentsId?.();
      if (typeof guestId === "number" && (window as any).meera?.toggleDevToolsCustom) {
        (window as any).meera.toggleDevToolsCustom({
          guestWebContentsId: guestId,
          title: targetTab.title || targetTab.url,
        }).then((res: any) => {
          if (res?.state === "closed") {
            showToast("DevTools closed");
          } else {
            showToast("DevTools opened", <PiTerminalWindow size={14} />);
          }
        }).catch(() => {
          guestWebview.openDevTools();
        });
      } else {
        if (guestWebview.isDevToolsOpened?.()) {
          guestWebview.closeDevTools();
          showToast("DevTools closed");
        } else {
          guestWebview.openDevTools();
          showToast("DevTools opened", <PiTerminalWindow size={14} />);
        }
      }
    } catch {
      showToast("DevTools unavailable for this page");
    }
  }, [activeTabId, activeTab, splitTabId, focusedPane, tabs, showToast]);

  // ── Context menu helpers ─────────────────────────────
  const openTabContextMenu = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setContextMenu({ open: true, x: e.clientX, y: e.clientY, kind: "tab", targetId: tabId });
  }, []);

  const openPageContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ open: true, x: e.clientX, y: e.clientY, kind: "page" });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu((prev) => ({ ...prev, open: false })), []);

  // ── Tab switcher (Ctrl+Tab) ──────────────────────────
  const cycleTabSwitcher = useCallback((direction: 1 | -1) => {
    setTabSwitcherOpen(true);
    setTabSwitcherIndex((prev) => {
      const total = tabs.length;
      return (prev + direction + total) % total;
    });
  }, [tabs.length]);

  const confirmTabSwitcher = useCallback(() => {
    if (tabs[tabSwitcherIndex]) setActiveTabId(tabs[tabSwitcherIndex].id);
    setTabSwitcherOpen(false);
  }, [tabs, tabSwitcherIndex]);

  // ── Drag to reorder tabs ─────────────────────────────
  const handleTabDragStart = useCallback((tabId: string) => setDraggedTabId(tabId), []);
  const handleTabDragOver = useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    setDragOverTabId(tabId);
  }, []);
  const handleTabDrop = useCallback((tabId: string) => {
    if (!draggedTabId || draggedTabId === tabId) { setDraggedTabId(null); setDragOverTabId(null); return; }
    setTabs((current) => {
      const next = [...current];
      const fromIdx = next.findIndex((t) => t.id === draggedTabId);
      const toIdx = next.findIndex((t) => t.id === tabId);
      if (fromIdx === -1 || toIdx === -1) return current;
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    setDraggedTabId(null);
    setDragOverTabId(null);
  }, [draggedTabId]);

  // ── Fullscreen ───────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => { });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => { });
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // ── Clear browsing data ──────────────────────────────
  const performClearData = useCallback(async () => {
    const rangeMs: Record<string, number> = { hour: 3600_000, day: 86_400_000, week: 7 * 86_400_000, all: Infinity };
    const cutoff = Date.now() - (rangeMs[clearDataRange] ?? Infinity);
    if (clearDataOptions.history) {
      setHistory((prev) => (clearDataRange === "all" ? [] : prev.filter((h) => h.timestamp < cutoff)));
    }
    if (clearDataOptions.downloads) {
      setDownloads((prev) => (clearDataRange === "all" ? [] : prev.filter((d) => d.startedAt < cutoff)));
    }
    if (clearDataOptions.passwords) setPasswords([]);
    if (clearDataOptions.cookies || clearDataOptions.cache) {
      // Renderer-only limitation: without a main-process session API we
      // can't wipe the whole persist:meera-browser partition. What we can
      // do for real is clear storage for whichever site is currently
      // loaded in each open tab.
      for (const tab of tabs) {
        const webview = webviewRefs.current.get(tab.id) as any;
        if (webview?.executeJavaScript) {
          try {
            await webview.executeJavaScript(`(function() {
              try {
                localStorage.clear();
                sessionStorage.clear();
                document.cookie.split(';').forEach(function(c) {
                  document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date(0).toUTCString() + ';path=/');
                });
              } catch (e) {}
            })();`, true);
          } catch { }
        }
      }
    }
    setClearDataModalOpen(false);
    showToast(
      clearDataOptions.cookies || clearDataOptions.cache
        ? "Cleared data for open tabs"
        : "Browsing data cleared"
    );
  }, [clearDataOptions, clearDataRange, showToast, tabs]);

  // ── Site permissions ─────────────────────────────────
  const getSiteSettingsFor = useCallback((hostname: string): SiteSettingsEntry => {
    const found = siteSettings.find((s) => s.hostname === hostname);
    return found || { hostname, camera: "ask", microphone: "ask", location: "ask", notifications: "ask", popups: settings.blockPopups ? "block" : "allow" };
  }, [siteSettings, settings.blockPopups]);

  const updateSitePermission = useCallback((hostname: string, key: keyof Omit<SiteSettingsEntry, "hostname">, value: SitePermission) => {
    setSiteSettings((prev) => {
      const idx = prev.findIndex((s) => s.hostname === hostname);
      if (idx === -1) {
        const base = getSiteSettingsFor(hostname);
        return [...prev, { ...base, [key]: value }];
      }
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  }, [getSiteSettingsFor]);

  // ── Global keyboard shortcuts ────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "t" && !e.shiftKey) {
        e.preventDefault();
        openTab(DEFAULT_HOME_URL);
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        undoCloseTab();
      } else if (mod && e.key.toLowerCase() === "w") {
        e.preventDefault();
        closeTab(activeTabId);
      } else if (mod && e.key === "Tab") {
        e.preventDefault();
        cycleTabSwitcher(e.shiftKey ? -1 : 1);
      } else if (mod && e.key.toLowerCase() === "l") {
        e.preventDefault();
        addressInputRef.current?.focus();
        addressInputRef.current?.select();
      } else if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        openFindInPage();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (address && !address.startsWith("meera://")) {
          setBookmarks((prev) => prev.some((b) => b.url === address)
            ? prev.filter((b) => b.url !== address)
            : [{ id: createId("bm"), url: address, title: activeTab.title, favicon: activeTab.favicon, dateAdded: Date.now() }, ...prev]);
          showToast("Bookmark added");
        }
      } else if (mod && e.key.toLowerCase() === "p") {
        e.preventDefault();
        printPage();
      } else if (mod && (e.key === "+" || e.key === "=")) {
        e.preventDefault();
        zoomIn();
      } else if (mod && e.key === "-") {
        e.preventDefault();
        zoomOut();
      } else if (mod && e.key === "0") {
        e.preventDefault();
        zoomReset();
      } else if (mod && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setDownloadsOpen((prev) => !prev);
      } else if (mod && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setLeftSidebarView((prev) => (prev === "history" ? "none" : "history"));
      } else if (mod && e.shiftKey && e.key === "Delete") {
        e.preventDefault();
        setClearDataModalOpen(true);
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setIsIncognito((prev) => !prev);
        showToast(!isIncognito ? "Private mode enabled" : "Private mode disabled");
      } else if (e.key === "Escape") {
        if (isAnyPopoverOpen) {
          closeAllPopovers();
          e.stopImmediatePropagation();
        } else if (findInPage.open) {
          closeFindInPage();
          e.stopImmediatePropagation();
        } else if (tabSwitcherOpen) {
          setTabSwitcherOpen(false);
          e.stopImmediatePropagation();
        } else if (clearDataModalOpen) {
          setClearDataModalOpen(false);
          e.stopImmediatePropagation();
        } else if (shortcutsHelpOpen) {
          setShortcutsHelpOpen(false);
          e.stopImmediatePropagation();
        } else if (activeTab?.loading) {
          activeWebview?.stop?.();
          e.stopImmediatePropagation();
        }
      } else if (e.key === "Enter" && tabSwitcherOpen) {
        confirmTabSwitcher();
      } else if (mod && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const idx = e.key === "9" ? tabs.length - 1 : parseInt(e.key, 10) - 1;
        if (tabs[idx]) setActiveTabId(tabs[idx].id);
      } else if (e.key === "F12") {
        e.preventDefault();
        toggleDevTools();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        toggleDevTools();
      } else if (mod && e.key.toLowerCase() === "u" && !e.shiftKey) {
        e.preventDefault();
        viewPageSource();
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        hardReloadTab();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [activeTabId, activeTab, address, tabs, isIncognito, findInPage.open, tabSwitcherOpen, clearDataModalOpen, shortcutsHelpOpen, isAnyPopoverOpen, closeAllPopovers, activeWebview, openFindInPage, closeFindInPage, cycleTabSwitcher, confirmTabSwitcher, zoomIn, zoomOut, zoomReset, printPage, showToast, toggleDevTools, viewPageSource, hardReloadTab]);

  const currentHostname = useMemo(() => {
    try { return new URL(activeTab.url).hostname; } catch { return ""; }
  }, [activeTab.url]);

  const filteredTabsForSearch = useMemo(() => {
    if (!tabSearchQuery.trim()) return tabs;
    const q = tabSearchQuery.toLowerCase();
    return tabs.filter((t) => t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q));
  }, [tabs, tabSearchQuery]);

  const filteredHistory = useMemo(() => {
    if (!historySearchQuery.trim()) return groupedHistory;
    const q = historySearchQuery.toLowerCase();
    return groupedHistory
      .map((g) => ({ ...g, items: g.items.filter((h) => h.title.toLowerCase().includes(q) || h.url.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0);
  }, [groupedHistory, historySearchQuery]);

  return (
    <div
      className="meera-browser"
      style={settings.ntpWallpaper ? { "--ntp-wallpaper": `url("${settings.ntpWallpaper}")` } as React.CSSProperties : undefined}
    >
      {/* Invisible Global Backdrop that intercepts clicks outside any open popover/menu */}
      {isAnyPopoverOpen && (
        <div
          className="meera-global-backdrop"
          onClick={closeAllPopovers}
          onContextMenu={(e) => {
            e.preventDefault();
            closeAllPopovers();
          }}
        />
      )}

      <header
        className={`meera-dynamic-dock ${isIncognito ? 'incognito' : ''}`}
        style={{
          position: 'relative',
          zIndex: isAnyPopoverOpen ? 85 : 10,
          display: 'flex',
          flexDirection: 'column',
          width: 'calc(100% - 32px)',
          maxWidth: '1800px',
          alignSelf: 'center',
          alignItems: 'stretch',
          margin: '16px auto 0 auto',
          padding: '10px 14px 12px',
          gap: '8px',
          flexShrink: 0,
          overflow: 'visible'
        }}
      >
        {/* ROW 1: BRAND AND TABS */}
        <div className="dock-top-row" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', width: '100%', gap: '10px' }}>
          <div className="dock-brand" onClick={goHome} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '0 4px', flexShrink: 0 }} title="Go to New Tab">
            <img src={browserLogo} alt="Meera Browser" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
            <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--browser-text-strong)' }}>
              Meera Browser
            </span>
          </div>

          <div className="dock-separator" style={{ height: '20px', width: '1px', background: 'var(--dock-border-light)' }} />

          <div className="dock-tabs-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none' }}>
            {filteredTabsForSearch.map((tab) => {
              const group = tab.groupId ? tabGroups.find((g) => g.id === tab.groupId) : null;
              const isPinned = tab.pinned;
              return (
                <button
                  key={tab.id}
                  draggable
                  onDragStart={() => handleTabDragStart(tab.id)}
                  onDragOver={(e) => handleTabDragOver(e, tab.id)}
                  onDrop={() => handleTabDrop(tab.id)}
                  className={`dock-tab ${tab.id === activeTabId ? 'active' : ''} ${isPinned ? 'pinned' : ''} ${dragOverTabId === tab.id ? 'drag-over' : ''} ${tab.muted ? 'muted' : ''}`}
                  onClick={() => focusTab(tab.id)}
                  onContextMenu={(e) => openTabContextMenu(e, tab.id)}
                  title={isPinned ? `${tab.title} (Pinned)` : tab.title}
                  style={{
                    ...(group ? { boxShadow: `inset 0 -2px 0 ${group.color}` } : {}),
                    ...(isPinned ? {
                      minWidth: '34px',
                      width: '34px',
                      padding: '0',
                      justifyContent: 'center',
                      borderRadius: '50%'
                    } : {
                      minWidth: '120px',
                      maxWidth: '220px'
                    })
                  }}
                >
                  {tab.favicon ? (
                    <img src={tab.favicon} alt="" style={{ width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0 }} />
                  ) : (
                    <span className="initial" style={{ flexShrink: 0, width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.1)', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>{tab.title.charAt(0).toUpperCase()}</span>
                  )}

                  {!isPinned && (
                    <span className="dock-tab-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px', flex: 1, textAlign: 'left', opacity: tab.suspended ? 0.6 : 0.9 }}>{tab.title}</span>
                  )}

                  {tab.suspended && <PiMoon className="dock-tab-sleep-icon" size={13} style={{ flexShrink: 0, opacity: 0.8, color: '#818cf8' }} />}

                  {tab.muted && <PiSpeakerSimpleSlash className="dock-tab-mute-icon" size={14} style={{ flexShrink: 0, opacity: 0.6 }} />}

                  {tabs.length > 1 && !isPinned && (
                    <span
                      className="dock-tab-close"
                      onClick={(event) => {
                        event.stopPropagation();
                        closeTab(tab.id);
                      }}
                    >
                      <PiX />
                    </span>
                  )}
                </button>
              );
            })}
            <button className="dock-btn dock-btn-plus" onClick={() => openTab(DEFAULT_HOME_URL)} aria-label="New Tab" title="New tab (Ctrl+T)">
              <PiPlus />
            </button>
            {tabs.length > 3 && (
              <button className="dock-btn" title="Search tabs" onClick={() => setTabSwitcherOpen(true)}>
                <PiCaretDown size={14} />
              </button>
            )}
          </div>

          {/* WINDOW CONTROLS AND LIVE DIGITAL CLOCK */}
          <div className="dock-window-controls titlebar-controls" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: 'auto', WebkitAppRegion: 'no-drag' } as any}>
            <div className="topbar-time" aria-label="Current time">
              <span className="topbar-time-main">{localTime}</span>
              <span className="topbar-time-seconds">{localSeconds}</span>
            </div>
            {!isMac && (
              <>
                <button
                  className="titlebar-btn minimize"
                  type="button"
                  aria-label="Minimize window"
                  title="Minimize"
                  onClick={() => windowControls?.minimize?.()}
                >
                  <img className="ui-icon" src={`${import.meta.env.BASE_URL}ui/minimize.svg`} alt="Minimize" />
                </button>
                <button
                  className="titlebar-btn maximize"
                  type="button"
                  aria-label="Maximize window"
                  title="Maximize"
                  onClick={() => windowControls?.maximize?.()}
                >
                  <img className="ui-icon" src={`${import.meta.env.BASE_URL}ui/maximize.svg`} alt="Maximize" />
                </button>
                <button
                  className="titlebar-btn close"
                  type="button"
                  aria-label="Close window"
                  title="Close"
                  onClick={() => windowControls?.close?.()}
                >
                  <img className="ui-icon" src={`${import.meta.env.BASE_URL}ui/close.svg`} alt="Close" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* ROW 2: NAV, OMNIPILL, TOOLS */}
        <div className="dock-bottom-row" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', width: '100%', gap: '8px' }}>
          <div className="dock-nav-group" style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            <button className="dock-btn" onClick={goBack} aria-label="Back" disabled={!activeTab?.canGoBack && activeTab?.canGoBack !== undefined}><LuChevronLeft size={20} /></button>
            <button className="dock-btn" onClick={goForward} aria-label="Forward"><LuChevronRight size={20} /></button>
            <button className="dock-btn" onClick={() => activeTab?.loading ? activeWebview?.stop?.() : reloadTab()} aria-label={activeTab?.loading ? "Stop" : "Reload"}>
              {activeTab?.loading ? <PiX size={18} /> : <LuRotateCw size={18} />}
            </button>
            <button className="dock-btn" onClick={goHome} aria-label="Home" title="Home"><PiGlobe size={18} /></button>
          </div>

          <div className="dock-separator" style={{ height: '20px', width: '1px', background: 'linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0.5), rgba(255,255,255,0))' }} />

          <div className={`dock-omnipill ${address.startsWith('> ') ? 'ai-command-mode' : ''}`} style={{ flex: 1, minWidth: '300px' }}>
            <button
              className="omnipill-site-info-btn dock-icon-chip"
              title="Site information"
              onClick={(e) => { e.stopPropagation(); setSiteInfoOpen((prev) => !prev); }}
            >
              {address.startsWith('> ') ? (
              <PiSparkleFill color="var(--browser-accent)" />
              ) : isOffline ? (
                <PiWifiSlash color="#ef4444" />
              ) : isSecureUrl(activeTab?.url || "") ? (
                <LuLock />
              ) : (
                <LuLockOpen color="#f59e0b" />
              )}
            </button>
            <input
              ref={addressInputRef}
              value={address}
              onChange={(event) => { setAddress(event.target.value); setOmniboxSuggestOpen(true); }}
              onFocus={() => setOmniboxSuggestOpen(true)}
              onBlur={() => window.setTimeout(() => setOmniboxSuggestOpen(false), 150)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  setOmniboxSuggestOpen(false);
                  if (address.startsWith('> ')) {
                    setMissionDraft(address.slice(2));
                    setAssistantOpen(true);
                    setAddress(activeTab?.url === DEFAULT_HOME_URL ? "" : activeTab?.url || "");
                  } else {
                    navigateActiveTab(address);
                  }
                } else if (event.key === "Escape") {
                  (event.target as HTMLInputElement).blur();
                }
              }}
              spellCheck={false}
              placeholder={`Search ${SEARCH_ENGINES[settings.searchEngine].label} or type '> ' for AI commands`}
            />
            {activeTab?.loading && <div className="omnipill-loading-bar"></div>}
            {address && omniboxSuggestOpen && !address.startsWith('>') && (
              <div className="omnibox-suggestions">
                {history
                  .filter((h) => h.url.toLowerCase().includes(address.toLowerCase()) || h.title.toLowerCase().includes(address.toLowerCase()))
                  .slice(0, 4)
                  .map((h) => (
                    <button key={h.id} className="omnibox-suggestion-item" onMouseDown={() => { navigateActiveTab(h.url); setOmniboxSuggestOpen(false); }}>
                      <PiClock size={13} />
                      <span className="omnibox-suggestion-text">{h.title}</span>
                      <span className="omnibox-suggestion-url">{h.url}</span>
                    </button>
                  ))}
                <button className="omnibox-suggestion-item" onMouseDown={() => { navigateActiveTab(address); setOmniboxSuggestOpen(false); }}>
                  <LuSearch size={13} />
                  <span className="omnibox-suggestion-text">Search "{address}"</span>
                </button>
              </div>
            )}
            <button className="omnipill-icon-action dock-icon-chip" title="Zoom" onClick={(e) => { e.stopPropagation(); setZoomMenuOpen((prev) => !prev); }}>
              {Math.round((activeTab?.zoom || 1) * 100) !== 100 && <span className="omnipill-zoom-badge">{Math.round((activeTab?.zoom || 1) * 100)}%</span>}
              <PiMagnifyingGlass size={16} />
            </button>
            <button
              className="dock-bookmark-toggle dock-icon-chip"
              title={bookmarks.some(b => b.url === address) ? "Remove Bookmark" : "Add Bookmark"}
              onClick={() => {
                if (address && !address.startsWith('meera://')) {
                  setBookmarks(prev => {
                    if (prev.some(b => b.url === address)) {
                      return prev.filter(b => b.url !== address);
                    }
                    showToast("Bookmark added");
                    return [{ id: createId('bm'), url: address, title: activeTab.title, favicon: activeTab.favicon, dateAdded: Date.now() }, ...prev];
                  });
                }
              }}
              style={{ color: bookmarks.some(b => b.url === address) ? 'var(--browser-accent)' : 'var(--browser-muted)', zIndex: 10 }}
            >
              {bookmarks.some(b => b.url === address) ? <PiStarFill size={18} /> : <PiStar size={18} />}
            </button>
            <button className="omnipill-icon-action dock-icon-chip" title="Share" onClick={(e) => { e.stopPropagation(); setShareMenuOpen((prev) => !prev); }}>
              <PiShareFat size={16} />
            </button>

            {siteInfoOpen && (
              <div className="omnibox-popover site-info-popover" ref={siteInfoRef} onClick={(e) => e.stopPropagation()}>
                <div className="site-info-header">
                  {isSecureUrl(activeTab?.url || "") ? <PiShieldCheck size={20} color="var(--browser-accent)" /> : <PiShieldWarning size={20} color="#f59e0b" />}
                  <div>
                    <div className="site-info-title">{isSecureUrl(activeTab?.url || "") ? "Connection is secure" : "Connection is not secure"}</div>
                    <div className="site-info-sub">{currentHostname || "This page"}</div>
                  </div>
                </div>
                <div className="site-info-row">
                  <span>Cookies</span>
                  <button
                    className="site-info-link"
                    onClick={async () => {
                      const webview = activeWebview as any;
                      if (webview?.executeJavaScript) {
                        try {
                          await webview.executeJavaScript(`(function() {
                            try {
                              localStorage.clear();
                              sessionStorage.clear();
                              document.cookie.split(';').forEach(function(c) {
                                document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date(0).toUTCString() + ';path=/');
                              });
                            } catch (e) {}
                          })();`, true);
                          showToast(`Cleared cookies for ${currentHostname}`);
                        } catch {
                          showToast("Couldn't clear cookies for this site");
                        }
                      }
                    }}
                  >
                    <PiCookie size={14} /> Clear for this site
                  </button>
                </div>
                {(["camera", "microphone", "location", "notifications", "popups"] as const).map((perm) => {
                  const s = getSiteSettingsFor(currentHostname);
                  return (
                    <div className="site-info-row" key={perm}>
                      <span style={{ textTransform: 'capitalize' }}>{perm}</span>
                      <select
                        value={s[perm]}
                        onChange={(e) => updateSitePermission(currentHostname, perm, e.target.value as SitePermission)}
                        className="site-info-select"
                      >
                        <option value="ask">Ask</option>
                        <option value="allow">Allow</option>
                        <option value="block">Block</option>
                      </select>
                    </div>
                  );
                })}
                <button className="site-info-link full" onClick={() => { setSettingsOpen(true); setActiveSettingsSection('privacy'); setSiteInfoOpen(false); }}>
                  <PiGear size={14} /> Site settings
                </button>
              </div>
            )}

            {zoomMenuOpen && (
              <div className="omnibox-popover zoom-popover" ref={zoomMenuRef} onClick={(e) => e.stopPropagation()}>
                <button className="zoom-step-btn" onClick={zoomOut}><PiMagnifyingGlassMinus size={16} /></button>
                <span className="zoom-value">{Math.round((activeTab?.zoom || 1) * 100)}%</span>
                <button className="zoom-step-btn" onClick={zoomIn}><PiMagnifyingGlassPlus size={16} /></button>
                <div className="dock-separator" style={{ height: '18px' }} />
                <button className="zoom-step-btn" onClick={zoomReset} title="Reset zoom"><PiArrowCounterClockwise size={15} /></button>
                <button className="zoom-step-btn" onClick={toggleFullscreen} title="Fullscreen">{isFullscreen ? <PiArrowsInSimple size={15} /> : <PiArrowsOutSimple size={15} />}</button>
              </div>
            )}

            {shareMenuOpen && (
              <div className="omnibox-popover share-popover" ref={shareMenuRef} onClick={(e) => e.stopPropagation()}>
                <button className="share-item" onClick={() => { void copyText(activeTab?.url || ""); showToast("Link copied"); setShareMenuOpen(false); }}>
                  <PiCopySimple size={15} /> Copy link
                </button>
                <button className="share-item" onClick={() => { printPage(); setShareMenuOpen(false); }}>
                  <PiPrinter size={15} /> Print page
                </button>
                <button className="share-item" onClick={() => { toggleReaderMode(); setShareMenuOpen(false); }}>
                  <PiBookOpenText size={15} /> {readerModeActive ? "Exit reader mode" : "Reader mode"}
                </button>
                <button className="share-item" onClick={() => { togglePip(); setShareMenuOpen(false); }}>
                  <PiMonitorPlay size={15} /> Picture-in-picture
                </button>
                <button className="share-item" onClick={() => { savePageAs(activeTab?.url || "", `${getHostname(activeTab?.url || "")}.html`); setShareMenuOpen(false); }}>
                  <PiFileArrowDown size={15} /> Save page as...
                </button>
              </div>
            )}
          </div>
          <div className="dock-separator" style={{ height: '20px', width: '1px', background: 'linear-gradient(180deg, rgba(255,255,255,0), rgba(255,255,255,0.5), rgba(255,255,255,0))' }} />
          <div className="dock-tools-group" style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>

            {isOffline && <span className="dock-offline-pill" title="No internet connection"><PiWifiSlash size={13} /> Offline</span>}
            <button
              className={`dock-btn dock-tool-btn history ${leftSidebarView === 'history' ? 'active' : ''}`}
              title="History (Ctrl+H)"
              onClick={() => {
                const next = leftSidebarView === 'history' ? 'none' : 'history';
                closeAllPopovers();
                setLeftSidebarView(next);
              }}
            >
              <PiClock size={20} />
            </button>
            <button
              className={`dock-btn dock-tool-btn bookmarks ${leftSidebarView === 'bookmarks' ? 'active' : ''}`}
              title="Bookmarks (Ctrl+B)"
              onClick={() => {
                const next = leftSidebarView === 'bookmarks' ? 'none' : 'bookmarks';
                closeAllPopovers();
                setLeftSidebarView(next);
              }}
            >
              <PiBookmarkSimple size={20} />
            </button>
            <div className="dock-popover-anchor">
              <button
                className={`dock-btn dock-tool-btn extensions ${leftSidebarView === 'extensions' ? 'active' : ''}`}
                title="Extensions"
                onClick={() => {
                  const next = leftSidebarView === 'extensions' ? 'none' : 'extensions';
                  closeAllPopovers();
                  setLeftSidebarView(next);
                }}
              >
                <PiPuzzlePiece size={20} />
              </button>
            </div>
            <div className="dock-popover-anchor">
              <button
                className={`dock-btn dock-tool-btn downloads ${downloadsOpen ? 'active' : ''}`}
                title="Downloads (Ctrl+J)"
                onClick={() => {
                  const next = !downloadsOpen;
                  closeAllPopovers();
                  setDownloadsOpen(next);
                }}
              >
                <PiDownloadSimple size={20} />
                {activeDownloadsCount > 0 && <span className="dock-badge">{activeDownloadsCount}</span>}
              </button>
              {downloadsOpen && (
                <div className="omnibox-popover downloads-popover" onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
                  <div className="downloads-popover-header" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ display: "flex", gap: 0, background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: 2 }}>
                      <button
                        style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: downloadsTab === "browser" ? "rgba(255,255,255,0.12)" : "transparent", color: downloadsTab === "browser" ? "inherit" : "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 12, fontWeight: downloadsTab === "browser" ? 600 : 400 }}
                        onClick={() => setDownloadsTab("browser")}
                      >Browser</button>
                      <button
                        style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: downloadsTab === "ai-files" ? "rgba(99, 102, 241, 0.2)" : "transparent", color: downloadsTab === "ai-files" ? "rgb(139, 92, 246)" : "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 12, fontWeight: downloadsTab === "ai-files" ? 600 : 400 }}
                        onClick={() => setDownloadsTab("ai-files")}
                      >AI Files</button>
                    </div>
                    <span style={{ flex: 1 }} />
                    {downloadsTab === "browser" && (
                      <button className="site-info-link" onClick={clearCompletedDownloads}>Clear completed</button>
                    )}
                    {downloadsTab === "ai-files" && (
                      <button className="site-info-link" onClick={() => void fetchServerFiles()}>Refresh</button>
                    )}
                  </div>
                  <div className="downloads-popover-list">
                    {downloadsTab === "browser" && (
                      <>
                        {downloads.length === 0 ? (
                          <p className="empty-state">No downloads yet.</p>
                        ) : downloads.slice(0, 8).map((d) => (
                          <div className="download-row" key={d.id}>
                            <div className="download-row-icon"><PiFileArrowDown size={18} /></div>
                            <div className="download-row-info">
                              <span className="download-row-name" title={d.filename}>{d.filename}</span>
                              {d.status === "in-progress" || d.status === "paused" ? (
                                <>
                                  <div className="download-progress-track">
                                    <div className="download-progress-fill" style={{ width: `${Math.min(100, (d.receivedBytes / d.totalBytes) * 100)}%` }} />
                                  </div>
                                  <span className="download-row-sub">{formatBytes(d.receivedBytes)} / {formatBytes(d.totalBytes)} {d.status === "paused" ? "· Paused" : ""}</span>
                                </>
                              ) : (
                                <span className="download-row-sub">{d.status === "completed" ? formatBytes(d.totalBytes) : "Cancelled"} · {formatRelativeTime(d.startedAt)}</span>
                              )}
                            </div>
                            <div className="download-row-actions">
                              {d.status === "in-progress" || d.status === "paused" ? (
                                <>
                                  <button onClick={() => pauseResumeDownload(d.id)} title={d.status === "paused" ? "Resume" : "Pause"}>{d.status === "paused" ? <PiPlay size={13} /> : <PiPause size={13} />}</button>
                                  <button onClick={() => cancelDownload(d.id)} title="Cancel"><PiXCircle size={13} /></button>
                                </>
                              ) : (
                                <button onClick={() => removeDownload(d.id)} title="Remove from list"><PiTrashSimple size={13} /></button>
                              )}
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                    {downloadsTab === "ai-files" && (
                      <>
                        {serverFilesLoading ? (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 24, gap: 8 }}>
                            <PiSpinnerGap size={18} className="spin" /> <span style={{ fontSize: 13, opacity: 0.6 }}>Loading files…</span>
                          </div>
                        ) : serverFiles.length === 0 ? (
                          <p className="empty-state">No AI-generated files yet. Ask Meera to create a document!</p>
                        ) : serverFiles.slice(0, 10).map((f) => (
                          <div className="download-row" key={f.name}>
                            <div className="download-row-icon"><PiFileText size={18} style={{ color: "rgb(139, 92, 246)" }} /></div>
                            <div className="download-row-info">
                              <span className="download-row-name" title={f.name}>{f.name}</span>
                              <span className="download-row-sub">{formatBytes(f.size)} · {new Date(f.modified).toLocaleDateString()}</span>
                            </div>
                            <div className="download-row-actions">
                              <button onClick={() => downloadServerFile(f.name)} title="Download" style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 2 }}><PiDownloadSimple size={16} /></button>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="dock-popover-anchor">
              <button
                className={`dock-btn dock-tool-btn notifications ${notificationsOpen ? 'active' : ''}`}
                title="Notifications"
                onClick={() => {
                  const next = !notificationsOpen;
                  closeAllPopovers();
                  setNotificationsOpen(next);
                }}
              >
                <PiBell size={20} />
              </button>
              {notificationsOpen && (
                <div className="omnibox-popover notifications-popover" ref={notifRef} onClick={(e) => e.stopPropagation()}>
                  <div className="downloads-popover-header"><span>Notifications</span></div>
                  <p className="empty-state">You're all caught up.</p>
                </div>
              )}
            </div>
            <div className="dock-popover-anchor">
              <button
                className={`dock-btn dock-tool-btn menu ${mainMenuOpen ? 'active' : ''}`}
                title="Menu"
                onClick={() => {
                  const next = !mainMenuOpen;
                  closeAllPopovers();
                  setMainMenuOpen(next);
                }}
              >
                <PiDotsThreeOutlineVertical size={18} />
              </button>
              {mainMenuOpen && (
                <div className="omnibox-popover main-menu-popover" ref={mainMenuRef} onClick={(e) => e.stopPropagation()}>
                  <button className="main-menu-item" onClick={() => { openTab(DEFAULT_HOME_URL); setMainMenuOpen(false); }}><PiPlus size={15} /> New tab <span className="main-menu-shortcut">Ctrl+T</span></button>
                  <button className="main-menu-item" onClick={() => { setIsIncognito((prev) => !prev); setMainMenuOpen(false); showToast(!isIncognito ? "Private mode enabled" : "Private mode disabled"); }}><PiUserFocus size={15} /> {isIncognito ? "Exit private mode" : "New private window"} <span className="main-menu-shortcut">Ctrl+Shift+N</span></button>
                  <div className="main-menu-divider" />
                  <button className="main-menu-item" onClick={() => { setLeftSidebarView('history'); setMainMenuOpen(false); }}><PiClock size={15} /> History <span className="main-menu-shortcut">Ctrl+H</span></button>
                  <button className="main-menu-item" onClick={() => { setLeftSidebarView('bookmarks'); setMainMenuOpen(false); }}><PiBookmarkSimple size={15} /> Bookmarks</button>
                  <button className="main-menu-item" onClick={() => { setDownloadsOpen(true); setMainMenuOpen(false); }}><PiDownloadSimple size={15} /> Downloads <span className="main-menu-shortcut">Ctrl+J</span></button>
                  <button className="main-menu-item" onClick={() => { navigateActiveTab('meera://passwords'); setMainMenuOpen(false); }}><PiKey size={15} /> Passwords</button>
                  <button className="main-menu-item" onClick={() => { setLeftSidebarView('extensions'); setMainMenuOpen(false); }}><PiPuzzlePiece size={15} /> Extensions</button>
                  <div className="main-menu-divider" />
                  <button className="main-menu-item" onClick={() => { zoomIn(); }}><PiMagnifyingGlassPlus size={15} /> Zoom in <span className="main-menu-shortcut">Ctrl++</span></button>
                  <button className="main-menu-item" onClick={() => { zoomOut(); }}><PiMagnifyingGlassMinus size={15} /> Zoom out <span className="main-menu-shortcut">Ctrl+-</span></button>
                  <button className="main-menu-item" onClick={() => { toggleFullscreen(); setMainMenuOpen(false); }}>{isFullscreen ? <PiArrowsInSimple size={15} /> : <PiArrowsOutSimple size={15} />} {isFullscreen ? "Exit fullscreen" : "Fullscreen"}</button>
                  <div className="main-menu-divider" />
                  <button className="main-menu-item" onClick={() => { printPage(); setMainMenuOpen(false); }}><PiPrinter size={15} /> Print <span className="main-menu-shortcut">Ctrl+P</span></button>
                  <button className="main-menu-item" onClick={() => { openFindInPage(); setMainMenuOpen(false); }}><PiMagnifyingGlass size={15} /> Find in page <span className="main-menu-shortcut">Ctrl+F</span></button>
                  <div className="main-menu-divider" />
                  <button className="main-menu-item" onClick={() => { hardReloadTab(); setMainMenuOpen(false); }}><PiArrowCounterClockwise size={15} /> Hard reload <span className="main-menu-shortcut">Ctrl+⇧+R</span></button>
                  <button className="main-menu-item" onClick={() => { viewPageSource(); setMainMenuOpen(false); }}><PiCode size={15} /> View page source <span className="main-menu-shortcut">Ctrl+U</span></button>
                  <button className="main-menu-item" onClick={() => { toggleDevTools(); setMainMenuOpen(false); }}><PiTerminalWindow size={15} /> Developer tools <span className="main-menu-shortcut">F12</span></button>
                  <button className="main-menu-item" onClick={() => { setSettingsOpen(true); setMainMenuOpen(false); }}><PiGear size={15} /> Settings</button>
                  <button className="main-menu-item" onClick={() => { setShortcutsHelpOpen(true); setMainMenuOpen(false); }}><PiKeyboard size={15} /> Keyboard shortcuts</button>
                  <div className="main-menu-divider" />
                  <button className="main-menu-item danger" onClick={() => { setClearDataModalOpen(true); setMainMenuOpen(false); }}><PiTrash size={15} /> Clear browsing data <span className="main-menu-shortcut">Ctrl+⇧+Del</span></button>
                </div>
              )}
            </div>
            {/* Split View Toggle */}
            <button
              className={`dock-btn dock-tool-btn ${splitTabId ? 'active' : ''}`}
              title={splitTabId ? "Exit Split View" : "Split View (Side-by-side tabs)"}
              onClick={() => toggleSplitView()}
            >
              <PiSquaresFour size={18} />
            </button>
            {/* Reader Mode Toggle */}
            {activeTab && activeTab.url !== DEFAULT_HOME_URL && (
              <button
                className={`dock-btn dock-tool-btn ${readerModeActive ? 'active' : ''}`}
                title={readerModeActive ? "Exit Reader Mode" : "Reader Mode (Distraction-free)"}
                onClick={toggleReaderMode}
              >
                <PiBookOpenText size={18} />
              </button>
            )}
            <button className="dock-btn primary dock-ai-btn" title="Open assistant" onClick={() => setAssistantOpen(!assistantOpen)}>
              <PiSparkleFill size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="meera-browser-stage" onClick={() => setLeftSidebarView('none')}>



        {/* Left Drawer (History / Bookmarks / Downloads) */}
        {leftSidebarView !== 'none' && (
          <aside className="meera-left-drawer" onClick={(e) => e.stopPropagation()}>
            {/* DRAWER HEADER */}
            <div className="left-drawer-header">
              <div className="left-drawer-title-box">
                <div className="left-drawer-icon-badge">
                  {leftSidebarView === 'history' && <PiClock size={16} />}
                  {leftSidebarView === 'bookmarks' && <PiBookmarkSimple size={16} />}
                  {leftSidebarView === 'downloads' && <PiDownloadSimple size={16} />}
                </div>
                <span className="left-drawer-title">
                  {leftSidebarView === 'history' && "Browsing History"}
                  {leftSidebarView === 'bookmarks' && "Bookmarks"}
                  {leftSidebarView === 'downloads' && "Downloads"}
                </span>
                <span className="left-drawer-count">
                  {leftSidebarView === 'history' && history.length}
                  {leftSidebarView === 'bookmarks' && bookmarks.length}
                  {leftSidebarView === 'downloads' && downloads.length}
                </span>
              </div>

              <div className="left-drawer-actions">
                {leftSidebarView === 'history' && history.length > 0 && (
                  <button
                    className="left-drawer-btn danger"
                    onClick={() => {
                      setHistory([]);
                      localStorage.removeItem(STORAGE_KEYS.history);
                      showToast("History cleared", <PiCheckCircle size={14} />);
                    }}
                    title="Clear all history"
                  >
                    <PiTrash size={12} /> Clear
                  </button>
                )}
                {leftSidebarView === 'bookmarks' && (
                  <button
                    className="left-drawer-btn"
                    onClick={() => {
                      toggleBookmark(activeTab.url, activeTab.title, activeTab.favicon);
                    }}
                    title="Bookmark current tab"
                  >
                    <PiPlus size={12} /> Add
                  </button>
                )}
                <button className="left-drawer-close" onClick={() => setLeftSidebarView('none')} title="Close sidebar">
                  <PiX size={15} />
                </button>
              </div>
            </div>

            {/* SEARCH BOX */}
            <div className="left-drawer-search-box">
              <LuSearch size={14} className="left-drawer-search-icon" />
              <input
                type="text"
                placeholder={leftSidebarView === 'history' ? "Search history..." : leftSidebarView === 'bookmarks' ? "Search bookmarks..." : "Search downloads..."}
                value={leftSidebarSearch}
                onChange={(e) => setLeftSidebarSearch(e.target.value)}
              />
              {leftSidebarSearch && (
                <button className="left-drawer-clear-search" onClick={() => setLeftSidebarSearch("")} title="Clear search">
                  <PiX size={10} />
                </button>
              )}
            </div>

            {/* DRAWER CONTENT */}
            <div className="left-drawer-content">
              {leftSidebarView === 'history' && (
                history.length === 0 ? (
                  <div style={{ textAlign: 'center', opacity: 0.5, padding: '36px 12px', fontSize: '13px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <PiClock size={28} />
                    <span>No browsing history yet</span>
                  </div>
                ) : (
                  history
                    .filter((h) => !leftSidebarSearch || (h.title || "").toLowerCase().includes(leftSidebarSearch.toLowerCase()) || (h.url || "").toLowerCase().includes(leftSidebarSearch.toLowerCase()))
                    .map((item) => (
                      <div
                        key={item.id}
                        className="drawer-card-item"
                        onClick={() => {
                          navigate(item.url);
                          setLeftSidebarView('none');
                        }}
                        title={item.url}
                      >
                        <div className="drawer-card-favicon">
                          {(item as any).favicon ? <img src={(item as any).favicon} alt="" /> : <LuGlobe size={15} />}
                        </div>
                        <div className="drawer-card-details">
                          <span className="drawer-card-title">{item.title || item.url}</span>
                          <div className="drawer-card-meta">
                            <span className="drawer-card-url">
                              {(() => {
                                try {
                                  return new URL(item.url).hostname.replace(/^www\./, "");
                                } catch {
                                  return item.url;
                                }
                              })()}
                            </span>
                            <span>•</span>
                            <span>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                        <button
                          className="drawer-card-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            setHistory((prev) => prev.filter((h) => h.id !== item.id));
                          }}
                          title="Remove from history"
                        >
                          <PiX size={13} />
                        </button>
                      </div>
                    ))
                )
              )}

              {leftSidebarView === 'bookmarks' && (
                bookmarks.length === 0 ? (
                  <div style={{ textAlign: 'center', opacity: 0.5, padding: '36px 12px', fontSize: '13px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <PiBookmarkSimple size={28} />
                    <span>No bookmarks yet</span>
                  </div>
                ) : (
                  bookmarks
                    .filter((b) => !leftSidebarSearch || (b.title || "").toLowerCase().includes(leftSidebarSearch.toLowerCase()) || (b.url || "").toLowerCase().includes(leftSidebarSearch.toLowerCase()))
                    .map((bm) => (
                      <div
                        key={bm.id}
                        className="drawer-card-item"
                        onClick={() => {
                          navigate(bm.url);
                          setLeftSidebarView('none');
                        }}
                        title={bm.url}
                      >
                        <div className="drawer-card-favicon">
                          {bm.favicon ? <img src={bm.favicon} alt="" /> : <LuGlobe size={15} />}
                        </div>
                        <div className="drawer-card-details">
                          <span className="drawer-card-title">{bm.title}</span>
                          <div className="drawer-card-meta">
                            <span className="drawer-card-url">
                              {(() => {
                                try {
                                  return new URL(bm.url).hostname.replace(/^www\./, "");
                                } catch {
                                  return bm.url;
                                }
                              })()}
                            </span>
                          </div>
                        </div>
                        <button
                          className="drawer-card-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBookmarks((prev) => prev.filter((b) => b.id !== bm.id));
                            showToast("Bookmark removed", <PiBookmarkSimple size={14} />);
                          }}
                          title="Remove bookmark"
                        >
                          <PiTrash size={13} />
                        </button>
                      </div>
                    ))
                )
              )}

              {leftSidebarView === 'downloads' && (
                downloads.length === 0 ? (
                  <div style={{ textAlign: 'center', opacity: 0.5, padding: '36px 12px', fontSize: '13px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <PiDownloadSimple size={28} />
                    <span>No downloads yet</span>
                  </div>
                ) : (
                  downloads
                    .filter((d) => !leftSidebarSearch || (d.filename || "").toLowerCase().includes(leftSidebarSearch.toLowerCase()))
                    .map((dl) => (
                      <div
                        key={dl.id}
                        className="drawer-card-item"
                        onClick={() => {
                          if (dl.savePath) {
                            (window as any).meera?.showItemInFolder?.(dl.savePath);
                          }
                        }}
                        title={dl.savePath || dl.filename}
                      >
                        <div className="drawer-card-favicon">
                          <PiFileText size={16} />
                        </div>
                        <div className="drawer-card-details">
                          <span className="drawer-card-title">{dl.filename}</span>
                          <div className="drawer-card-meta">
                            <span>{dl.status === "completed" ? "Completed" : dl.status === "in-progress" ? "Downloading..." : "Cancelled"}</span>
                            {dl.totalBytes > 0 && (
                              <>
                                <span>•</span>
                                <span>{formatBytes(dl.totalBytes)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                )
              )}
            </div>
          </aside>
        )}

        <main className="meera-browser-main">

          <div className="meera-browser-viewport-frame" onContextMenu={(e) => { if ((e.target as HTMLElement).closest('.meera-browser-webview')) return; }}>
            {tabs.map((tab) => (
              <React.Fragment key={tab.id}>
                {tab.url === "meera://passwords" ? (
                  <div className="internal-page" style={{ display: tab.id === activeTabId ? "flex" : "none" }}>
                    <div className="internal-page-shell">
                      <aside className="internal-page-nav">
                        <h2><PiKey size={16} /> Passwords</h2>
                        <button className="internal-nav-item active">Saved passwords</button>
                        <button className="internal-nav-item" onClick={() => { setSettingsOpen(true); setActiveSettingsSection("autofill"); }}>Settings</button>
                      </aside>
                      <div className="internal-page-content">
                        <section className="settings-section">
                          <div className="settings-row" style={{ marginBottom: 8 }}>
                            <div>
                              <span className="settings-row-label">{passwords.length} saved password{passwords.length !== 1 ? "s" : ""}</span>
                              <span className="settings-row-desc">Passwords are stored locally on this device and are not encrypted at rest.</span>
                            </div>
                            <button
                              className="site-info-link"
                              onClick={() => setManualPasswordForm({ hostname: "", username: "", password: "" })}
                            >
                              <PiPlus size={14} /> Add
                            </button>
                          </div>
                          {manualPasswordForm && (
                            <div className="password-row" style={{ flexWrap: "wrap", gap: 8 }}>
                              <input
                                className="meera-modal-input"
                                placeholder="Website (e.g. example.com)"
                                value={manualPasswordForm.hostname}
                                onChange={(e) => setManualPasswordForm((f) => f ? { ...f, hostname: e.target.value } : f)}
                                style={{ flex: "1 1 160px" }}
                              />
                              <input
                                className="meera-modal-input"
                                placeholder="Username or email"
                                value={manualPasswordForm.username}
                                onChange={(e) => setManualPasswordForm((f) => f ? { ...f, username: e.target.value } : f)}
                                style={{ flex: "1 1 160px" }}
                              />
                              <input
                                className="meera-modal-input"
                                type="password"
                                placeholder="Password"
                                value={manualPasswordForm.password}
                                onChange={(e) => setManualPasswordForm((f) => f ? { ...f, password: e.target.value } : f)}
                                style={{ flex: "1 1 160px" }}
                              />
                              <div style={{ display: "flex", gap: 8, width: "100%" }}>
                                <button className="meera-modal-btn" onClick={() => setManualPasswordForm(null)}>Cancel</button>
                                <button
                                  className="meera-modal-btn primary"
                                  disabled={!manualPasswordForm.hostname.trim() || !manualPasswordForm.password}
                                  onClick={() => {
                                    const hostname = manualPasswordForm.hostname.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
                                    setPasswords((prev) => [{
                                      id: createId("pw"),
                                      hostname,
                                      username: manualPasswordForm.username,
                                      password: manualPasswordForm.password,
                                      passwordMasked: "•".repeat(Math.min(manualPasswordForm.password.length, 12)),
                                      lastUsed: Date.now(),
                                    }, ...prev]);
                                    setManualPasswordForm(null);
                                  }}
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          )}
                          {passwords.length === 0 ? (
                            <p className="empty-state">No saved passwords yet. They'll appear here once you save one at sign-in.</p>
                          ) : passwords.map((pw) => (
                            <div className="password-row" key={pw.id}>
                              <img src={`https://www.google.com/s2/favicons?domain=${pw.hostname}&sz=32`} alt="" />
                              <div className="password-row-info">
                                <span className="settings-row-label">{pw.hostname}</span>
                                <span className="settings-row-desc">{pw.username}</span>
                              </div>
                              <span className="password-masked">
                                {revealedPasswordIds.has(pw.id) ? pw.password : pw.passwordMasked}
                              </span>
                              <button
                                className="remove-item-btn"
                                title={revealedPasswordIds.has(pw.id) ? "Hide password" : "Show password"}
                                onClick={() => setRevealedPasswordIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(pw.id)) next.delete(pw.id); else next.add(pw.id);
                                  return next;
                                })}
                              >
                                {revealedPasswordIds.has(pw.id) ? <PiEyeSlash size={14} /> : <PiEye size={14} />}
                              </button>
                              <button className="remove-item-btn" onClick={() => setPasswords((prev) => prev.filter((p) => p.id !== pw.id))}><PiX size={14} /></button>
                            </div>
                          ))}
                        </section>
                      </div>
                    </div>
                  </div>
                ) : tab.url === "meera://extensions" ? (
                  <div className="internal-page" style={{ display: tab.id === activeTabId ? "flex" : "none" }}>
                    <div className="internal-page-shell">
                      <aside className="internal-page-nav">
                        <h2><PiPuzzlePiece size={16} /> Extensions</h2>
                        <button className="internal-nav-item active">My extensions</button>
                        <button className="internal-nav-item" onClick={() => showToast("The extension store isn't available in this preview", <PiPuzzlePiece size={14} />)}>Discover more</button>
                        <button className="internal-nav-item" onClick={() => setShortcutsHelpOpen(true)}>Keyboard shortcuts</button>
                      </aside>
                      <div className="internal-page-content">
                        <section className="settings-section">
                          {extensions.map((ext) => (
                            <div className="extension-row" key={ext.id}>
                              <span className="extension-icon">{ext.icon}</span>
                              <div className="password-row-info">
                                <span className="settings-row-label">{ext.name}</span>
                                <span className="settings-row-desc">{ext.description}</span>
                              </div>
                              <label className="settings-toggle">
                                <input type="checkbox" checked={ext.enabled} onChange={() => setExtensions((prev) => prev.map((e) => e.id === ext.id ? { ...e, enabled: !e.enabled } : e))} />
                                <span />
                              </label>
                            </div>
                          ))}
                        </section>
                      </div>
                    </div>
                  </div>
                ) : tab.url === "meera://tabs" ? (
                  <div className="internal-page" style={{ display: tab.id === activeTabId ? "flex" : "none" }}>
                    <div className="internal-page-shell single">
                      <div className="internal-page-content">
                        <section className="settings-section">
                          <h3>Task manager</h3>
                          <div className="task-manager-table">
                            <div className="task-manager-row header">
                              <span>Tab</span>
                              <span>Memory</span>
                              <span>Status</span>
                            </div>
                            {tabs.map((t) => (
                              <div className="task-manager-row" key={t.id}>
                                <span className="task-manager-tab-name">
                                  {t.favicon ? <img src={t.favicon} alt="" /> : <LuGlobe size={14} />} {t.title}
                                </span>
                                <span>{t.memoryMb || Math.floor(40 + Math.random() * 180)} MB</span>
                                <span>{t.loading ? "Loading" : t.suspended ? "Suspended" : "Active"}</span>
                              </div>
                            ))}
                          </div>
                        </section>
                      </div>
                    </div>
                  </div>
                ) : tab.url === DEFAULT_HOME_URL ? (
                  <div
                    className="new-tab-page"
                    style={{ display: tab.id === activeTabId ? "flex" : "none" }}
                  >
                    <div className="new-tab-scroll">
                      <div className="new-tab-center">
                        <h1 className="new-tab-header">Find what you need or<br />ask anything...</h1>

                        <div className="new-tab-search-container">
                          <div className="new-tab-search-box">
                            <div className="new-tab-search-input-area">
                              <LuSearch />
                              <input
                                placeholder="Type a website or anything here..."
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleNewTabSearchSubmit((e.target as HTMLInputElement).value);
                                  }
                                }}
                              />
                            </div>
                            <div className="new-tab-search-actions">
                              <div className="new-tab-search-actions-left">
                                <button className="new-tab-toggle-btn">
                                  <PiPaperclip />
                                </button>
                                <button className="new-tab-toggle-btn">
                                  <PiSparkleFill /> With AI
                                </button>
                                <button className="new-tab-toggle-btn">
                                  <PiBrain /> Deep Research
                                </button>
                              </div>
                              <button className="new-tab-submit-btn">
                                <PiPaperPlaneTiltFill size={18} />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="new-tab-tiles">
                          <div className="new-tab-tile" onClick={() => navigateActiveTab("https://www.youtube.com")}>
                            <div className="new-tab-tile-icon youtube"><SiYoutube size={18} /></div>
                            <span>YouTube</span>
                          </div>
                          <div className="new-tab-tile" onClick={() => navigateActiveTab("https://mail.google.com")}>
                            <div className="new-tab-tile-icon gmail"><SiGmail size={18} /></div>
                            <span>Gmail</span>
                          </div>
                          <div className="new-tab-tile" onClick={() => navigateActiveTab("https://www.wikipedia.org")}>
                            <div className="new-tab-tile-icon wiki"><SiWikipedia size={18} /></div>
                            <span>Wikipedia</span>
                          </div>
                          <div className="new-tab-tile" onClick={() => navigateActiveTab("https://www.reddit.com")}>
                            <div className="new-tab-tile-icon reddit"><SiReddit size={18} /></div>
                            <span>Reddit</span>
                          </div>
                        </div>

                        {closedTabsStack.length > 0 && (
                          <div className="new-tab-recent-row">
                            <span className="new-tab-recent-label"><PiArrowCounterClockwise size={13} /> Recently closed</span>
                            <div className="new-tab-recent-chips">
                              {closedTabsStack.slice(-5).reverse().map((t) => (
                                <button key={t.id} className="new-tab-recent-chip" onClick={undoCloseTab} title={t.url}>
                                  {t.favicon ? <img src={t.favicon} alt="" /> : <LuGlobe size={13} />}
                                  {t.title}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {settings.showWidgetPanel && (
                          <div className="new-tab-dashboard-scroll">
                            <div className="widget-panel">
                              <div className="widget-panel-header">
                                <div className="widget-panel-heading">
                                  <PiGridNine size={18} />
                                  <h2>Your dashboard</h2>
                                  <span className="widget-panel-count">{widgetLayout.length} widget{widgetLayout.length !== 1 ? "s" : ""}</span>
                                </div>
                                <div className="widget-panel-actions">
                                  {widgetLayout.length > 0 && (
                                    <button className="widget-panel-action-btn" onClick={resetWidgetLayout} title="Reset to default layout">
                                      <PiArrowCounterClockwise size={14} /> Reset layout
                                    </button>
                                  )}
                                </div>
                              </div>

                              {widgetLayout.length > 0 && (
                                <div className="widget-grid">
                                  {widgetLayout.filter(w => w.type !== 'news').map((w) => {
                                    const meta = WIDGET_META[w.type];
                                    return (
                                      <div
                                        key={w.id}
                                        className={`widget-card size-${w.size} ${draggedWidgetId === w.id ? "dragging" : ""} ${dragOverWidgetId === w.id ? "drag-over" : ""}`}
                                        draggable
                                        onDragStart={handleWidgetDragStart(w.id)}
                                        onDragOver={handleWidgetDragOver(w.id)}
                                        onDrop={handleWidgetDrop(w.id)}
                                        onDragEnd={handleWidgetDragEnd}
                                      >
                                        <div className="widget-card-header">
                                          <span className="widget-drag-handle" title="Drag to reorder"><PiDotsSixVertical size={15} /></span>
                                          <span className="widget-card-icon">{meta.icon}</span>
                                          <span className="widget-card-title">{meta.label}</span>
                                          <div className="widget-card-controls">
                                            {meta.sizes.length > 1 && (
                                              <button className="widget-card-btn" title="Change size" onClick={() => cycleWidgetSize(w.id)}>
                                                <PiCornersOut size={13} /> {w.size.toUpperCase()}
                                              </button>
                                            )}
                                            <button className="widget-card-btn danger" title="Remove widget" onClick={() => removeWidget(w.id)}>
                                              <PiX size={13} />
                                            </button>
                                          </div>
                                        </div>
                                        <div className="widget-card-body">
                                          {w.type === "clock" && <ClockWidget size={w.size} />}
                                          {w.type === "notes" && (
                                            <NotesWidget
                                              value={widgetData.notes}
                                              onChange={(v) => setWidgetData((prev) => ({ ...prev, notes: v }))}
                                            />
                                          )}
                                          {w.type === "todo" && (
                                            <TodoWidget
                                              size={w.size}
                                              todos={widgetData.todos}
                                              onAdd={addTodo}
                                              onToggle={toggleTodo}
                                              onRemove={removeTodo}
                                            />
                                          )}
                                          {w.type === "topsites" && (
                                            <TopSitesWidget size={w.size} bookmarks={bookmarks} history={history} onOpen={(url) => openTab(url)} />
                                          )}
                                          {w.type === "calendar" && <CalendarWidget />}
                                          {w.type === "calculator" && <CalculatorWidget />}
                                          {w.type === "bookmarks" && (
                                            <BookmarksWidget size={w.size} bookmarks={bookmarks} onOpen={(url) => openTab(url)} />
                                          )}
                                          {w.type === "downloads" && <DownloadsWidget downloads={downloads} />}
                                          {w.type === "stocks" && <StocksWidget size={w.size} watchlist={widgetData.stocksWatchlist} />}
                                          {w.type === "focus" && (
                                            <FocusWidget focus={widgetData.focus} onUpdate={(updater) => setWidgetData((prev) => ({ ...prev, focus: updater(prev.focus) }))} />
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Discover Feed inside dashboard */}
                              <DiscoverFeed
                                topic={widgetData.newsTopic}
                                onTopicChange={(t) => setWidgetData(prev => ({ ...prev, newsTopic: t }))}
                                onOpen={(url) => openTab(url)}
                              />

                            </div>
                          </div>
                        )}

                      </div>

                      {/* Floating Add Widget Menu */}
                      <div className="new-tab-fab-container" ref={addWidgetMenuRef}>
                        <button className="new-tab-fab" onClick={() => setAddWidgetMenuOpen((v) => !v)} title="Customize Widgets">
                          <PiPlus size={24} />
                        </button>

                        {addWidgetMenuOpen && (
                          <div className="widget-add-menu bottom-up">
                            <div className="widget-add-menu-title">Add a widget</div>
                            {WIDGET_TYPES_ORDERED.map((type) => {
                              const meta = WIDGET_META[type];
                              return (
                                <button key={type} className="widget-add-menu-item" onClick={() => addWidget(type)}>
                                  <span className="widget-add-menu-icon">{meta.icon}</span>
                                  <span className="widget-add-menu-text">
                                    <span className="widget-add-menu-label">{meta.label}</span>
                                    <span className="widget-add-menu-desc">{meta.description}</span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                ) : (
                  !splitTabId && (
                    <div
                      key={`container-${tab.id}`}
                      className={["meera-browser-webview-container", tab.id === activeTabId ? "active" : ""].filter(Boolean).join(" ")}
                      style={{
                        flex: tab.id === activeTabId ? 1 : 0,
                        width: tab.id === activeTabId ? '100%' : '0',
                        height: tab.id === activeTabId ? '100%' : '0',
                        visibility: tab.id === activeTabId ? 'visible' : 'hidden',
                        display: tab.id === activeTabId ? 'flex' : 'none',
                        flexDirection: 'column',
                        position: 'relative'
                      }}
                    >
                      <WebviewWrapper tab={tab} registerRef={registerWebview(tab.id)} allowPopups={!settings.blockPopups} />
                    </div>
                  )
                )}
              </React.Fragment>
            ))}

            {/* SPLIT VIEW DUAL PANES */}
            {splitTabId && (
              <>
                {isResizingSplit && <div className="meera-split-drag-shield" />}

                {/* PRIMARY PANE */}
                <div
                  className={`meera-browser-pane primary ${focusedPane === "primary" ? "is-focused" : ""}`}
                  style={{ width: `${splitRatio}%`, display: 'flex', flexDirection: 'column', height: '100%', minWidth: '280px' }}
                  onClick={() => setFocusedPane("primary")}
                >
                  <div className="meera-split-pane-header">
                    <div className="pane-header-left">
                      {activeTab.favicon ? <img src={activeTab.favicon} alt="" className="pane-favicon" /> : <LuGlobe size={14} />}
                      <span className="pane-title">{activeTab.title || "Active Page"}</span>
                      <span className="pane-badge">Active</span>
                    </div>
                    <div className="pane-header-right">
                      <button className="pane-btn" onClick={swapSplitTabs} title="Swap Panes">
                        <PiArrowsOutCardinal size={13} />
                      </button>
                      <button className="pane-btn" onClick={() => reloadTab()} title="Reload">
                        <PiArrowCounterClockwise size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="meera-pane-content" style={{ flex: 1, position: 'relative', width: '100%', height: 'calc(100% - 36px)', minHeight: 0 }}>
                    <WebviewWrapper tab={activeTab} registerRef={registerWebview(activeTab.id)} allowPopups={!settings.blockPopups} />
                  </div>
                </div>

                {/* DRAGGABLE DIVIDER */}
                <div
                  className={`meera-split-divider ${isResizingSplit ? "active" : ""}`}
                  onMouseDown={startSplitResize}
                  onDoubleClick={resetSplitRatio}
                  title="Drag to resize · Double-click to balance 50/50"
                >
                  <div className="split-divider-handle">
                    <span /><span /><span />
                  </div>
                </div>

                {/* SECONDARY PANE */}
                {(() => {
                  const splitTab = tabs.find((t) => t.id === splitTabId);
                  if (!splitTab) return null;
                  return (
                    <div
                      className={`meera-browser-pane secondary ${focusedPane === "secondary" ? "is-focused" : ""}`}
                      style={{ width: `${100 - splitRatio}%`, display: 'flex', flexDirection: 'column', height: '100%', minWidth: '280px' }}
                      onClick={() => setFocusedPane("secondary")}
                    >
                      <div className="meera-split-pane-header">
                        <div className="pane-header-left">
                          {splitTab.favicon ? <img src={splitTab.favicon} alt="" className="pane-favicon" /> : <LuGlobe size={14} />}
                          <span className="pane-title">{splitTab.title || "Side Page"}</span>
                          <span className="pane-badge secondary">Side Pane</span>
                        </div>
                        <div className="pane-header-right">
                          <button className="pane-btn" onClick={swapSplitTabs} title="Swap Panes">
                            <PiArrowsOutCardinal size={13} />
                          </button>
                          <button className="pane-btn danger" onClick={() => setSplitTabId(null)} title="Close Split View">
                            <PiX size={13} />
                          </button>
                        </div>
                      </div>
                      <div className="meera-pane-content" style={{ flex: 1, position: 'relative', width: '100%', height: 'calc(100% - 36px)', minHeight: 0 }}>
                        <WebviewWrapper tab={splitTab} registerRef={registerWebview(splitTab.id)} allowPopups={!settings.blockPopups} />
                      </div>
                    </div>
                  );
                })()}
              </>
            )}

            {/* IN-APP READER MODE OVERLAY */}
            {readerArticle && (
              <ReaderModeOverlay
                article={readerArticle}
                onClose={() => {
                  setReaderArticle(null);
                  setReaderModeActive(false);
                }}
                onExportPdf={() => exportPageAsPdf()}
                onExportMarkdown={() => exportContentAsMarkdown(readerArticle.title, readerArticle.fullText)}
                onExportDocx={() => exportContentAsDocx(readerArticle.title, readerArticle.fullText)}
              />
            )}
          </div>

          {/* Page-Level AI FAB */}
          {activeTab && activeTab.url !== DEFAULT_HOME_URL && (
            <div style={{ position: 'absolute', bottom: '24px', right: '32px', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '16px', pointerEvents: 'none' }}>

              {/* The Floating Menu */}
              {pageAiMenuOpen && (
                <div style={{ background: 'var(--dock-bg)', backdropFilter: 'var(--dock-blur)', WebkitBackdropFilter: 'var(--dock-blur)', border: '1px solid var(--dock-border)', borderRadius: '16px', padding: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)', width: '230px', display: 'flex', flexDirection: 'column', gap: '4px', pointerEvents: 'auto', animation: 'fadeInUp 0.2s ease-out' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--browser-text)', opacity: 0.5, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '8px', padding: '0 8px' }}>Page AI Actions</div>

                  {[
                    {
                      icon: <PiSparkleFill size={16} />,
                      label: 'Do it for me',
                      primary: true,
                      action: () => {
                        setPageAiMenuOpen(false);
                        setAssistantOpen(true);
                        setMissionDraft("Help me accomplish a task on this page: ");
                      }
                    },
                    {
                      icon: <PiList size={16} />,
                      label: 'Summarize page',
                      action: () => {
                        setPageAiMenuOpen(false);
                        sendBrowserChat("Summarize this webpage concisely with 3-5 core takeaways, key findings, and practical conclusions.", "Summarize this page");
                      }
                    },
                    {
                      icon: <PiBrain size={16} />,
                      label: 'Deep Research',
                      action: () => {
                        setPageAiMenuOpen(false);
                        sendBrowserChat(`Conduct deep research and comprehensive analysis on the topic of this page: "${activeTab.title || activeTab.url}". Provide background context, key concepts, historical/industry perspective, and important implications.`, "Deep Research on page topic");
                      }
                    },
                    {
                      icon: <PiPaperclip size={16} />,
                      label: 'Extract Data & Tables',
                      action: () => {
                        setPageAiMenuOpen(false);
                        sendBrowserChat("Extract all structured data, numerical statistics, key tables, dates, comparison metrics, and structured lists from this page. Present them as cleanly formatted Markdown tables with CSV copy blocks.", "Extract Structured Data & Tables");
                      }
                    },
                    {
                      icon: <PiShieldCheck size={16} />,
                      label: 'Fact Check Page',
                      action: () => {
                        setPageAiMenuOpen(false);
                        sendBrowserChat("Fact-check the main claims and factual assertions made on this webpage. Verify their accuracy, highlight any questionable statements, and identify missing counter-arguments.", "Fact-Check this page");
                      }
                    },
                    {
                      icon: <PiFileArrowDown size={16} />,
                      label: 'Export Page as PDF',
                      action: () => {
                        setPageAiMenuOpen(false);
                        exportPageAsPdf();
                      }
                    },
                    {
                      icon: <PiFloppyDisk size={16} />,
                      label: 'Export Page as Word DOC',
                      action: () => {
                        setPageAiMenuOpen(false);
                        exportContentAsDocx(activeTab.title || "Webpage", activeTab.url);
                      }
                    },
                    {
                      icon: <PiDownload size={16} />,
                      label: 'Export Tables as CSV',
                      action: () => {
                        setPageAiMenuOpen(false);
                        exportTableAsCsv();
                      }
                    },
                    {
                      icon: <PiChatCircleText size={16} />,
                      label: 'Ask about page',
                      action: () => {
                        setPageAiMenuOpen(false);
                        setAssistantOpen(true);
                      }
                    }
                  ].map((item, i) => (
                    <button
                      key={i}
                      onClick={item.action}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '9px 12px', background: 'transparent', border: 'none', borderRadius: '8px', color: (item as any).primary ? 'var(--browser-accent)' : 'var(--browser-text)', fontWeight: (item as any).primary ? 600 : 500, fontSize: '13px', cursor: 'pointer', textAlign: 'left', transition: 'background 0.2s' }}
                      onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      {item.icon} {item.label}
                    </button>
                  ))}
                </div>
              )}

              {/* The FAB */}
              <button
                onClick={() => setPageAiMenuOpen(!pageAiMenuOpen)}
                style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--browser-accent) 0%, #0d8a69 100%)', border: 'none', boxShadow: '0 8px 24px rgba(16, 163, 127, 0.4)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)', transform: pageAiMenuOpen ? 'scale(0.95)' : 'scale(1)', pointerEvents: 'auto' }}
                onMouseOver={(e) => { if (!pageAiMenuOpen) { e.currentTarget.style.transform = 'scale(1.05)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(16, 163, 127, 0.5)'; } }}
                onMouseOut={(e) => { e.currentTarget.style.transform = pageAiMenuOpen ? 'scale(0.95)' : 'scale(1)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(16, 163, 127, 0.4)'; }}
                title="Page AI Actions"
              >
                {pageAiMenuOpen ? <PiX size={24} /> : <PiSparkleFill size={24} />}
              </button>
            </div>
          )}

          {/* Floating In-Page Text Selection AI Toolbar */}
          {selectedTextInfo && selectedTextInfo.text && (
            <div
              className="meera-selection-toolbar"
              style={{
                position: 'fixed',
                left: `${Math.min(window.innerWidth - 360, Math.max(20, selectedTextInfo.x))}px`,
                top: `${Math.max(75, Math.min(window.innerHeight - 100, selectedTextInfo.y + 70))}px`,
                zIndex: 200,
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                padding: '4px 6px',
                background: 'rgba(15, 23, 42, 0.92)',
                backdropFilter: 'blur(24px) saturate(180%)',
                WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                borderRadius: '12px',
                boxShadow: '0 12px 36px rgba(0, 0, 0, 0.4)',
                animation: 'fadeInUp 0.15s ease-out',
                WebkitAppRegion: 'no-drag',
              } as any}
            >
              <button
                className="selection-pill-btn"
                onClick={() => {
                  sendBrowserChat(`Explain the following excerpt clearly and concisely:\n\n"${selectedTextInfo.text}"`, "Explain selected text");
                  setSelectedTextInfo(null);
                }}
                title="Explain selected text"
              >
                <PiSparkleFill size={13} style={{ color: "#38bdf8" }} /> Explain
              </button>
              <button
                className="selection-pill-btn"
                onClick={() => {
                  sendBrowserChat(`Summarize the core message of this selected text in 1-2 sentences:\n\n"${selectedTextInfo.text}"`, "Summarize selected text");
                  setSelectedTextInfo(null);
                }}
                title="Summarize selected text"
              >
                <PiList size={13} /> Summarize
              </button>
              <button
                className="selection-pill-btn"
                onClick={() => {
                  sendBrowserChat(`Fact-check this statement from the page. State whether it is accurate and add important context:\n\n"${selectedTextInfo.text}"`, "Fact-check selection");
                  setSelectedTextInfo(null);
                }}
                title="Fact check this selection"
              >
                <PiShieldCheck size={13} style={{ color: "#4ade80" }} /> Fact Check
              </button>
              <button
                className="selection-pill-btn"
                onClick={() => {
                  sendBrowserChat(`Translate the following text into clear English (or Hindi if already in English):\n\n"${selectedTextInfo.text}"`, "Translate selection");
                  setSelectedTextInfo(null);
                }}
                title="Translate text"
              >
                <PiGlobe size={13} /> Translate
              </button>
              <button
                className="selection-pill-btn"
                onClick={() => {
                  void copyText(selectedTextInfo.text);
                  showToast("Copied to clipboard", <PiCopySimple size={14} />);
                  setSelectedTextInfo(null);
                }}
                title="Copy clean text"
              >
                <PiCopySimple size={13} />
              </button>
              <button
                className="selection-pill-btn close"
                onClick={() => setSelectedTextInfo(null)}
                title="Dismiss"
              >
                <PiX size={12} />
              </button>
            </div>
          )}

          <aside
            ref={inspectorAsideRef as React.RefObject<HTMLElement>}
            className={`meera-browser-inspector${assistantOpen ? " open" : ""}`}
            style={assistantOpen ? { width: `${inspectorWidth}px` } : undefined}
          >
            {assistantOpen && (
              <div
                className={`meera-inspector-resize-handle${isResizingInspector ? " active" : ""}`}
                onMouseDown={startInspectorResize}
                onDoubleClick={resetInspectorWidth}
                title="Drag to resize · double-click to reset"
              >
                <span className="resize-handle-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              </div>
            )}
            <section ref={inspectorCardRef as React.RefObject<HTMLElement>} className="meera-browser-card meera-sidebar-panel neo-style" style={assistantOpen ? { width: `${inspectorWidth}px` } : undefined}>
              <div className="sidebar-header neo-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <img src={browserLogo} alt="Meera Browser" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
                  <h2 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.3px' }}>Meera</h2>
                  <span className="neo-status-badge">Ready</span>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button className="neo-icon-btn" title="New Chat" onClick={() => { setBrowserChatMessages([]); setMissionDraft(""); if (browserChatAbortRef.current) { browserChatAbortRef.current.abort(); browserChatAbortRef.current = null; } setIsBrowserChatStreaming(false); }}><PiPlus size={15} /></button>
                  <button className="neo-icon-btn" onClick={() => setAssistantOpen(false)} title="Close">
                    <PiX size={15} />
                  </button>
                </div>
              </div>

              <div className="sidebar-content brain-scroll-area neo-scroll" ref={chatScrollRef}>

                {browserChatMessages.length === 0 ? (
                  <>
                    {/* WELCOME SCREEN */}
                    <div className="neo-hero-redesigned">
                      <div className="neo-hero-logo-ring">
                        <div className="neo-hero-logo-glow"></div>
                        <img src={browserLogo} alt="Meera Browser" className="neo-hero-logo-img" />
                      </div>
                      <h3>Meera is ready</h3>
                      <p>Use this panel for page analysis, summaries, comparisons, and research tasks. I stay quiet during normal browsing and only step in when you ask.</p>
                    </div>

                    {/* CURRENT PAGE CONTEXT */}
                    {activeTab && activeTab.url !== DEFAULT_HOME_URL && (
                      <div className="neo-page-context">
                        <div className="neo-page-context-header">
                          <div className="neo-page-context-dot"></div>
                          <span>Currently viewing</span>
                        </div>
                        <div className="neo-page-context-card">
                          {activeTab.favicon && <img src={activeTab.favicon} alt="" className="neo-page-context-favicon" />}
                          <div className="neo-page-context-info">
                            <span className="neo-page-context-title">{activeTab.title || 'Untitled'}</span>
                            <span className="neo-page-context-url">{(() => { try { return new URL(activeTab.url).hostname; } catch { return activeTab.url; } })()}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* QUICK ACTIONS */}
                    <div className="neo-quick-actions">
                      <div className="neo-section-label">Quick actions</div>
                      <div className="neo-actions-grid">
                        <button className="neo-action-chip" onClick={() => handleQuickAction('summarize')}>
                          <PiList size={16} />
                          <span>Summarize Page</span>
                        </button>
                        <button className="neo-action-chip" onClick={() => handleQuickAction('explain')}>
                          <PiChatCircleText size={16} />
                          <span>Explain This</span>
                        </button>
                        <button className="neo-action-chip" onClick={() => handleQuickAction('takeaways')}>
                          <PiBookmarkSimple size={16} />
                          <span>Key Takeaways</span>
                        </button>
                        <button className="neo-action-chip" onClick={() => handleQuickAction('similar')}>
                          <PiLightningFill size={16} />
                          <span>Find Similar</span>
                        </button>
                      </div>
                    </div>

                    {/* CAPABILITIES */}
                    <div className="neo-capabilities">
                      <div className="neo-section-label">What I can do</div>
                      <div className="neo-capability-list">
                        <div className="neo-capability-item">
                          <div className="neo-capability-icon"><PiSparkleFill size={14} /></div>
                          <div>
                            <strong>Analyze and summarize</strong>
                            <p>Get structured summaries of articles, videos, and threads</p>
                          </div>
                        </div>
                        <div className="neo-capability-item">
                          <div className="neo-capability-icon"><PiLightningFill size={14} /></div>
                          <div>
                            <strong>Smart search</strong>
                            <p>Find information across open tabs and browsing history</p>
                          </div>
                        </div>
                        <div className="neo-capability-item">
                          <div className="neo-capability-icon"><PiBrain size={14} /></div>
                          <div>
                            <strong>Deep research</strong>
                            <p>Cross-reference facts and explore topics in depth</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  /* CHAT THREAD */
                  <div className="neo-chat-thread">
                    {browserChatMessages.map((msg) => (
                      <div key={msg.id} className={`neo-chat-bubble ${msg.role}`}>
                        <div className="neo-chat-bubble-column">
                          {msg.attachment && (
                            <div className="neo-chat-attachment-card">
                              {msg.attachment.favicon ? (
                                <img src={msg.attachment.favicon} alt="" className="neo-chat-attachment-favicon" />
                              ) : (
                                <LuGlobe className="neo-chat-attachment-favicon" size={18} />
                              )}
                              <div className="neo-chat-attachment-info">
                                <span className="neo-chat-attachment-title">{msg.attachment.title}</span>
                                <span className="neo-chat-attachment-url">
                                  {(() => {
                                    try {
                                      return new URL(msg.attachment.url).hostname.replace(/^www\./, "");
                                    } catch {
                                      return msg.attachment.url;
                                    }
                                  })()}
                                </span>
                              </div>
                            </div>
                          )}
                          <div className="neo-chat-bubble-content">
                            {msg.role === "assistant" && !msg.content && isBrowserChatStreaming ? (
                              <div className="neo-typing-indicator">
                                <span></span><span></span><span></span>
                              </div>
                            ) : (
                              <>
                                <BrowserChatMarkdown content={msg.content} />
                                {msg.role === "assistant" && msg.content && (
                                  <>
                                    {msg.content.includes("Connection error") ? (
                                      <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        <button
                                          className="meera-modal-btn primary"
                                          style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                          onClick={async () => {
                                            showToast("Starting Meera AI Engine...", <PiSparkleFill size={14} />);
                                            try {
                                              await (window as any).meera?.startBackend?.();
                                              showToast("Meera Backend initialized!", <PiCheckCircle size={14} />);
                                            } catch {}
                                          }}
                                        >
                                          <PiLightningFill size={13} /> Launch AI Backend Engine
                                        </button>
                                      </div>
                                    ) : (
                                      msg.content.length > 20 && (
                                        <div className="neo-msg-actions-bar" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
                                          <button
                                            className="neo-msg-action-btn"
                                            onClick={() => exportContentAsDocx("Meera_AI_Research", msg.content)}
                                            title="Export response as Word (.doc) to Downloads"
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', background: 'rgba(255,255,255,0.08)', border: 'none', color: 'var(--browser-text)', cursor: 'pointer' }}
                                          >
                                            <PiFloppyDisk size={12} /> Save Word DOC
                                          </button>
                                          <button
                                            className="neo-msg-action-btn"
                                            onClick={() => exportContentAsMarkdown("Meera_AI_Response", msg.content)}
                                            title="Export response as Markdown to Downloads"
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', background: 'rgba(255,255,255,0.08)', border: 'none', color: 'var(--browser-text)', cursor: 'pointer' }}
                                          >
                                            <PiFileArrowDown size={12} /> Save Markdown
                                          </button>
                                          <button
                                            className="neo-msg-action-btn"
                                            onClick={() => {
                                              void copyText(msg.content);
                                              showToast("Copied to clipboard", <PiCopySimple size={14} />);
                                            }}
                                            title="Copy response"
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', background: 'rgba(255,255,255,0.08)', border: 'none', color: 'var(--browser-text)', cursor: 'pointer' }}
                                          >
                                            <PiCopySimple size={12} /> Copy
                                          </button>
                                        </div>
                                      )
                                    )}
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              </div>

              {/* INPUT AREA */}
              <div className="neo-input-wrapper">
                <div className="neo-context-banner">
                  <div className="neo-context-pill site-context-pill">
                    <div className="neo-context-dot"></div>
                    <span>
                      {activeTab?.url && activeTab.url !== DEFAULT_HOME_URL
                        ? `${activeTab.title || activeTab.url} · ${(() => {
                          try {
                            return new URL(activeTab.url).hostname.replace(/^www\./, "");
                          } catch {
                            return activeTab.url;
                          }
                        })()}`
                        : "No active page context"}
                    </span>
                  </div>
                </div>
                <div className={`neo-input-bar ${isBrowserChatStreaming ? 'streaming' : ''}`}>
                  <button className="neo-input-icon" title="Attach"><PiPaperclip size={17} /></button>
                  <div className="neo-context-pill">
                    <div className="neo-context-dot"></div>
                    <span>{tabs.length} Context</span>
                  </div>
                  <input
                    type="text"
                    value={missionDraft}
                    onChange={(e) => setMissionDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendBrowserChat(missionDraft);
                      }
                    }}
                    placeholder={isBrowserChatStreaming ? "Meera is thinking..." : "Ask Meera anything..."}
                    className="neo-input-field"
                    disabled={isBrowserChatStreaming}
                  />
                  {isBrowserChatStreaming ? (
                    <button className="neo-input-submit active" onClick={() => { if (browserChatAbortRef.current) { browserChatAbortRef.current.abort(); } }} title="Stop generating">
                      <PiX size={15} />
                    </button>
                  ) : (
                    <button className={`neo-input-submit ${missionDraft ? 'active' : ''}`} onClick={() => sendBrowserChat(missionDraft)}>
                      <PiPaperPlaneTiltFill size={15} />
                    </button>
                  )}
                </div>
                <div className="neo-input-footer">
                  <span>Meera can make mistakes. Verify important information.</span>
                </div>
              </div>
            </section>
          </aside>
        </main>
      </div>

      {/* FIND IN PAGE BAR (Ctrl+F) */}
      {findInPage.open && (
        <div className="meera-find-bar">
          <input
            type="text"
            autoFocus
            value={findInPage.query}
            onChange={(e) => runFindInPage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); jumpFindMatch(e.shiftKey ? "prev" : "next"); }
              if (e.key === "Escape") closeFindInPage();
            }}
            placeholder="Find in page"
          />
          <span className="find-bar-count">{findInPage.totalMatches > 0 ? `${findInPage.activeMatch}/${findInPage.totalMatches}` : findInPage.query ? "0/0" : ""}</span>
          <button onClick={() => jumpFindMatch("prev")} title="Previous match"><PiCaretUp size={14} /></button>
          <button onClick={() => jumpFindMatch("next")} title="Next match"><PiCaretDown size={14} /></button>
          <button onClick={closeFindInPage} title="Close"><PiX size={14} /></button>
        </div>
      )}

      {/* TAB SWITCHER OVERLAY (Ctrl+Tab) */}
      {tabSwitcherOpen && (
        <div className="meera-tab-switcher-overlay" onClick={() => setTabSwitcherOpen(false)}>
          <div className="meera-tab-switcher" onClick={(e) => e.stopPropagation()}>
            {tabs.map((tab, i) => (
              <button key={tab.id} className={`tab-switcher-item ${i === tabSwitcherIndex ? 'active' : ''}`} onClick={() => { setActiveTabId(tab.id); setTabSwitcherOpen(false); }}>
                {tab.favicon ? <img src={tab.favicon} alt="" /> : <LuGlobe size={16} />}
                <span>{tab.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTEXT MENU */}
      {contextMenu.open && contextMenu.kind === "tab" && contextMenu.targetId && (() => {
        const tab = tabs.find((t) => t.id === contextMenu.targetId);
        if (!tab) return null;
        return (
          <div className="meera-context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { openTab(DEFAULT_HOME_URL); closeContextMenu(); }}><PiPlus size={14} /> New tab</button>
            <button onClick={() => { duplicateTab(tab.id); closeContextMenu(); }}><PiCopySimple size={14} /> Duplicate tab</button>
            <button onClick={() => { togglePinTab(tab.id); closeContextMenu(); }}>{tab.pinned ? <PiPushPin size={14} /> : <PiPushPinFill size={14} />} {tab.pinned ? "Unpin tab" : "Pin tab"}</button>
            <button onClick={() => { toggleMuteTab(tab.id); closeContextMenu(); }}>{tab.muted ? <PiSpeakerSimpleHigh size={14} /> : <PiSpeakerSimpleSlash size={14} />} {tab.muted ? "Unmute tab" : "Mute tab"}</button>
            <button onClick={() => { updateTab(tab.id, { suspended: !tab.suspended }); closeContextMenu(); showToast(tab.suspended ? "Tab awakened" : "Tab sleeping to save memory", <PiMoon size={14} />); }}>
              <PiMoon size={14} /> {tab.suspended ? "Wake tab" : "Sleep tab (Save RAM)"}
            </button>
            <button onClick={() => { toggleSplitView(tab.id); closeContextMenu(); }}>
              <PiSquaresFour size={14} /> {splitTabId === tab.id ? "Close split view" : "Open in Split View"}
            </button>
            <div className="main-menu-divider" />
            {tab.groupId ? (
              <button onClick={() => { addTabToGroup(tab.id, null); closeContextMenu(); }}><PiFolderSimple size={14} /> Remove from group</button>
            ) : (
              <button onClick={() => { setNewGroupPromptTabId(tab.id); closeContextMenu(); }}><PiFolderSimplePlus size={14} /> Add to new group</button>
            )}
            {tabGroups.length > 0 && !tab.groupId && tabGroups.map((g) => (
              <button key={g.id} onClick={() => { addTabToGroup(tab.id, g.id); closeContextMenu(); }} style={{ paddingLeft: '28px' }}>
                <PiCircleFill size={10} color={g.color} /> Add to "{g.name}"
              </button>
            ))}
            <div className="main-menu-divider" />
            <button onClick={() => { closeOtherTabs(tab.id); closeContextMenu(); }}><PiX size={14} /> Close other tabs</button>
            <button onClick={() => { closeTabsToRight(tab.id); closeContextMenu(); }}><PiArrowSquareOut size={14} /> Close tabs to the right</button>
            <button className="danger" onClick={() => { closeTab(tab.id); closeContextMenu(); }}><PiTrash size={14} /> Close tab</button>
          </div>
        );
      })()}

      {newGroupPromptTabId && (
        <div className="meera-modal-overlay" onClick={() => setNewGroupPromptTabId(null)}>
          <div className="meera-modal small" onClick={(e) => e.stopPropagation()}>
            <h3>Name this group</h3>
            <input
              autoFocus
              className="meera-modal-input"
              placeholder="Group name"
              onKeyDown={(e) => {
                if (e.key === "Enter") createTabGroup(newGroupPromptTabId, (e.target as HTMLInputElement).value);
                if (e.key === "Escape") setNewGroupPromptTabId(null);
              }}
            />
            <div className="meera-modal-actions">
              <button className="meera-modal-btn" onClick={() => setNewGroupPromptTabId(null)}>Cancel</button>
              <button className="meera-modal-btn primary" onClick={(e) => { const input = (e.currentTarget.parentElement?.parentElement?.querySelector('.meera-modal-input') as HTMLInputElement); createTabGroup(newGroupPromptTabId, input?.value || "New Group"); }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* SAVE PASSWORD PROMPT */}
      {savePasswordPrompt && (
        <div className="meera-modal-overlay" onClick={dismissSavePassword}>
          <div className="meera-modal small" onClick={(e) => e.stopPropagation()}>
            <h3>Save password?</h3>
            <p className="settings-row-desc" style={{ margin: "0 0 12px" }}>
              Save this password for <strong>{savePasswordPrompt.hostname}</strong>
              {savePasswordPrompt.username ? ` (${savePasswordPrompt.username})` : ""}?
            </p>
            <div className="meera-modal-actions">
              <button className="meera-modal-btn" onClick={dismissSavePassword}>Not now</button>
              <button className="meera-modal-btn primary" onClick={confirmSavePassword}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* CLEAR BROWSING DATA MODAL */}
      {clearDataModalOpen && (
        <div className="meera-modal-overlay" onClick={() => setClearDataModalOpen(false)}>
          <div className="meera-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Clear browsing data</h3>
            <div className="clear-data-range-row">
              <label>Time range</label>
              <select value={clearDataRange} onChange={(e) => setClearDataRange(e.target.value as any)} className="site-info-select">
                <option value="hour">Last hour</option>
                <option value="day">Last 24 hours</option>
                <option value="week">Last 7 days</option>
                <option value="all">All time</option>
              </select>
            </div>
            {Object.entries({ history: "Browsing history", cookies: "Cookies and site data (open tabs only)", cache: "Local/session storage (open tabs only)", downloads: "Download history", passwords: "Saved passwords" }).map(([key, label]) => (
              <label className="clear-data-checkbox-row" key={key}>
                <input
                  type="checkbox"
                  checked={(clearDataOptions as any)[key]}
                  onChange={(e) => setClearDataOptions((prev) => ({ ...prev, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
            <div className="meera-modal-actions">
              <button className="meera-modal-btn" onClick={() => setClearDataModalOpen(false)}>Cancel</button>
              <button className="meera-modal-btn primary" onClick={performClearData}>Clear data</button>
            </div>
          </div>
        </div>
      )}

      {/* RESET SETTINGS CONFIRM MODAL */}
      {resetConfirmOpen && (
        <div className="meera-modal-overlay" onClick={() => setResetConfirmOpen(false)}>
          <div className="meera-modal small" onClick={(e) => e.stopPropagation()}>
            <h3>Reset settings?</h3>
            <p className="settings-row-desc" style={{ margin: "0 0 12px" }}>
              This restores every setting on this page to its default value. Saved passwords, bookmarks, and history are not affected.
            </p>
            <div className="meera-modal-actions">
              <button className="meera-modal-btn" onClick={() => setResetConfirmOpen(false)}>Cancel</button>
              <button className="meera-modal-btn primary" onClick={resetSettingsToDefaults}>Reset</button>
            </div>
          </div>
        </div>
      )}

      {/* KEYBOARD SHORTCUTS HELP MODAL */}
      {shortcutsHelpOpen && (
        <div className="meera-modal-overlay" onClick={() => setShortcutsHelpOpen(false)}>
          <div className="meera-modal wide" onClick={(e) => e.stopPropagation()}>
            <h3>Keyboard shortcuts</h3>
            <div className="shortcuts-grid">
              {["Tabs", "Navigation", "Page", "Window"].map((cat) => (
                <div className="shortcuts-col" key={cat}>
                  <h4>{cat}</h4>
                  {KEYBOARD_SHORTCUTS.filter((s) => s.category === cat).map((s) => (
                    <div className="shortcut-row" key={s.keys}>
                      <span>{s.action}</span>
                      <kbd>{s.keys}</kbd>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="meera-modal-actions">
              <button className="meera-modal-btn primary" onClick={() => setShortcutsHelpOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div className="meera-toast" key={toast.id}>
          {toast.icon} {toast.message}
        </div>
      )}

      {/* PAGE RIGHT-CLICK CONTEXT MENU */}
      {contextMenu.open && contextMenu.kind === "page" && (
        <div className="meera-context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { goBack(); closeContextMenu(); }}><LuChevronLeft size={14} /> Back</button>
          <button onClick={() => { goForward(); closeContextMenu(); }}><LuChevronRight size={14} /> Forward</button>
          <button onClick={() => { reloadTab(); closeContextMenu(); }}><LuRotateCw size={14} /> Reload</button>
          <div className="main-menu-divider" />
          <button onClick={() => { void copyText(activeTab?.url || ""); showToast("Link copied"); closeContextMenu(); }}><PiCopySimple size={14} /> Copy page link</button>
          <button onClick={() => { openFindInPage(); closeContextMenu(); }}><PiMagnifyingGlass size={14} /> Find in page</button>
          <button onClick={() => { toggleReaderMode(); closeContextMenu(); }}><PiBookOpenText size={14} /> Reader mode</button>
          <button onClick={() => { printPage(); closeContextMenu(); }}><PiPrinter size={14} /> Print</button>
          <div className="main-menu-divider" />
          <button onClick={() => { viewPageSource(); closeContextMenu(); }}><PiCode size={14} /> View page source</button>
          <button onClick={() => { toggleDevTools(); closeContextMenu(); }}><PiTerminalWindow size={14} /> Inspect</button>
        </div>
      )}

      {/* CONTROL CENTER OVERLAY (SETTINGS) */}
      {isSettingsOpen && (
        <div className="control-center-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="control-center-modal" onClick={(e) => e.stopPropagation()}>

            <aside className="cc-sidebar">
              <div className="cc-header">
                <span className="cc-subtitle">SETTINGS</span>
                <h2 className="cc-title">Control Center</h2>
              </div>

              <div className="cc-profile-pill">
                <div className="cc-profile-avatar" style={{ padding: user?.photoURL ? 0 : undefined, overflow: 'hidden' }}>
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <PiUser size={18} />
                  )}
                </div>
                <div className="cc-profile-info">
                  <span className="cc-profile-name">{user?.displayName || "Guest Explorer"}</span>
                  <span className="cc-profile-desc" style={{ fontSize: 10 }}>{user?.email || "Sign in to sync"}</span>
                </div>
              </div>

              <input
                className="cc-search-input"
                placeholder="Search settings"
                value={settingsQuery}
                onChange={(e) => setSettingsQuery(e.target.value)}
              />

              <div className="cc-nav-list">
                <button
                  className={`cc-nav-pill ${activeSettingsSection === 'about' ? 'active' : ''}`}
                  onClick={() => setActiveSettingsSection('about')}
                >
                  <div className="cc-nav-icon" style={{ background: 'transparent' }}><img src="/ui/settings-nav/about.svg" style={{ width: 22, height: 22 }} alt="" /></div>
                  <div className="cc-nav-text">
                    <span className="cc-nav-label">About</span>
                    <span className="cc-nav-desc">What MeeraAI is</span>
                  </div>
                </button>

                <button
                  className={`cc-nav-pill ${activeSettingsSection === 'appearance' ? 'active' : ''}`}
                  onClick={() => setActiveSettingsSection('appearance')}
                >
                  <div className="cc-nav-icon" style={{ background: 'transparent' }}><img src="/ui/settings-nav/ruler.svg" style={{ width: 22, height: 22 }} alt="" /></div>
                  <div className="cc-nav-text">
                    <span className="cc-nav-label">Appearance</span>
                    <span className="cc-nav-desc">Glass, clarity, contrast</span>
                  </div>
                </button>

                <button
                  className={`cc-nav-pill ${activeSettingsSection === 'privacy' ? 'active' : ''}`}
                  onClick={() => setActiveSettingsSection('privacy')}
                >
                  <div className="cc-nav-icon" style={{ background: 'transparent' }}><img src="/ui/settings-nav/key.svg" style={{ width: 22, height: 22 }} alt="" /></div>
                  <div className="cc-nav-text">
                    <span className="cc-nav-label">Privacy</span>
                    <span className="cc-nav-desc">Data & Security</span>
                  </div>
                </button>

                <button
                  className={`cc-nav-pill ${activeSettingsSection === 'widgets' ? 'active' : ''}`}
                  onClick={() => setActiveSettingsSection('widgets')}
                >
                  <div className="cc-nav-icon" style={{ background: 'transparent' }}><img src="/ui/settings-nav/puzzle.svg" style={{ width: 22, height: 22 }} alt="" /></div>
                  <div className="cc-nav-text">
                    <span className="cc-nav-label">Widgets</span>
                    <span className="cc-nav-desc">Dashboard & Tools</span>
                  </div>
                </button>

                <button
                  className={`cc-nav-pill ${activeSettingsSection === 'general' ? 'active' : ''}`}
                  onClick={() => setActiveSettingsSection('general')}
                >
                  <div className="cc-nav-icon" style={{ background: 'transparent' }}><img src="/ui/settings-nav/statistics.svg" style={{ width: 22, height: 22 }} alt="" /></div>
                  <div className="cc-nav-text">
                    <span className="cc-nav-label">System</span>
                    <span className="cc-nav-desc">Engine & Startup</span>
                  </div>
                </button>

                <button
                  className={`cc-nav-pill ${activeSettingsSection === 'wallpaper' ? 'active' : ''}`}
                  onClick={() => setActiveSettingsSection('wallpaper')}
                >
                  <div className="cc-nav-icon" style={{ background: 'transparent' }}><img src="/ui/settings-nav/picture.svg" style={{ width: 22, height: 22 }} alt="" /></div>
                  <div className="cc-nav-text">
                    <span className="cc-nav-label">Wallpaper</span>
                    <span className="cc-nav-desc">Backgrounds & imports</span>
                  </div>
                </button>

                <button
                  className={`cc-nav-pill ${activeSettingsSection === 'downloads' ? 'active' : ''}`}
                  onClick={() => setActiveSettingsSection('downloads')}
                >
                  <div className="cc-nav-icon" style={{ background: 'transparent' }}><img src="/ui/settings-nav/statistics.svg" style={{ width: 22, height: 22 }} alt="" /></div>
                  <div className="cc-nav-text">
                    <span className="cc-nav-label">Downloads</span>
                    <span className="cc-nav-desc">Save files & paths</span>
                  </div>
                </button>

                <button
                  className={`cc-nav-pill ${activeSettingsSection === 'account' ? 'active' : ''}`}
                  onClick={() => setActiveSettingsSection('account')}
                >
                  <div className="cc-nav-icon" style={{ background: 'transparent' }}><img src="/ui/settings-nav/contacts.svg" style={{ width: 22, height: 22 }} alt="" /></div>
                  <div className="cc-nav-text">
                    <span className="cc-nav-label">Account</span>
                    <span className="cc-nav-desc">Profile & sync</span>
                  </div>
                </button>
              </div>
            </aside>

            <main className="cc-content-pane">
              <div className="cc-content-header">
                <div className="cc-content-title-area">
                  <span className="cc-subtitle">SETTINGS</span>
                  <h2 className="cc-title">{
                    activeSettingsSection === 'about' ? 'About' :
                      activeSettingsSection === 'appearance' ? 'Appearance' :
                        activeSettingsSection === 'privacy' ? 'Privacy' :
                          activeSettingsSection === 'widgets' ? 'Widgets' :
                            activeSettingsSection === 'wallpaper' ? 'Wallpaper' :
                              activeSettingsSection === 'downloads' ? 'Downloads' :
                                activeSettingsSection === 'account' ? 'Account' :
                                  'System'
                  }</h2>
                  <p className="cc-desc">
                    {activeSettingsSection === 'about' ? 'Platform vision, privacy, and the tech behind a focused AI workspace.' :
                      activeSettingsSection === 'appearance' ? 'Customize the visual aesthetics, theme, and contrast of your workspace.' :
                        activeSettingsSection === 'privacy' ? 'Manage cookies, trackers, and browsing data.' :
                          activeSettingsSection === 'widgets' ? 'Configure your dashboard and active widgets.' :
                            activeSettingsSection === 'wallpaper' ? 'Pick, preview, and import backgrounds shared across MeeraAI.' :
                              activeSettingsSection === 'downloads' ? 'Configure where files are saved and download behavior.' :
                                activeSettingsSection === 'account' ? 'Sign-in status, sync preferences, and shared credentials.' :
                                  'Manage startup behavior, search engines, and system integrations.'}
                  </p>
                </div>
                <button className="cc-close-btn" onClick={() => setSettingsOpen(false)}>
                  <PiX size={16} />
                </button>
              </div>

              <div className="cc-content-scroll">

                {/* ABOUT PANE */}
                {activeSettingsSection === 'about' && (
                  <div className="cc-glass-card massive">
                    <div className="cc-section-head">
                      <h3>About MeeraAI</h3>
                      <span className="cc-muted">Crafted for focused, premium work</span>
                    </div>
                    <div className="cc-about-body">
                      <p className="cc-body">MeeraAI is a focused AI workspace built for clarity, privacy, and execution. It brings your conversations, models, tools, preferences, and project context into one calm environment designed for serious work.</p>
                      <p className="cc-body">The interface keeps controls accessible without adding noise. Its glass-inspired design creates depth and focus, giving MeeraAI the feel of a polished premium desktop tool while staying lightweight and easy to use.</p>
                      <p className="cc-body">From quick notes to deep projects, MeeraAI helps you move from idea to action with less friction. You stay in control of what syncs, which models run, and how the assistant behaves.</p>
                      <div className="cc-grid-3">
                        <div className="cc-glass-card mini">
                          <h4>Vision</h4>
                          <p>Build a premium AI workspace that feels native on every device.</p>
                        </div>
                        <div className="cc-glass-card mini">
                          <h4>Privacy</h4>
                          <p>Transparent controls for sync, tokens, and data retention.</p>
                        </div>
                        <div className="cc-glass-card mini">
                          <h4>Performance</h4>
                          <p>Optimized interactions, streaming responses, and zero-lag controls.</p>
                        </div>
                        <div className="cc-glass-card mini">
                          <h4>Created by</h4>
                          <p>Vidit Shah - design direction, desktop experience, and MeeraAI implementation.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* APPEARANCE PANE */}
                {activeSettingsSection === 'appearance' && (
                  <div className="cc-glass-card massive">
                    <h3>Theme & Zoom</h3>
                    <div className="settings-row cc-override">
                      <div>
                        <span className="settings-row-label">Theme Mode</span>
                        <span className="settings-row-desc">Choose how Meera Browser looks.</span>
                      </div>
                      <div className="settings-segmented">
                        {(["system", "light", "dark"] as const).map((m) => (
                          <button key={m} className={settings.themeMode === m ? "active" : ""} onClick={() => setSettings((prev) => ({ ...prev, themeMode: m }))}>
                            {m === "system" ? <PiMonitorPlay size={14} /> : m === "light" ? <PiSun size={14} /> : <PiMoon size={14} />} {m.charAt(0).toUpperCase() + m.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="settings-row cc-override">
                      <div>
                        <span className="settings-row-label">Show bookmarks bar</span>
                        <span className="settings-row-desc">Display saved bookmarks under the address bar.</span>
                      </div>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={settings.showBookmarksBar} onChange={(e) => setSettings((prev) => ({ ...prev, showBookmarksBar: e.target.checked }))} />
                        <span />
                      </label>
                    </div>
                    <div className="settings-row cc-override">
                      <div>
                        <span className="settings-row-label">Page zoom</span>
                        <span className="settings-row-desc">Default zoom level for new pages.</span>
                      </div>
                      <div className="settings-zoom-control">
                        <button className="settings-zoom-btn" disabled={settings.fontSize <= 50} onClick={() => setSettings((prev) => ({ ...prev, fontSize: Math.max(50, prev.fontSize - 10) }))}>
                          <PiMagnifyingGlassMinus size={13} />
                        </button>
                        <span className="settings-row-value settings-zoom-value">{settings.fontSize}%</span>
                        <button className="settings-zoom-btn" disabled={settings.fontSize >= 200} onClick={() => setSettings((prev) => ({ ...prev, fontSize: Math.min(200, prev.fontSize + 10) }))}>
                          <PiMagnifyingGlassPlus size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* PRIVACY PANE */}
                {activeSettingsSection === 'privacy' && (
                  <div className="cc-glass-card massive">
                    <h3>Data & Security</h3>
                    {[
                      { key: "blockPopups" as const, label: "Block pop-ups", desc: "Prevent sites from opening pop-up windows automatically." },
                      { key: "blockTrackers" as const, label: "Block third-party trackers", desc: "Stop cross-site tracking scripts from loading." },
                      { key: "doNotTrack" as const, label: "Send \"Do Not Track\" requests", desc: "Ask websites not to track your browsing." },
                      { key: "clearOnExit" as const, label: "Clear cookies on exit", desc: "Delete all cookies when you close the browser." },
                    ].map((row) => (
                      <div className="settings-row cc-override" key={row.key}>
                        <div>
                          <span className="settings-row-label">{row.label}</span>
                          <span className="settings-row-desc">{row.desc}</span>
                        </div>
                        <label className="settings-toggle">
                          <input type="checkbox" checked={settings[row.key]} onChange={(e) => setSettings((prev) => ({ ...prev, [row.key]: e.target.checked }))} />
                          <span />
                        </label>
                      </div>
                    ))}
                    <div className="settings-row cc-override" style={{ borderBottom: 'none', paddingTop: 16 }}>
                      <button className="settings-danger-btn cc-btn" onClick={() => setClearDataModalOpen(true)}>
                        <PiTrash size={14} /> Clear browsing data
                      </button>
                    </div>
                  </div>
                )}

                {/* WIDGETS PANE */}
                {activeSettingsSection === 'widgets' && (
                  <div className="cc-glass-card massive">
                    <h3>Dashboard Management</h3>
                    <div className="settings-row cc-override">
                      <div>
                        <span className="settings-row-label">Show widget dashboard</span>
                        <span className="settings-row-desc">Display the customizable widget panel below the search box on new tabs.</span>
                      </div>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={settings.showWidgetPanel} onChange={(e) => setSettings((prev) => ({ ...prev, showWidgetPanel: e.target.checked }))} />
                        <span />
                      </label>
                    </div>
                    <div className="settings-row cc-override" style={{ borderBottom: 'none', paddingTop: 16 }}>
                      <button className="settings-danger-btn cc-btn" onClick={clearAllWidgets}>
                        <PiTrash size={14} /> Remove all widgets
                      </button>
                      <button className="site-info-link cc-btn" onClick={resetWidgetLayout} style={{ marginLeft: 12 }}>
                        <PiArrowCounterClockwise size={14} /> Reset layout
                      </button>
                    </div>
                  </div>
                )}

                {/* SYSTEM PANE */}
                {activeSettingsSection === 'general' && (
                  <div className="cc-glass-card massive">
                    <h3>Startup & Engine</h3>
                    <div className="settings-row cc-override">
                      <div>
                        <span className="settings-row-label">Search Engine</span>
                        <span className="settings-row-desc">Default engine for omnibox.</span>
                      </div>
                      <select className="site-info-select cc-select" value={settings.searchEngine} onChange={(e) => setSettings((prev) => ({ ...prev, searchEngine: e.target.value as any }))}>
                        {Object.entries(SEARCH_ENGINES).map(([key, val]) => (
                          <option key={key} value={key}>{val.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="settings-row cc-override">
                      <div>
                        <span className="settings-row-label">Continue where you left off</span>
                        <span className="settings-row-desc">Reopen your tabs when Meera Browser starts.</span>
                      </div>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={settings.restoreTabsOnStartup} onChange={(e) => setSettings((prev) => ({ ...prev, restoreTabsOnStartup: e.target.checked }))} />
                        <span />
                      </label>
                    </div>
                    <div className="settings-row cc-override">
                      <div>
                        <span className="settings-row-label">Use hardware acceleration</span>
                        <span className="settings-row-desc">Use your GPU for smoother rendering.</span>
                      </div>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={settings.hardwareAcceleration} onChange={(e) => setSettings((prev) => ({ ...prev, hardwareAcceleration: e.target.checked }))} />
                        <span />
                      </label>
                    </div>
                  </div>
                )}

                {/* WALLPAPER PANE */}
                {activeSettingsSection === 'wallpaper' && (
                  <div className="cc-glass-card massive">
                    <h3>Background Gallery</h3>
                    <p className="cc-muted">Shared across MeeraAI ecosystem</p>
                    <div className="cc-wallpaper-grid">
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => (
                        <button
                          key={num}
                          className={`cc-wallpaper-tile ${settings.ntpWallpaper === `${import.meta.env.BASE_URL}backgrounds/${num}.jpg` ? 'active' : ''}`}
                          onClick={() => {
                            setSettings((prev) => ({ ...prev, ntpWallpaper: `${import.meta.env.BASE_URL}backgrounds/${num}.jpg` }));
                            showToast(`Wallpaper ${num} applied`, <PiCheckCircle size={14} />);
                          }}
                        >
                          <img src={`${import.meta.env.BASE_URL}backgrounds/${num}.jpg`} alt={`Wallpaper ${num}`} loading="lazy" />
                          <span className="cc-wallpaper-label">Image {num}</span>
                        </button>
                      ))}
                    </div>
                    <div className="cc-wallpaper-import">
                      <div>
                        <strong>Import custom wallpaper</strong>
                        <span className="cc-muted">Drop an image or browse your files. Synced with MeeraAI desktop.</span>
                      </div>
                      <button className="cc-btn" onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = 'image/*';
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (file) showToast(`Imported: ${file.name}`, <PiCheckCircle size={14} />);
                        };
                        input.click();
                      }}>Browse</button>
                    </div>
                  </div>
                )}

                {/* DOWNLOADS PANE */}
                {activeSettingsSection === 'downloads' && (
                  <div className="cc-glass-card massive">
                    <h3>File Downloads</h3>
                    <div className="settings-row cc-override">
                      <div>
                        <span className="settings-row-label">Save files to</span>
                        <span className="settings-row-desc">{settings.downloadPath}</span>
                      </div>
                      <button
                        className="cc-btn"
                        onClick={() => {
                          const next = window.prompt("Download folder", settings.downloadPath);
                          if (next && next.trim()) {
                            setSettings((prev) => ({ ...prev, downloadPath: next.trim() }));
                            showToast("Download location updated", <PiFolderOpen size={14} />);
                          }
                        }}
                      >
                        <PiFolderOpen size={14} /> Change
                      </button>
                    </div>
                    <div className="settings-row cc-override">
                      <div>
                        <span className="settings-row-label">Ask where to save each file</span>
                        <span className="settings-row-desc">Choose a destination before every download.</span>
                      </div>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={settings.askWhereToSave} onChange={(e) => setSettings((prev) => ({ ...prev, askWhereToSave: e.target.checked }))} />
                        <span />
                      </label>
                    </div>
                    <div className="settings-row cc-override">
                      <div>
                        <span className="settings-row-label">Autofill passwords</span>
                        <span className="settings-row-desc">Offer to save and fill passwords for sites you sign in to.</span>
                      </div>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={settings.autofillPasswords} onChange={(e) => setSettings((prev) => ({ ...prev, autofillPasswords: e.target.checked }))} />
                        <span />
                      </label>
                    </div>
                    <div className="settings-row cc-override">
                      <div>
                        <span className="settings-row-label">Autofill addresses</span>
                        <span className="settings-row-desc">Autofill forms with saved address information.</span>
                      </div>
                      <label className="settings-toggle">
                        <input type="checkbox" checked={settings.autofillAddresses} onChange={(e) => setSettings((prev) => ({ ...prev, autofillAddresses: e.target.checked }))} />
                        <span />
                      </label>
                    </div>
                    <div className="settings-row cc-override" style={{ borderBottom: 'none', paddingTop: 16 }}>
                      <button className="site-info-link cc-btn" onClick={() => navigateActiveTab("meera://passwords")}>
                        <PiKey size={14} /> Manage saved passwords
                      </button>
                    </div>
                  </div>
                )}

                {/* ACCOUNT PANE */}
                {activeSettingsSection === 'account' && (
                  <div className="cc-glass-card massive">
                    <h3>Meera Ecosystem Account</h3>
                    <p className="cc-muted">Shared credentials between MeeraAI & Meera Browser</p>
                    <div className="cc-account-card">
                      <div className="cc-account-avatar">
                        {user?.photoURL ? (
                          <img src={user.photoURL} alt="Profile" />
                        ) : (
                          <PiUser size={32} />
                        )}
                      </div>
                      <div className="cc-account-details">
                        <h4>{user?.displayName || "Not signed in"}</h4>
                        <span className="cc-muted">{user?.email || "Sign in to sync across MeeraAI ecosystem"}</span>
                      </div>
                      <div className={`cc-account-badge ${user ? 'connected' : ''}`}>
                        {user ? '● Connected' : '○ Disconnected'}
                      </div>
                    </div>
                    <div className="cc-grid-2">
                      <div className="cc-glass-card mini">
                        <h4>🔄 Sync Status</h4>
                        <p>{user ? 'Bookmarks, passwords, and preferences are synced in real time across MeeraAI desktop and Meera Browser.' : 'Sign in to enable cross-platform sync.'}</p>
                      </div>
                      <div className="cc-glass-card mini">
                        <h4>🔐 Credential Sharing</h4>
                        <p>{user ? 'Login credentials are shared securely between MeeraAI and Meera Browser via your Firebase account.' : 'Credentials will sync once signed in.'}</p>
                      </div>
                    </div>
                    <div className="cc-grid-2" style={{ marginTop: 16 }}>
                      <div className="cc-glass-card mini">
                        <h4>🎨 Shared Appearance</h4>
                        <p>Theme mode, wallpapers, and display preferences are synchronized across both apps.</p>
                      </div>
                      <div className="cc-glass-card mini">
                        <h4>📊 Usage Insights</h4>
                        <p>Browse history and AI conversation context stay private to each app unless explicitly shared.</p>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </main>
          </div>
        </div>
      )}

      {/* Centered Modals for History/Bookmarks */}
      {leftSidebarView !== 'none' && leftSidebarView !== 'extensions' && (
        <div className="meera-modal-overlay" onClick={() => setLeftSidebarView('none')}>
          <div className="meera-centered-modal" onClick={(e) => e.stopPropagation()}>
            <div className="meera-modal-header">
              <h2>{leftSidebarView === 'history' ? 'History' : 'Bookmarks'}</h2>
              <button className="meera-modal-close" onClick={() => setLeftSidebarView('none')}>
                <PiX size={20} />
              </button>
            </div>

            {leftSidebarView === 'history' && (
              <div className="meera-modal-content history-list">
                <button className="meera-modal-clear-btn" onClick={() => setHistory([])}>Clear History</button>
                <div className="history-items-container">
                  {filteredHistory.length === 0 ? <p className="empty-state">No history yet.</p> : filteredHistory.map((group, groupIndex) => (
                    <div key={group.title} className="history-group">
                      <h3 className="history-group-title">{group.title}</h3>
                      <div className="history-group-items-timeline">
                        {group.items.map((h, itemIndex) => {
                          let domain = "";
                          try { domain = new URL(h.url).hostname; } catch (e) { }
                          const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : "";
                          return (
                            <div key={h.id} className="history-timeline-item" style={{ animationDelay: `${(groupIndex * 4 + itemIndex) * 0.05}s` }}>
                              <div className="history-timeline-dot" />
                              <div className="history-item-pill">
                                <span className="history-time">{new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                {faviconUrl ? <img src={faviconUrl} className="history-favicon" alt="" /> : <LuGlobe className="history-favicon" size={16} />}
                                <a href="#" className="history-title" onClick={(e) => { e.preventDefault(); openTab(h.url); setLeftSidebarView('none'); }} title={h.title}>{h.title}</a>
                                <button className="remove-item-btn" onClick={() => setHistory(prev => prev.filter(item => item.id !== h.id))}><PiX size={14} /></button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {leftSidebarView === 'bookmarks' && (
              <div className="meera-modal-content bookmarks-list">
                {bookmarks.length === 0 ? <p className="empty-state">No bookmarks yet.</p> : bookmarks.map((b, itemIndex) => (
                  <div key={b.id} className="history-item-pill" style={{ animationDelay: `${itemIndex * 0.05}s`, marginBottom: '8px' }}>
                    {b.favicon ? <img src={b.favicon} className="bookmark-icon history-favicon" alt="" /> : <LuGlobe className="bookmark-icon history-favicon" size={20} />}
                    <div className="bookmark-info" onClick={() => { openTab(b.url); setLeftSidebarView('none'); }} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', cursor: 'pointer', minWidth: 0 }}>
                      <span className="bookmark-title history-title" title={b.title}>{b.title}</span>
                      <span className="bookmark-url" style={{ fontSize: '11px', color: 'var(--browser-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.url}</span>
                    </div>
                    <button className="remove-item-btn" onClick={() => setBookmarks(prev => prev.filter(item => item.id !== b.id))}><PiX size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Custom Global Tooltip */}
      <div
        className={`meera-custom-tooltip ${customTooltip.visible && customTooltip.text ? 'visible' : ''}`}
        style={{ left: customTooltip.x, top: customTooltip.y }}
      >
        {customTooltip.text}
      </div>

    </div>
  );
}
