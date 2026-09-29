from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Route:
    capability: str
    tool: str | None = None
    arguments: dict[str, Any] = field(default_factory=dict)


class CapabilityRouter:
    _NAME_WORD = r"[A-Za-z][A-Za-z'\-]*"

    @staticmethod
    def _strip_spoken_prefix(text: str) -> str:
        """Remove wake words and conversational lead-ins before intent parsing."""
        clean = text.strip()
        clean = re.sub(
            r"(?i)^\s*(?:(?:okay|ok|alright|all right|hey|hello|so|now|just|meera|mira)[,.\s!?]+)*",
            "",
            clean,
        )
        return clean.strip()

    @staticmethod
    def _referenced_result(text: str) -> int | str | None:
        lowered = text.lower()
        words = {"first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5}
        for word, index in words.items():
            if re.search(rf"\b{word}\b", lowered):
                return index
        numbered = re.search(r"\b(?:number\s*)?([1-5])(?:st|nd|rd|th)?\b", lowered)
        if numbered:
            return int(numbered.group(1))
        if re.search(r"\b(?:last one|last headline|last story|last news)\b", lowered):
            return "last"
        if re.search(r"\b(?:selected|same|that|this) (?:one|headline|story|news|article)\b", lowered):
            return "selected"
        return None

    @staticmethod
    def _search_query(text: str) -> str:
        text = CapabilityRouter._strip_spoken_prefix(text)
        # Strip exactly one spoken command layer. Keeping a repeated command in
        # the remainder lets acknowledgement_for reject it instead of speaking
        # the user's whole request back as though it were a subject.
        query = re.sub(
            r"(?i)^\s*(?:(?:can|could|would|will)\s+(?:you|i)\s+)?(?:please\s+)?(?:just\s+)?"
            r"(?:search(?: the)? web(?: for)?|search(?: for)?|look up|find online|check online)\s+",
            "",
            text,
            count=1,
        )
        query = re.sub(
            r"(?i)^\s*(?:(?:i\s+)?(?:just\s+)?(?:wanted to|want to)\s+ask(?: you)?(?:\s+something)?\s+about|"
            r"(?:(?:can|could|would|will)\s+(?:you|i)\s+)?(?:please\s+)?(?:just\s+)?"
            r"(?:tell|give)\s+(?:me|us)(?:\s+(?:something|more|some points?|details?|info))*\s+(?:about|on)|"
            r"what (?:do you know|can you tell (?:me|us))\s+about|"
            r"what are (?:some|the) (?:key )?points about|"
            r"(?:who|what)\s+(?:is|was|are))\s+",
            "",
            query,
            count=1,
        ).strip(" .?!")
        # Remove natural question framing while preserving every useful search
        # constraint.  Spoken requests are instructions to the router, not good
        # literal search-engine queries (and definitely not good text to echo).
        query = re.sub(
            r"(?i)^\s*(?:(?:can|could|would|will)\s+you\s+)?(?:please\s+)?"
            r"(?:tell|show|give)\s+(?:me|us)\s+",
            "",
            query,
            count=1,
        )
        query = re.sub(r"(?i)^\s*(?:some\s+of\s+the|some\s+of|some|the)\s+(?=(?:latest|newest|recent|current)\b)", "", query)
        query = re.sub(r"(?i)^\s*(?:what\s+(?:are|is)\s+)(?:some\s+of\s+the|some\s+of|some|the)?\s*", "", query)
        query = re.sub(r"\s+", " ", query).strip(" .?!")
        query = re.sub(
            r"(?i)[,\s]+(?:if you could|can you|could you|please|and tell|to tell|and give|some of the points|points? about|what about).*",
            "",
            query,
        ).strip(" .?!")
        query = re.sub(r"(?i)\bnarindra\b", "Narendra", query)
        return query or text.strip()

    @staticmethod
    def _news_query(text: str) -> str:
        clean = CapabilityRouter._strip_spoken_prefix(text).strip(" .?!")
        topic = re.search(r"(?i)\bnews (?:about|on|for)\s+(.+)$", clean)
        if topic:
            return re.sub(r"(?i)\s+headlines?$", "", topic.group(1)).strip()
        clean = re.sub(
            r"(?i)^(?:(?:can|could|would) you\s+)?(?:please\s+)?"
            r"(?:read|give|tell|show)(?: me| us)?\s+(?:the\s+)?",
            "",
            clean,
        )
        clean = re.sub(r"(?i)\b(?:latest|today'?s?|current|top|main)\b", "", clean)
        clean = re.sub(r"(?i)\b(?:news|headlines?|stories)\b", "", clean)
        clean = re.sub(r"(?i)^(?:some\s+of\s+the|some\s+of|some|the)\s+", "", clean)
        clean = re.sub(r"\s+", " ", clean).strip()
        if clean.lower() in {"technology", "tech"}:
            return "technology AI software cybersecurity"
        return clean or "latest news"

    @classmethod
    def _profile_route(cls, text: str) -> Route | None:
        """Parse owner-profile language before broad factual web routing.

        This is intentionally a small semantic parser rather than a single exact
        command regex: people introduce themselves with framing, two clauses,
        contractions, and different word order.
        """
        clean = cls._strip_spoken_prefix(text).strip()
        inquiry = re.search(
            r"(?i)\b(?:"
            r"(?:do|did)\s+you\s+(?:know|remember|recall)\s+(?:what\s+)?my\s+(?:full\s+)?name(?:\s+is)?|"
            r"what(?:'s|\s+is)\s+my\s+(?:full\s+)?name|"
            r"(?:can|could|would)\s+you\s+(?:tell|remind)\s+me\s+(?:what\s+)?my\s+(?:full\s+)?name(?:\s+is)?|"
            r"what\s+do\s+you\s+call\s+me|who\s+am\s+i"
            r")\b",
            clean,
        )
        # An explicit identity question is local profile recall, never a request
        # to search public people with a similar name.
        if inquiry:
            return Route("profile", "profile.get_name")

        words = cls._NAME_WORD
        full_match = re.search(
            rf"(?i)\bmy\s+(?:full\s+)?name\s+is\s+"
            rf"({words}(?:\s+{words}){{0,3}}?)"
            r"(?=\s+(?:and|but|while|although|because|so|from now)\b|[,.;!?]|$)",
            clean,
        )
        preferred_match = re.search(
            rf"(?i)\b(?:from\s+now(?:\s+on)?[, ]+)?(?:you\s+can\s+)?call\s+me\s+"
            rf"({words}(?:\s+{words}){{0,2}}?)"
            r"(?=\s+(?:as|and|but|because|since|while|although|my\s+name)\b|[,.;!?]|$)",
            clean,
        )
        if not (preferred_match or full_match):
            return None

        def normalized_name(value: str) -> str:
            return " ".join(part[:1].upper() + part[1:] for part in value.split())

        full_name = normalized_name(full_match.group(1)) if full_match else ""
        preferred = normalized_name(preferred_match.group(1)) if preferred_match else full_name
        if preferred.casefold() in {"me", "you", "it", "that", "this", "tomorrow", "later"}:
            return None
        # A title is a form of address, not the owner's factual identity.
        # Keeping these separate lets Meera say "Sir" naturally while still
        # answering "Your name is Vidit Shah" from memory.
        if preferred_match and not full_match and preferred.casefold() in {"sir", "boss"}:
            return Route("profile", "profile.set_address", {"address": preferred})
        arguments = {"name": preferred}
        if full_name:
            arguments["full_name"] = full_name
        return Route("profile", "profile.set_name", arguments)

    def route(self, text: str) -> Route:
        clean = text.strip()
        profile = self._profile_route(clean)
        if profile is not None:
            return profile
        if re.search(r"(?i)\b(?:too fast|speak (?:a little(?: bit)? )?slow(?:er|ly)?|slow down|decreas(?:e|es) (?:the )?(?:pace|speed))\b", clean):
            return Route("voice_control", "voice.rate", {"direction": "slower"})
        if re.search(r"(?i)\b(?:too slow|speak (?:a little(?: bit)? )?(?:more )?fast(?:er)?|speed up|increase (?:the )?(?:pace|speed))\b", clean):
            return Route("voice_control", "voice.rate", {"direction": "faster"})
        if re.search(r"(?i)\b(?:voice|speak|sound|delivery)\b", clean) and re.search(
            r"(?i)\b(?:mature|matured|deep(?:er)?|confident|dominant|professional|female|woman|"
            r"consistent|same voice|stable)\b",
            clean,
        ):
            return Route("voice_style")
        if re.fullmatch(r"(?i)(?:(?:yeah|yes|ye|okay|ok)[, ]+)?(?:can you |please )?(?:laugh|chuckle)(?: for me)?[.?!]*", clean):
            return Route("vocal_reaction")
        if re.fullmatch(
            r"(?i)(?:(?:can|do) you |are you able to )?(?:love|feel(?: emotions?)?|have emotions?|"
            r"experience emotions?|get emotional)[.?!]*",
            clean,
        ):
            return Route("self_emotion")
        preference_set = re.fullmatch(
            r"(?is)(?:from now on[,]?\s+)?your favou?rite\s+(.+?)\s+(?:is|should be)\s+(.+?)[.?!]*",
            clean,
        )
        if preference_set:
            return Route("persona_preference", "persona.preference", {
                "action": "set", "domain": preference_set.group(1).strip(),
                "choice": preference_set.group(2).strip(),
            })
        preference_get = re.fullmatch(
            r"(?is)(?:(?:what(?: is|'s)|tell me)\s+your favou?rite|do you have a favou?rite)\s+(.+?)[.?!]*",
            clean,
        )
        if preference_get:
            return Route("persona_preference", "persona.preference", {
                "action": "choose", "domain": preference_get.group(1).strip(),
            })
        preference_options = re.fullmatch(
            r"(?is)(?:choose|pick)\s+(?:your\s+)?(?:own\s+)?favou?rite\s+(.+?)\s+(?:from|between)\s+(.+?)[.?!]*",
            clean,
        )
        if preference_options:
            options = [part.strip() for part in re.split(r"\s*(?:,|\bor\b|\band\b)\s*", preference_options.group(2)) if part.strip()]
            return Route("persona_preference", "persona.preference", {
                "action": "choose", "domain": preference_options.group(1).strip(), "options": options,
            })
        if re.fullmatch(r"(?is)(?:what do you like|what are your favou?rite things)[.?!]*", clean):
            return Route("persona_preference", "persona.preference", {"action": "list", "domain": ""})
        if re.fullmatch(r"(?i)(?:okay|ok|got it|all right|alright|understood)[.?!]*", clean):
            return Route("acknowledgement")
        if re.search(r"(?i)\b(?:a lot of|because|about|with|without|for|from|that|to)\s*$", clean):
            return Route("clarification", arguments={"prompt": "Go on, I'm listening."})
        if re.search(r"(?:\.{2,}|â€¦)\s*$", clean) or re.search(
            r"(?i)\b(?:were|was|am|is|are)\s+(?:actually\s+)?(?:quite|very|really|almost)\s*$", clean
        ):
            return Route("clarification", arguments={"prompt": "Go on, I'm listening."})
        if re.fullmatch(r"(?i)(?:hello|hi|hey)(?:\s+meera|\s+mira)?[,.?! ]*", clean) or re.fullmatch(
            r"(?i)(?:how are you|how is it going(?: on)?|how's it going(?: on)?|what's up)[,.?! ]*",
            clean,
        ):
            return Route("social_greeting")
        if re.fullmatch(
            r"(?is)(?:okay[,]?\s+)?(?:so\s+)?(?:now\s+)?(?:just\s+)?"
            r"(?:(?:can|could) you )?tell me (?:something )?about[.?! ]*",
            clean,
        ):
            return Route(
                "clarification",
                arguments={"prompt": "Who or what would you like me to tell you about?"},
            )
        # Do not invite the language model to complete a tiny ambiguous fragment.
        # Small models can turn phrases such as "in order" into a fictional project
        # update. A focused repair question is both more human and more truthful.
        if re.fullmatch(r"(?i)(?:in order|in sequence|and then|something else|the other one)[.?! ]*", clean):
            prompts = {
                "in order": "What would you like me to put in order?",
                "in sequence": "What would you like me to arrange in sequence?",
                "and then": "Go on—what comes next?",
                "something else": "What would you like to switch to?",
                "the other one": "Which other one do you mean?",
            }
            key = re.sub(r"[^a-z ]", "", clean.lower()).strip()
            return Route("clarification", arguments={"prompt": prompts[key]})
        app = re.fullmatch(
            r"(?i)(?:(?:(?:okay|hey) )?meera[,]? )?(?:can you |please )?(?:open|launch|start) "
            r"(?:google )?(chrome|edge|notepad|calculator)(?: on my computer)?[.?!]*",
            clean,
        )
        if app:
            return Route("computer", "system.open_app", {"app": app.group(1).lower()})
        # Meta/personality requests are conversation. They must win before broad web cues
        # such as "about", "who is", or "AI" can classify the turn as research.
        if re.search(
            r"(?i)\b(?:be|act|talk|speak|sound|respond|answer)\b.{0,80}\b(?:more human|humanic|human-like|humanlike|natural|naturally|personality|personal assistant|less robotic|less boring|more expressive|expressive|conversational)\b",
            clean,
        ) or re.search(
            r"(?i)\b(?:more human|humanic|human-like|humanlike|personal assistant|less robotic|less boring|more expressive)\b",
            clean,
        ):
            return Route("chat")
        if re.fullmatch(r"(?i)(?:good morning|good evening|good night)[,.?! ]*", clean):
            return Route("social_greeting")
        # First-person questions about Meera are conversation, never entity research.
        # This must precede broad cues such as "tell me about" and "who is".
        if re.fullmatch(
            r"(?is)(?:(?:okay|alright|all right|hey|hello|so|now|just|meera|mira)[,.\s!?]+)*"
            r"(?:(?:can|could|would) you )?(?:please )?(?:just )?(?:tell me (?:something )?about yourself|"
            r"who are you|what are you|describe yourself|introduce yourself|tell me who you are|tell me about you)[.?!]*",
            clean,
        ):
            return Route("identity")
        if re.search(
            r"(?i)\b(?:what can you do|what are your capabilities|list (?:me )?(?:the )?things "
            r"(?:that )?you can (?:do|build)|things (?:that )?you can (?:do|build))\b",
            clean,
        ):
            return Route("capabilities")
        if re.fullmatch(r"(?i)(stop|cancel|never mind)(?: (?:that|it|the current task))?[.!]?", clean):
            return Route("task", "task.cancel")
        if re.fullmatch(r"(?i)(continue|resume)(?: (?:where we stopped|the task))?[.!]?", clean):
            return Route("task", "task.continue")
        if re.fullmatch(r"(?i)(?:run )?(?:system )?(status|diagnostics)[.!]?", clean):
            return Route("system", "system.status")

        if re.search(
            r"(?is)\b(?:minimi[sz]e|hide)\s+(?:(?:my|the|this|current)\s+)?"
            r"(?:screen|window|app)\s*(?:currently|now)?[.?!]*$",
            clean,
        ):
            return Route("system_action", "system.minimize_active", {})

        if re.search(r"(?i)\b(?:analy[sz]e|inspect|review|audit|understand|look through)\b", clean) and re.search(
            r"(?i)\b(?:my|this|the|entire|whole)\s+(?:codebase|project|repository|repo)\b", clean
        ):
            return Route("project", "project.inspect", {"root": "."})
        
        see_screen = re.search(r"(?i)\b(?:what(?:'s| is) on my screen|see my screen|read my screen|look at my screen|what am i looking at|read what's on my screen)\b", clean)
        if see_screen:
            return Route("system", "system.see_screen")
            
        open_app = re.fullmatch(r"(?is).*?(?:open|start|launch)\s+([a-zA-Z0-9_\-\s]+?)(?:\s+app|\s+program)?(?:[\.\?!]*)$", clean)
        if open_app and not re.search(r"(?i)\b(browser|chrome|edge)\b", open_app.group(1)):
            app_name = open_app.group(1).strip()
            if app_name.lower() not in ("it", "that", "this"):
                return Route("system", "system.open_app_universal", {"app_name": app_name})
                
        search_files = re.fullmatch(r"(?is).*?(?:search|find)\s+(?:for\s+)?(?:files?|folders?)\s+(?:for|matching|named)?\s*([^\.]+?)(?:[\.\?!]*)$", clean)
        if search_files:
            pattern = search_files.group(1).strip()
            if pattern:
                return Route("system", "system.search_files", {"pattern": f"*{pattern}*"})
                
        match = re.fullmatch(r"(?is)(?:say|speak) (.+)", clean)
        if match:
            return Route("voice", "voice.synthesize", {"text": match.group(1).strip()})
        remember = re.fullmatch(r"(?is)(?:please )?remember(?: that)? (.+)", clean)
        correction = re.fullmatch(r"(?is)(?:when i say|you heard) (.+?)[, ]+(?:i mean|but i meant) (.+)", clean)
        if correction:
            return Route("speech", "speech.learn", {"alias": correction.group(1).strip(), "canonical": correction.group(2).strip(" .")})
        learn_name = re.fullmatch(r"(?is)(?:please )?(?:learn|remember) the name (.+)", clean)
        if learn_name:
            return Route("speech", "speech.learn", {"canonical": learn_name.group(1).strip(" .")})
        if re.fullmatch(r"(?i)(?:forget|clear|wipe)(?: everything| memory| it all| all)[.!]?", clean) or clean.lower().strip() == "start over":
            return Route("memory", "memory.reset")
        if remember:
            return Route("memory", "memory.remember", {"content": remember.group(1).strip(" .")})
        if re.search(r"(?i)\b(what do you remember|do you remember)\b", clean):
            return Route("memory", "memory.recall")
        referenced = self._referenced_result(clean)
        reference_action = re.search(
            r"(?i)\b(?:explain|expand|open|read|tell me more|go deeper|go with|choose|pick|"
            r"more about|interesting|what happened|why|details?|story|headline|news|article)\b",
            clean,
        )
        bare_reference = re.fullmatch(
            r"(?i)(?:the\s+)?(?:first|second|third|fourth|fifth|last)(?:\s+one)?[.?! ]*|"
            r"(?:number\s*)?[1-5](?:st|nd|rd|th)?[.?! ]*",
            clean,
        )
        if referenced is not None and (reference_action or bare_reference):
            return Route("research_followup", "web.open_result", {"selector": referenced})
        lowered = clean.lower()
        web_cues = (
            "search the web", "search web", "search for", "look up", "find online", "check online",
            "current news", "today's news", "news about", "who is",
            "born on", "birthday", "weather", "from the web", "on the internet",
        )
        person_query = re.fullmatch(
            r"(?:(?i:(?:okay|alright|all right|hey|hello|so|now|just|meera|mira)[,.\s!?]+)*"
            r"(?i:(?:can|could|would) you )?(?i:please )?(?i:just )?"
            r"(?i:tell me (?:something )?about ))"
            r"([A-Z][a-z]+(?: [A-Z][a-z]+){1,3})[.?!]*",
            clean,
        )
        # ASR typically lowercases microphone input. A conversational request to
        # "tell me about narendra modi" must still be research, not a free-form
        # chat prompt that invites the local model to invent biography.
        spoken_about = re.fullmatch(
            r"(?is)(?:(?:okay|alright|all right|hey|hello|so|now|just|meera|mira)[,.\s!?]+)*"
            r"(?:(?:can|could|would) you\s+)?(?:please\s+)?(?:just\s+)?"
            r"tell me (?:something )?about\s+(.+?)[.?!]*",
            clean,
        )
        # "Who is X" is usually biographical and benefits from current grounding.
        # "What is supervised learning" (or formulas/techniques/parts of it) is
        # timeless explanatory knowledge and should stay with the local brain.
        biography_inquiry = bool(re.search(
            r"(?i)^\s*who\s+(?:is|was|are)\s+\S+",
            self._strip_spoken_prefix(clean),
        ))
        explanatory_cues = bool(re.search(
            r"(?i)\b(?:what (?:is|are|does|do)|how (?:does|do|is|are)|why|explain|formula(?:s)?|"
            r"equation(?:s)?|technique(?:s)?|method(?:s)?|parts?|components?|types?|examples?|"
            r"learning|computing|science|engineering|theory|process|algorithm(?:s)?)\b",
            clean,
        ))
        time_sensitive = bool(re.search(r"(?i)\b(?:latest|current|newest|recent)\b", lowered))
        personal_fact_cue = bool(re.search(
            r"(?i)\b(?:full name|names?|age|born|birthday|wife|husband|spouse|children|kids?|"
            r"sons?|daughters?|parents?|mother|father|siblings?|married|awards?)\b",
            clean,
        ))
        named_entity_shape = bool(
            re.search(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}(?:'s)?\b", clean)
            or re.search(r"(?i)\bwhat (?:is|are|was|were)\s+.+?\s+(?:age|wife|husband|children|kids?|parents?|name)s?\b", clean)
        )
        personal_fact_inquiry = personal_fact_cue and named_entity_shape
        explicit_web = any(cue in lowered for cue in web_cues)
        # A generic "tell me about" request still grounds likely names, including
        # lower-cased ASR output, but explanatory wording wins for concepts.
        implicit_about = bool(spoken_about and not explanatory_cues)
        implicit_person = bool(person_query and not explanatory_cues)
        if explicit_web or re.search(r"\bnews\b", lowered) or implicit_person or implicit_about or biography_inquiry or time_sensitive or personal_fact_inquiry:
            kind = "news" if any(cue in lowered for cue in ("news", "headlines", "stories", "today's news", "current news")) else "text"
            query = person_query.group(1) if person_query else (spoken_about.group(1).strip() if spoken_about else (
                self._news_query(clean) if kind == "news" else self._search_query(clean)
            ))
            return Route("research", "web.search", {"query": query, "kind": kind})
        for capability, pattern in {
            "git": r"\b(?:git|commit|branch|diff)\b",
            "files": r"\b(?:file|folder|downloads|directory)\b",
            "browser": r"\b(?:browser|website|chrome)\b|https?://",
            "project": r"\b(?:test|code|project|build|debug)\b",
            "research": r"\bresearch\b",
            "monitor": r"\b(?:monitor|watch|every hour|every morning)\b",
        }.items():
            if re.search(pattern, lowered):
                return Route(capability)
        return Route("chat")
