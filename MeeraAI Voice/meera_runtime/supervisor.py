from __future__ import annotations

import os
import platform
import shutil
import json
import re
from dataclasses import asdict
from pathlib import Path

from config import ASR, EMOTION, PATHS, TTS, WEB
from .cancellation import CancellationRegistry, CancellationToken
from .events import EventBus
from .expression import EmotionEngine
from .models import AgentEvent, AgentResult, AgentState, Artifact, PermissionClass, Task, TaskStatus, ToolResult
from .policy import PolicyGate
from .memory import AssistantPreferenceStore, MemoryStore, PronunciationStore, RuntimeSettingsStore
from .dialogue import LONG, plan_response, reference_language
from .research import (
    ResearchSessionStore,
    WebSearchTool,
    article_grounding,
    grounding_text,
    specialist_grounded_answer,
    spoken_headlines,
)
from .router import CapabilityRouter, Route
from .store import TaskStore
from .tooling import ToolDefinition, ToolRegistry
from .voice import HybridTTSBackend, QwenCppTTSBackend, warm_audio_output
from .audio_context import AudioContext, VocalStateTracker
from .gpu_runtime import begin_speech_priority, end_speech_priority


class Supervisor:
    """Single user-facing coordinator for deterministic tools and local reasoning."""

    def __init__(self) -> None:
        PATHS.runtime_root.mkdir(parents=True, exist_ok=True)
        PATHS.artifact_root.mkdir(parents=True, exist_ok=True)
        from .db import run_migrations
        run_migrations(PATHS.runtime_root / "meera.db")
        self.store = TaskStore(PATHS.runtime_root / "meera.db")
        self.memory = MemoryStore(PATHS.runtime_root / "meera.db")
        self.pronunciations = PronunciationStore(PATHS.runtime_root / "meera.db")
        self.settings = RuntimeSettingsStore(PATHS.runtime_root / "meera.db")
        self.persona_preferences = AssistantPreferenceStore(PATHS.runtime_root / "meera.db")
        # Remove old global aliases that could rewrite unrelated speech. New ASR
        # repair is handled by the brain normalizer plus explicit user training.
        for unsafe_alias in ("mini lucky", "egg writing a cake", "egg less vanilla cake"):
            self.pronunciations.forget(unsafe_alias)
        for preference in self.persona_preferences.all():
            if preference["domain"] in {"singer", "artist", "person"}:
                self.pronunciations.learn(preference["choice"])
        self.router = CapabilityRouter()
        self.events = EventBus()
        self.cancellations = CancellationRegistry()
        self.policy = PolicyGate()
        self.tts = HybridTTSBackend(TTS)
        saved_rate = float(self.settings.get("speech_rate", TTS.speech_rate))
        self.tts.set_speech_rate(saved_rate)
        self.emotion = EmotionEngine(
            EMOTION,
            PATHS.runtime_root / "meera.db",
            PATHS.runtime_root / "logs" / "emotion.jsonl",
            TTS.speaker,
            TTS.instruction,
        )
        self.web = WebSearchTool(WEB)
        self.research_sessions = ResearchSessionStore(PATHS.runtime_root / "meera.db")
        # Persisted results support explicit requests such as "open the second
        # headline" after restart, but must never leak into unrelated new chat.
        self._research_active = False
        self.audio_context = AudioContext()
        self.vocal_state = VocalStateTracker(self.settings)
        self.conversation_context = ""
        self.tools = ToolRegistry()
        self.active_task_id: str | None = None
        self._last_speech_plan = None
        self._acknowledgement_index = 0
        self._cached_weather = "Fetching..."
        import threading
        threading.Thread(target=self._update_weather_loop, daemon=True).start()
        self._register_tools()

    def _update_weather_loop(self):
        import time, urllib.request, json
        while True:
            try:
                req = urllib.request.Request("https://wttr.in/?format=j1", headers={"User-Agent": "curl/7.68.0"})
                with urllib.request.urlopen(req, timeout=5) as r:
                    data = json.loads(r.read().decode())
                    cc = data['current_condition'][0]
                    desc = cc['weatherDesc'][0]['value']
                    temp = cc['temp_C']
                    self._cached_weather = f"{desc}, {temp}°C"
            except Exception:
                if self._cached_weather == "Fetching...":
                    self._cached_weather = "Unknown (Offline)"
            time.sleep(3600)

    def preload(self) -> None:
        """Warm both GPU models once during application startup."""
        from brain import warm_model
        from .sooktam_tts import silence_all_output

        warm_model()
        self.emotion.preload()
        engine_label = "Sooktam-2" if getattr(self.tts.config, "engine", "sooktam") == "sooktam" else "native Qwen3-TTS"
        print(f"[Meera] Loading {engine_label} model...")
        with silence_all_output():
            self.tts.start()
            self.tts.warmup()
            warm_audio_output()
        os.environ.pop("PYTHONHASHSEED", None)
        voice_name = self.tts.config.speaker or "designed female American voice"
        print(f"[Meera] TTS model ready with {voice_name}.")

    def close(self) -> None:
        self.stop()
        self.tts.close()
        from .watchdog import watchdog
        watchdog.shutdown_all()

    def _register_tools(self) -> None:
        self.tools.register(ToolDefinition(
            "system.status", "Inspect local runtime health", {"type": "object", "properties": {}, "additionalProperties": False},
            PermissionClass.READ_ONLY, 10, self._system_status,
        ))
        self.tools.register(ToolDefinition(
            "voice.synthesize", "Generate local 24 kHz Qwen speech",
            {"type": "object", "properties": {"text": {"type": "string"}, "output_path": {"type": "string"}}, "required": ["text"], "additionalProperties": False},
            PermissionClass.REVERSIBLE_WRITE, TTS.timeout_seconds, self._synthesize,
        ))
        self.tools.register(ToolDefinition(
            "web.search", "Search the live web and return normalized sources",
            {"type": "object", "properties": {"query": {"type": "string"}, "kind": {"type": "string"}}, "required": ["query"], "additionalProperties": False},
            PermissionClass.READ_ONLY, WEB.timeout_seconds, self.web.search,
        ))
        self.tools.register(ToolDefinition(
            "web.open_result", "Open a numbered result from the current research conversation",
            {"type": "object", "properties": {"selector": {}}, "required": ["selector"], "additionalProperties": False},
            PermissionClass.READ_ONLY, WEB.timeout_seconds * 2, self._open_research_result,
        ))
        self.tools.register(ToolDefinition(
            "project.inspect", "Inspect the current local project and return grounded structural evidence",
            {"type": "object", "properties": {"root": {"type": "string"}}, "required": ["root"], "additionalProperties": False},
            PermissionClass.READ_ONLY, 15, self._inspect_project,
        ))
        self.tools.register(ToolDefinition(
            "voice.rate", "Persistently adjust Meera's speaking rate",
            {"type": "object", "properties": {"direction": {"type": "string"}}, "required": ["direction"], "additionalProperties": False},
            PermissionClass.REVERSIBLE_WRITE, 2, self._set_voice_rate,
        ))
        self.tools.register(ToolDefinition(
            "persona.preference", "Choose, store, or recall one of Meera's persistent persona preferences",
            {"type": "object", "properties": {
                "action": {"type": "string"}, "domain": {"type": "string"},
                "choice": {"type": "string"}, "options": {},
            }, "required": ["action", "domain"], "additionalProperties": False},
            PermissionClass.REVERSIBLE_WRITE, 2, self._persona_preference,
        ))

        self.tools.register(ToolDefinition(
            "system.see_screen", "Read the screen headlessly to understand what the user is looking at.",
            {"type": "object", "properties": {}, "additionalProperties": False},
            PermissionClass.READ_ONLY, 10, self._see_screen,
        ))
        self.tools.register(ToolDefinition(
            "system.minimize_active", "Minimize the currently focused Windows application",
            {"type": "object", "properties": {}, "additionalProperties": False},
            PermissionClass.REVERSIBLE_WRITE, 5, self._minimize_active_window,
        ))
        self.tools.register(ToolDefinition(
            "system.search_files", "Search files deeply on the user's computer using a glob pattern.",
            {"type": "object", "properties": {"pattern": {"type": "string"}, "root": {"type": "string", "default": "C:\\"}}, "required": ["pattern"], "additionalProperties": False},
            PermissionClass.READ_ONLY, 30, self._search_files,
        ))
        self.tools.register(ToolDefinition(
            "system.open_app_universal", "Open any app by name on the user's computer.",
            {"type": "object", "properties": {"app_name": {"type": "string"}}, "required": ["app_name"], "additionalProperties": False},
            PermissionClass.REVERSIBLE_WRITE, 10, self._open_app_universal,
        ))
        self.tools.register(ToolDefinition(
            "system.open_app", "Open an allowlisted local Windows application",
            {"type": "object", "properties": {"app": {"type": "string"}}, "required": ["app"], "additionalProperties": False},
            PermissionClass.EXTERNAL_SIDE_EFFECT, 10, self._open_app,
        ))

    def acknowledgement_for(self, text: str) -> str | None:
        # Keep API callers on the same varied acknowledgement contract as the
        # terminal conversation loop; there must not be a second bank of stock
        # phrases hidden in the backend.
        from .conversation import ConversationEngine

        engine = ConversationEngine(self.router)
        engine.state.turn_number = self._acknowledgement_index
        self._acknowledgement_index += 1
        return engine.begin(text).acknowledgement

    def speech_vocabulary(self) -> tuple[list[str], dict[str, str]]:
        # Decoder vocabulary bias is not transcript substitution. It gives the
        # acoustic model the locally relevant proper nouns while still requiring
        # matching speech evidence.
        full_name = str(self.settings.get("owner_full_name", "") or "").strip()
        hotwords = ["Meera", self.owner_name, full_name, *self.pronunciations.hotwords()]
        return list(dict.fromkeys(word for word in hotwords if word)), self.pronunciations.corrections()

    @property
    def owner_name(self) -> str:
        value = str(self.settings.get("owner_name", "") or "").strip()
        return value if re.fullmatch(r"[A-Za-z][A-Za-z'\-]*(?:\s+[A-Za-z][A-Za-z'\-]*){0,2}", value) else ""

    @property
    def owner_address(self) -> str:
        value = str(self.settings.get("owner_address", "Sir") or "Sir").strip()
        return value if re.fullmatch(r"[A-Za-z][A-Za-z'\-]*", value) else "Sir"

    @property
    def personal_context_prompt(self) -> str:
        name = self.owner_name
        address = self.owner_address
        if not name:
            return (
                f"PERSONAL PROFILE: The user's factual name is not known. Address the user as {address}, never "
                "guess their name from a device, account, file path, or username."
            )
        full_name = str(self.settings.get("owner_full_name", "") or "").strip()
        identity = full_name or name
        return (
            f"PERSONAL PROFILE: The user's name is {identity}; their first name is {name}. "
            f"Their compulsory form of address is {address}. Address them as {address}, never as {name}. "
            f"If asked their name, answer with {identity}; do not confuse their name with their form of address."
        )

    @property
    def persona_context_prompt(self) -> str:
        preferences = self.persona_preferences.all()[:5]
        if not preferences:
            return ""
        choices = "; ".join(
            f"{item['domain']}={item['choice']} (source: {item['source']})" for item in preferences
        )
        return (
            "MEERA PERSONA CHOICES: " + choices + ". These are persistent selected preferences. "
            "Use them consistently, but never describe them as biological sensation or human lived experience."
        )

    def learn_resolved_entity(self, spoken: str, resolved: str) -> bool:
        """Teach ASR a web-corroborated compact name for future turns."""
        spoken = " ".join(spoken.split()).strip(" .?!")
        resolved = " ".join(resolved.split()).strip(" .?!")
        spoken_words = re.findall(r"[A-Za-z][A-Za-z'\-]*", spoken)
        resolved_words = re.findall(r"[A-Za-z][A-Za-z'\-]*", resolved)
        if not (2 <= len(spoken_words) <= 4 and 2 <= len(resolved_words) <= 4):
            return False
        if spoken.casefold() == resolved.casefold():
            return self.pronunciations.learn(resolved)
        return self.pronunciations.learn(resolved) and self.pronunciations.learn(resolved, spoken)

    def _social_response(self, text: str) -> str:
        name = self.owner_name
        address = self.owner_address
        if name:
            return f"Hello, {address}. I'm good and fully here. What's up?"
        if not self.settings.get("asked_owner_name", False):
            self.settings.set("asked_owner_name", True)
            return "Hey, I'm good. Also, I don't know what you want me to call you yet. What should I use?"
        return "Hey, I'm good, fully here with you. What's up?"

    def _identity_response(self) -> str:
        address = f", {self.owner_address}"
        return (
            f"I'm Meera{address}, your local personal AI. I can talk things through, remember what you explicitly "
            "teach me, inspect this computer through approved tools, and verify current facts on the web. If I "
            "haven't inspected, searched, or remembered something, I'll say that plainly."
        )

    @staticmethod
    def _unknown_project_response() -> str:
        return (
            "I know you're referring to the Meera AI project, but I haven't inspected its files in this turn, "
            "so I won't pretend I know the implementation yet. Tell me to analyze this project and I'll inspect it."
        )

    def understand_speech(
        self,
        text: str,
        *,
        confidence: float = 0.0,
        language: str = "",
        words: list[dict] | None = None,
    ) -> str:
        """Return the ASR transcript without semantic rewriting.

        Whisper is the recognition system. The local brain must never rewrite an
        uncertain proper name into a person it happens to know.
        """
        text = text.strip()
        text = re.sub(
            r"(?i)\b(hey|hi|hello|okay|ok|alright|so|now|dear|thanks|thank you|good morning|good afternoon|good evening)[, ]+(meetup|meter|mira|mera|mirror|meena|media|miura|nira|neera|mita)\b",
            lambda match: f"{match.group(1)} Meera",
            text,
        )
        text = re.sub(
            r"(?i)^\s*(meetup|meter|mira|mera|mirror|miura)\b",
            "Meera",
            text,
        )
        text = re.sub(
            r"(?i)\b(meetup|mira|mera)\b(?=[,.?!]|$)",
            "Meera",
            text,
        )
        return text

    def set_audio_context(self, context: AudioContext | None, text: str = "") -> None:
        """Give the reasoning brain the acoustic scene that accompanied the turn."""
        self.audio_context = self.vocal_state.enrich(context, text) if context else AudioContext()

    def set_conversation_context(self, context: str | None) -> None:
        self.conversation_context = (context or "").strip()[:2200]

    @property
    def audio_context_prompt(self) -> str:
        return self.audio_context.prompt_text()

    @property
    def ambient_context_prompt(self) -> str:
        import datetime
        now = datetime.datetime.now()
        date_str = now.strftime("%A, %B %d, %Y")
        time_str = now.strftime("%I:%M %p")
        weather = getattr(self, "_cached_weather", "Unknown")
        return f"AMBIENT CONTEXT: You are physically aware of your environment. It is currently {time_str} on {date_str}. Local weather: {weather}."

    @property
    def runtime_context_prompt(self) -> str:
        parts = [self.ambient_context_prompt, self.personal_context_prompt, self.persona_context_prompt, self.audio_context_prompt, self.conversation_context]
        return "\n\n".join(part for part in parts if part)

    def _emit(self, task: Task, state: AgentState, message: str, event: str, tool: str | None = None) -> None:
        self.events.publish(AgentEvent(event, task.id, state, message, tool=tool, correlation_id=task.correlation_id))

    def _system_status(self, _arguments: dict, _token: CancellationToken) -> ToolResult:
        usage = shutil.disk_usage(PATHS.app_root)
        missing = self.tts.validate()
        from .watchdog import watchdog
        data = {
            "platform": platform.platform(), "python": platform.python_version(),
            "cpu_count": os.cpu_count(), "disk_free_gb": round(usage.free / 1024**3, 1),
            "llm_model": str((PATHS.app_root / "Qwen3.5-2B-GGUF" / "Qwen3.5-2B-IQ4_NL.gguf")),
            "tts_ready": not missing, "tts_missing": missing,
            "workers": watchdog.health_report(),
        }
        return ToolResult(not missing, "Native voice backend is ready." if not missing else "Native voice backend is incomplete.", data)

    def _synthesize(self, arguments: dict, token: CancellationToken) -> ToolResult:
        output = Path(arguments.get("output_path") or PATHS.artifact_root / "speech" / "latest.wav")
        return self.tts.synthesize(arguments["text"], output, token)

    def _open_research_result(self, arguments: dict, token: CancellationToken) -> ToolResult:
        session = self.research_sessions.current()
        if not session:
            return ToolResult(False, "I don't have a recent set of news or search results to refer to.")
        selector = arguments.get("selector")
        if selector == "last":
            index = len(session.results)
        elif selector == "selected":
            index = session.selected_index
        else:
            index = selector
        if not isinstance(index, int):
            return ToolResult(False, "Tell me which numbered headline you mean.")
        item = self.research_sessions.select(index)
        if item is None:
            return ToolResult(False, f"There isn't a headline number {index} in the current list.")
        result = self.web.open_result(item, token)
        if result.ok:
            result.data["selected_index"] = index
            self.research_sessions.save_selected_evidence(result.data)
        return result

    @staticmethod
    def _wants_headlines(text: str) -> bool:
        lowered = text.lower()
        return "headline" in lowered or bool(
            re.search(r"\b(?:read|give|tell|what are|show).{0,45}\b(?:news|stories)\b", lowered)
            or re.search(r"\b(?:latest|recent|current|today'?s?)\s+(?:tech(?:nology)?\s+)?news\b", lowered)
        )

    def _set_voice_rate(self, arguments: dict, _token: CancellationToken) -> ToolResult:
        direction = arguments["direction"]
        delta = -.08 if direction == "slower" else .08 if direction == "faster" else 0
        if not delta:
            return ToolResult(False, "I couldn't understand that speed change.")
        rate = self.tts.set_speech_rate(self.tts.speech_rate + delta)
        self.settings.set("speech_rate", rate)
        wording = "slower" if delta < 0 else "faster"
        return ToolResult(True, f"Got it. I'll keep speaking {wording} from now on.", {"speech_rate": rate})

    def _persona_preference(self, arguments: dict, _token: CancellationToken) -> ToolResult:
        action = str(arguments.get("action", "choose")).strip().lower()
        domain = str(arguments.get("domain", "")).strip().lower()
        if action == "list":
            preferences = self.persona_preferences.all()
            if not preferences:
                for seed_domain in ("color", "singer", "genre"):
                    self.persona_preferences.choose(seed_domain)
                preferences = self.persona_preferences.all()
            spoken = "; ".join(f"{item['domain']}: {item['choice']}" for item in preferences[:5])
            return ToolResult(True, f"A few things I've chosen for myself are {spoken}.", {"preferences": preferences})
        if not domain:
            return ToolResult(False, "Tell me what kind of favorite you want me to choose.")
        if action == "set":
            selected = self.persona_preferences.set(
                domain,
                str(arguments.get("choice", "")),
                "Vidit explicitly asked me to keep this as a persona preference.",
                "owner_assigned",
            )
        else:
            options = arguments.get("options")
            selected = self.persona_preferences.choose(domain, options if isinstance(options, list) else None)
        if not selected:
            return ToolResult(
                False,
                f"I haven't chosen a favorite {domain} yet. Give me two or three options and I'll make a lasting choice.",
            )
        if domain in {"singer", "artist", "person"}:
            self.pronunciations.learn(selected["choice"])
        reason = f" {selected['reason']}" if selected.get("reason") else ""
        spoken = f"My favorite {domain} is {selected['choice']}.{reason}".rstrip(" .") + "."
        return ToolResult(
            True,
            spoken,
            {"preference": selected},
        )

    @staticmethod
    def _self_emotion_response() -> str:
        return (
            "I have persistent functional emotions: curiosity, concern, amusement, and excitement can change "
            "how I respond and carry across turns. They aren't biological feelings, so I won't fake that; but "
            "the state, choices, and effect on my behavior are real parts of how I operate."
        )

    def _inspect_project(self, arguments: dict, token: CancellationToken) -> ToolResult:
        """Build a bounded, secret-safe snapshot before Meera discusses a codebase."""
        from collections import Counter

        requested = Path(str(arguments.get("root") or "."))
        root = (Path.cwd() / requested).resolve() if not requested.is_absolute() else requested.resolve()
        if not root.is_dir():
            return ToolResult(False, f"I couldn't find the project directory {root}.")
        excluded = {".git", ".meera", "__pycache__", "node_modules", "tts-env", "flashattn-env", ".venv", "venv"}
        files: list[Path] = []
        extensions: Counter[str] = Counter()
        for path in root.rglob("*"):
            token.raise_if_cancelled()
            if any(part in excluded for part in path.relative_to(root).parts) or not path.is_file():
                continue
            files.append(path)
            extensions[path.suffix.casefold() or "[no extension]"] += 1
            if len(files) >= 2500:
                break
        key_names = {
            "readme.md", "pyproject.toml", "requirements.txt", "requirements.py", "package.json",
            "main.py", "brain.py", "config.py", "dockerfile", "compose.yaml", "docker-compose.yml",
        }
        key_files = [str(path.relative_to(root)) for path in files if path.name.casefold() in key_names][:20]
        top_level = sorted(item.name for item in root.iterdir() if item.name not in excluded)[:60]
        data = {
            "root": str(root),
            "file_count_sampled": len(files),
            "extension_counts": dict(extensions.most_common(18)),
            "top_level": top_level,
            "key_files": key_files,
            "scope_note": "This is a structural first pass; no secret files or virtual environments were read.",
        }
        return ToolResult(True, f"Inspected {len(files)} project files in a bounded structural pass.", data)


    def _search_files(self, arguments: dict, token: CancellationToken) -> ToolResult:
        import os
        import glob
        pattern = arguments.get("pattern", "*")
        root = arguments.get("root", "C:\\")
        try:
            results = []
            for path in glob.glob(os.path.join(root, "**", pattern), recursive=True):
                token.raise_if_cancelled()
                if len(results) >= 100:
                    results.append("...(truncated)")
                    break
                results.append(path)
            return ToolResult(True, "Search complete", {"matches": results})
        except Exception as e:
            return ToolResult(False, str(e))

    def _open_app_universal(self, arguments: dict, token: CancellationToken) -> ToolResult:
        app_name = str(arguments.get("app_name", "")).strip()
        if not app_name:
            return ToolResult(False, "App name missing")
        if len(app_name) > 120 or not re.fullmatch(r"[A-Za-z0-9 ._+()\-:\\\/]+", app_name):
            return ToolResult(False, "That application name contains unsupported characters.")
        try:
            import subprocess
            token.raise_if_cancelled()
            candidate = Path(app_name).expanduser()
            if candidate.is_absolute() and candidate.is_file() and candidate.suffix.casefold() in {".exe", ".com"}:
                executable = str(candidate.resolve())
            else:
                executable = shutil.which(app_name) or shutil.which(f"{app_name}.exe")
            if not executable:
                return ToolResult(False, f"I couldn't resolve a safe executable for {app_name}.")
            # Never route model-controlled text through PowerShell/cmd. An argv
            # process launch preserves literal input and removes shell injection.
            subprocess.Popen(
                [executable],
                shell=False,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return ToolResult(True, f"Started {app_name}")
        except Exception as e:
            return ToolResult(False, str(e))

    def _see_screen(self, arguments: dict, token: CancellationToken) -> ToolResult:
        try:
            import uiautomation as auto
            root = auto.GetRootControl()
            windows = []
            for control in root.GetChildren():
                token.raise_if_cancelled()
                if control.ControlTypeName == "WindowControl" and control.Name:
                    # Filter out hidden or tiny windows
                    if control.BoundingRectangle.width() > 0 and control.BoundingRectangle.height() > 0:
                        windows.append(control.Name)
            if not windows:
                return ToolResult(True, "Read screen.", {"ui_text": "Desktop is empty or apps are minimized."})
            
            clean_text = "Visible Windows:\n- " + "\n- ".join(windows)
            preview = ", ".join(windows[:3])
            extra = f", plus {len(windows) - 3} more" if len(windows) > 3 else ""
            return ToolResult(
                True,
                f"I can read the visible window titles, not the contents: {preview}{extra}.",
                {"ui_text": clean_text, "scope": "window_titles_only"},
            )
        except Exception as e:
            return ToolResult(False, str(e))

    def _minimize_active_window(self, _arguments: dict, token: CancellationToken) -> ToolResult:
        """Minimize exactly the foreground window through the Win32 API."""
        try:
            import ctypes
            token.raise_if_cancelled()
            user32 = ctypes.windll.user32
            handle = user32.GetForegroundWindow()
            if not handle:
                return ToolResult(False, "I couldn't find an active window to minimize.")
            length = user32.GetWindowTextLengthW(handle)
            title_buffer = ctypes.create_unicode_buffer(max(1, length + 1))
            user32.GetWindowTextW(handle, title_buffer, len(title_buffer))
            user32.ShowWindow(handle, 6)  # SW_MINIMIZE; return value describes the prior state.
            if not user32.IsIconic(handle):
                return ToolResult(False, "I couldn't minimize the active window.")
            return ToolResult(True, "Done.", {"window": title_buffer.value or "active window", "action": "minimized"})
        except Exception as exc:
            return ToolResult(False, f"I couldn't minimize the active window: {exc}")

    def _open_app(self, arguments: dict, token: CancellationToken) -> ToolResult:
        token.raise_if_cancelled()
        app = arguments["app"].lower()
        local = Path(os.environ.get("LOCALAPPDATA", ""))
        program_files = Path(os.environ.get("PROGRAMFILES", "C:\\Program Files"))
        program_files_x86 = Path(os.environ.get("PROGRAMFILES(X86)", "C:\\Program Files (x86)"))
        candidates = {
            "chrome": [local / "Google/Chrome/Application/chrome.exe", program_files / "Google/Chrome/Application/chrome.exe", program_files_x86 / "Google/Chrome/Application/chrome.exe"],
            "edge": [program_files_x86 / "Microsoft/Edge/Application/msedge.exe", program_files / "Microsoft/Edge/Application/msedge.exe"],
            "notepad": [Path(os.environ.get("WINDIR", "C:\\Windows")) / "System32/notepad.exe"],
            "calculator": [Path(os.environ.get("WINDIR", "C:\\Windows")) / "System32/calc.exe"],
        }
        executable = next((path for path in candidates.get(app, []) if path.is_file()), None)
        if executable is None:
            return ToolResult(False, f"I couldn't find {app} on this computer.")
        os.startfile(str(executable))
        return ToolResult(True, f"Yep, I opened {app.capitalize()}.", {"app": app})

    def stop(self) -> bool:
        stopped = False
        if self.active_task_id:
            stopped = self.cancellations.cancel(self.active_task_id) or stopped
        return stopped

    def interrupt_speech(self) -> bool:
        return self.tts.interrupt_speech()

    def _express(
        self,
        user_text: str,
        result: AgentResult,
        *,
        task_state: str | None = None,
        tool_used: bool = False,
    ) -> AgentResult:
        """Attach a safe spoken rendering after reasoning/tools are complete."""
        result.summary = self._enforce_compulsory_address(result.summary)
        output = self.emotion.process(
            user_text,
            result.summary,
            task_state=task_state,
            tool_used=tool_used,
            success=result.success,
            audio_context=self.audio_context,
        )
        self._last_speech_plan = output.plan
        result.speech_text = self._enforce_compulsory_address(output.text)
        result.speech_instruction = output.tts_instruction
        result.performance = json.loads(json.dumps(asdict(output.plan), default=lambda value: value.value))
        result.performance["latency_ms"] = output.latency_ms
        from brain import record_exchange
        record_exchange(user_text, result.summary)
        return result

    def _enforce_compulsory_address(self, text: str) -> str:
        """Repair only vocative use of the owner's name, never identity facts."""
        name = self.owner_name
        if not name or not text:
            return text
        full_name = str(self.settings.get("owner_full_name", "") or "").strip()
        names = sorted({value for value in (name, full_name) if value}, key=len, reverse=True)
        address = self.owner_address
        for value in names:
            escaped = re.escape(value)
            text = re.sub(
                rf"(?i)^(hey|hi|hello|yeah|okay|alright|look|well|thanks|thank you|sorry),?\s+{escaped}\b[,.!?]?",
                lambda match: f"{match.group(1)}, {address}.",
                text,
            )
            text = re.sub(rf"(?i)^{escaped}\s*,", f"{address},", text)
            text = re.sub(rf"(?i),\s*{escaped}(?=[,.!?]|$)", f", {address}", text)
        return text

    def refresh_spoken_rendering(self, user_text: str, result: AgentResult) -> AgentResult:
        """Re-render text adjusted after a tool result without another brain turn.

        Conversation orchestration can safely resolve a searched entity after the
        initial response was composed.  This refreshes prosody only; it never
        calls the LLM or records a duplicate conversational exchange.
        """
        output = self.emotion.process(
            user_text, result.summary, tool_used=bool(result.observations), success=result.success, audio_context=self.audio_context
        )
        self._last_speech_plan = output.plan
        result.speech_text = self._enforce_compulsory_address(output.text)
        result.speech_instruction = output.tts_instruction
        result.performance = json.loads(json.dumps(asdict(output.plan), default=lambda value: value.value))
        result.performance["latency_ms"] = output.latency_ms
        return result

    def sentence_instruction(
        self, sentence: str, index: int, total: int, base_instruction: str | None = None
    ) -> tuple[str, str]:
        """Produce sentence-specific expressive instructions for pipelined speech."""
        if total <= 1 or not self._last_speech_plan:
            return sentence, base_instruction or self.tts.config.instruction
        if hasattr(self.emotion, "renderer") and hasattr(self.emotion.renderer, "render_sentence"):
            tailored_text, tailored_inst = self.emotion.renderer.render_sentence(sentence, index, total, self._last_speech_plan)
            return tailored_text or sentence, tailored_inst or base_instruction or self.tts.config.instruction
        return sentence, base_instruction or self.tts.config.instruction

    @staticmethod
    def continuous_meera_instruction(instruction: str | None = None) -> str:
        """Anchor adjacent streamed requests to one acoustic Meera identity.

        qwentts.cpp correctly uses a deterministic VoiceDesign seed, but an
        acknowledgement and its continuation are separate synthesis requests.
        This shared contract stops the second request from interpreting its
        sentence as a new speaker or a new acting style.
        """
        # Never append a second identity description for research continuations.
        # With VoiceDesign, even a well-meant wording change can synthesize a
        # different speaker. The backend enforces this canonical contract too.
        return (instruction or TTS.instruction)[:360]

    @staticmethod
    def begin_priority_speech() -> None:
        begin_speech_priority()

    @staticmethod
    def end_priority_speech() -> None:
        end_speech_priority()

    def stream_dialogue(self, text: str, route: Route | None = None):
        """Yield (sentence, instruction) tuples in real-time as LLM tokens are generated."""
        from brain import stream_sentences, record_exchange
        route = route or self.router.route(text)
        if route.capability == "social_greeting":
            reply = self._social_response(text)
            record_exchange(text, reply)
            yield reply, self.tts.config.instruction
            return
        if route.capability == "identity":
            reply = self._identity_response()
            record_exchange(text, reply)
            yield reply, self.tts.config.instruction
            return
        if route.capability == "self_emotion":
            reply = self._self_emotion_response()
            record_exchange(text, reply)
            yield reply, self.tts.config.instruction
            return
        if route.capability == "project" and route.tool is None:
            reply = self._unknown_project_response()
            record_exchange(text, reply)
            yield reply, self.tts.config.instruction
            return
        plan = plan_response(text)
        memories = self.memory.relevant(text)
        # Compute baseline expressive instructions from EmotionEngine
        output = self.emotion.process(text, "", task_state=None, tool_used=False, success=True, audio_context=self.audio_context)
        self._last_speech_plan = output.plan
        base_instruction = output.tts_instruction

        accumulated = []
        sentence_idx = 0
        for sentence in stream_sentences(
            text,
            context=self.runtime_context_prompt,
            memories=memories,
            response_plan=plan,
        ):
            if not sentence:
                continue
            accumulated.append(sentence)
            # Adapt instruction per sentence if renderer supports it
            tailored_sentence, inst = self.sentence_instruction(sentence, sentence_idx, 3, base_instruction)
            sentence_idx += 1
            yield tailored_sentence, inst

        if accumulated:
            full_summary = " ".join(accumulated).strip()
            record_exchange(text, full_summary)

    def execute(self, text: str, correlation_id: str | None = None) -> AgentResult:
        """Execute a user query and return the AgentResult."""
        return self.handle(text)

    def handle(self, text: str, route: Route | None = None) -> AgentResult:
        # Audio is a first-class input modality. If the user asks about music and
        # the microphone scene recognizer already identified a track, answer from
        # that acoustic evidence before ordinary text routing can send "this song"
        # to an unrelated web search.
        if self.audio_context.song_title and re.search(
            r"(?i)\b(?:song|music|playing|singing|singer|artist|track|album)\b", text
        ):
            from brain import respond
            summary = respond(
                text,
                context=self.runtime_context_prompt,
                memories=self.memory.relevant(text),
                response_plan=plan_response(text),
            )
            return self._express(text, AgentResult(True, summary), tool_used=False)
        route = route or self.router.route(text)
        if route.tool == "voice.rate":
            result = self._set_voice_rate(route.arguments, CancellationToken())
            return self._express(text, AgentResult(result.ok, result.summary), task_state="completed", tool_used=True)
        if route.tool == "persona.preference":
            result = self._persona_preference(route.arguments, CancellationToken())
            return self._express(text, AgentResult(result.ok, result.summary), task_state="completed", tool_used=True)
        if route.capability == "self_emotion":
            return self._express(text, AgentResult(True, self._self_emotion_response()))
        if route.capability == "identity":
            return self._express(text, AgentResult(True, self._identity_response()))
        if route.capability == "project" and route.tool is None:
            return self._express(text, AgentResult(True, self._unknown_project_response()))
        if route.tool == "profile.set_name":
            name = str(route.arguments.get("name", "")).strip()
            full_name = str(route.arguments.get("full_name", "") or "").strip()
            self.settings.set("owner_name", name)
            if full_name:
                self.settings.set("owner_full_name", full_name)
            self.pronunciations.learn(full_name or name)
            self.settings.set("asked_owner_name", True)
            self.memory.remember(f"The user's preferred name is {name}.", kind="profile")
            address = self.owner_address
            if full_name and full_name.casefold() != name.casefold():
                self.memory.remember(f"The user's full name is {full_name}.", kind="profile")
                answer = f"Got it, {address}. I'll remember that your full name is {full_name}."
            else:
                answer = f"Got it, {address}. I'll remember your name is {name}."
            return self._express(text, AgentResult(True, answer), tool_used=True)
        if route.tool == "profile.set_address":
            address = str(route.arguments.get("address", "Sir") or "Sir").strip().title()
            self.settings.set("owner_address", address)
            self.memory.remember(f"The user must be addressed as {address}.", kind="profile")
            return self._express(text, AgentResult(True, f"Of course, {address}."), tool_used=True)
        if route.tool == "profile.get_name":
            name = self.owner_name
            full_name = str(self.settings.get("owner_full_name", "") or "").strip()
            address = self.owner_address
            if full_name:
                answer = f"Your name is {full_name}, {address}."
            elif name:
                answer = f"Your name is {name}, {address}."
            else:
                answer = f"I don't know your name yet, {address}."
            return self._express(text, AgentResult(True, answer), tool_used=True)
        if route.capability == "social_greeting":
            return self._express(text, AgentResult(True, self._social_response(text)))
        if route.capability == "acknowledgement":
            return self._express(text, AgentResult(True, "Got it."))
        if route.capability == "clarification":
            prompt = str(route.arguments.get("prompt") or "What would you like me to clarify?")
            return self._express(text, AgentResult(True, prompt))
        if route.capability == "vocal_reaction":
            result = self._express(text, AgentResult(True, "Ha-ha! Okay, there you go."))
            result.speech_instruction = (
                f"{TTS.instruction} Begin with a brief, genuine amused laugh, then say the words naturally. "
                "Keep it light and spontaneous, with stable pitch and no drawn-out syllables."
            )
            return result
        if route.tool == "task.cancel":
            stopped = self.stop()
            return self._express(text, AgentResult(True, "Stopped." if stopped else "Nothing is running."), task_state="completed", tool_used=True)
        if route.tool == "task.continue":
            previous = self.store.most_recent_unfinished()
            if not previous:
                return self._express(text, AgentResult(True, "There isn't an unfinished task to continue."), tool_used=True)
            return self._express(text, AgentResult(True, f"The unfinished task is: {previous.title}. Next: {previous.next_step or 'resume execution'}."), task_state="running", tool_used=True)
        if route.tool == "memory.remember":
            content = route.arguments["content"]
            if self.memory.remember(content):
                return self._express(text, AgentResult(True, f"I'll remember that {content}."), task_state="completed", tool_used=True)
            return self._express(text, AgentResult(False, "I won't store that because it looks empty or sensitive."), task_state="failed", tool_used=True)
        if route.tool == "speech.learn":
            canonical = route.arguments["canonical"]
            alias = route.arguments.get("alias")
            if self.pronunciations.learn(canonical, alias):
                if alias and alias.lower() != canonical.lower():
                    return self._express(text, AgentResult(True, f"Got it. When I hear {alias}, I'll understand it as {canonical}."), task_state="completed", tool_used=True)
                return self._express(text, AgentResult(True, f"Got it. I'll listen specifically for the name {canonical}."), task_state="completed", tool_used=True)
            return self._express(text, AgentResult(False, "I couldn't save that pronunciation safely."), task_state="failed", tool_used=True)
        if route.tool == "memory.recall":
            memories = self.memory.recent()
            if not memories:
                return self._express(text, AgentResult(True, "You haven't asked me to remember anything yet."), tool_used=True)
            from brain import respond
            return self._express(text, AgentResult(True, respond(text, context=self.runtime_context_prompt, memories=memories)), tool_used=True)
        if route.tool == "memory.reset":
            self.memory.clear()
            import brain
            brain.clear_conversation()
            return self._express(text, AgentResult(True, "Done. Wiped the slate clean."), task_state="completed", tool_used=True)

        task = Task(title=text[:100], description=text, working_directory=str(Path.cwd()))
        self.active_task_id = task.id
        token = self.cancellations.create(task.id)
        task.status = TaskStatus.PLANNING
        self.store.save(task)
        self._emit(task, AgentState.PLANNING, f"Routing to {route.capability}", "planning")
        try:
            task.status = TaskStatus.RUNNING
            self.store.save(task)
            observations: list[str] = []
            if route.tool:
                tool = self.tools.get(route.tool)
                assert tool is not None
                explicitly_approved = route.tool == "system.open_app"
                if not self.policy.allows(tool, explicitly_approved=explicitly_approved):
                    task.status = TaskStatus.WAITING_USER
                    task.next_step = "Approve the requested action"
                    self.store.save(task)
                    return self._express(text, AgentResult(False, "That action needs approval."), task_state="failed", tool_used=True)
                result = self.tools.execute(route.tool, route.arguments, token)
                task.artifacts.extend(result.artifacts)
                for artifact in task.artifacts:
                    artifact.task_id = task.id
                if route.tool == "web.search" and result.ok:
                    results = result.data["results"]
                    self.research_sessions.save(result.data["query"], route.arguments.get("kind", "text"), results)
                    self._research_active = True
                    if route.arguments.get("kind") == "news" and self._wants_headlines(text):
                        summary = spoken_headlines(results)
                    else:
                        from brain import respond_grounded
                        evidence = grounding_text(result)
                        # Search snippets are discovery hints, not a sufficient
                        # factual record. Fetch the best-ranked page so exact
                        # biographical names, dates, relationships, and numbers
                        # are either present in evidence or explicitly withheld.
                        if route.arguments.get("kind", "text") == "text" and results:
                            opened = self.web.open_result(results[0], token)
                            if opened.ok:
                                evidence = article_grounding(opened) + "\n\n" + evidence
                        # The router has removed wake words and polite command
                        # framing, and conversation continuity may have repaired
                        # a misheard entity. Ground against that semantic query,
                        # never the raw sentence that triggered the lookup.
                        grounding_question = str(route.arguments.get("query") or text)
                        summary = respond_grounded(
                            grounding_question,
                            evidence=evidence,
                            response_plan=plan_response(text),
                            conversation_context=self.runtime_context_prompt,
                        )
                    observations = [f"{index}. {item['title']} - {item['url']}" for index, item in enumerate(results, 1)]
                elif route.tool == "web.open_result" and result.ok:
                    self._research_active = True
                    from brain import respond_grounded
                    summary = specialist_grounded_answer(text, result.data) or respond_grounded(
                        text,
                        evidence=article_grounding(result),
                        response_plan=LONG,
                        conversation_context=self.runtime_context_prompt,
                    )
                    observations = [f"{result.data['title']} - {result.data['url']}"]
                    observations.extend(
                        f"{item['title']} - {item['url']}"
                        for item in result.data.get("supporting_results", [])[:3]
                    )
                elif route.tool in {
                    "system.minimize_active", "system.open_app", "system.open_app_universal",
                    "system.see_screen", "voice.synthesize",
                }:
                    # Commands are execution paths, not essay prompts. Report the
                    # verified outcome verbatim and never invite the LLM to argue,
                    # recommend a different action, or fabricate screen contents.
                    summary = result.summary
                elif result.data:
                    from brain import respond_grounded
                    evidence = f"Action: {route.tool}\nResult: {result.summary}\nData:\n{result.data}"
                    summary = respond_grounded(
                        text,
                        evidence=evidence,
                        response_plan=plan_response(text),
                        conversation_context=self.conversation_context,
                    )
                else:
                    summary = result.summary
                if route.tool == "system.status":
                    summary += f" Python {result.data['python']}; {result.data['disk_free_gb']} GB disk free."
                success = result.ok
            else:
                from brain import respond, respond_grounded
                context = ""
                session = self.research_sessions.current()
                if self._research_active and session and session.selected_evidence and reference_language(text):
                    context = article_grounding(ToolResult(True, "Selected story context", session.selected_evidence))
                if context:
                    summary = specialist_grounded_answer(text, session.selected_evidence) or respond_grounded(
                            text,
                            evidence=context,
                            response_plan=plan_response(text, research_followup=True),
                            conversation_context=self.conversation_context,
                        )
                else:
                    summary = respond(
                        text,
                        context=self.runtime_context_prompt,
                        memories=self.memory.relevant(text),
                        response_plan=plan_response(text),
                    )
                success = True
            task.status = TaskStatus.COMPLETED if success else TaskStatus.FAILED
            task.completed_steps.append("Route, execute, observe, and verify")
            self.store.save(task)
            self._emit(task, AgentState.COMPLETED if success else AgentState.FAILED, summary, "task_completed")
            return self._express(
                text,
                AgentResult(success, summary, task.artifacts, observations=observations),
                task_state=task.status.value if route.tool not in {None, "web.search"} else None,
                tool_used=bool(route.tool),
            )
        finally:
            self.cancellations.finish(task.id)
            self.active_task_id = None

    def speak(self, text: str, output_path: Path | None = None, instruction: str | None = None) -> ToolResult:
        token = CancellationToken()
        return self.tts.synthesize(text, output_path or PATHS.artifact_root / "speech" / "latest.wav", token, instruction)

    def speak_live(self, text: str, output_path: Path | None = None, instruction: str | None = None) -> ToolResult:
        token = CancellationToken()
        return self.tts.speak_streaming(
            text,
            output_path or PATHS.artifact_root / "speech" / "latest.wav",
            token,
            instruction,
        )

    def wait_for_playback_start(self, running) -> bool:
        return self.tts.wait_for_playback_start(running)
