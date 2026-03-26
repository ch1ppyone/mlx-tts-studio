ENGINES: dict = {
    "qwen3": {
        "label": "Qwen3-TTS",
        "description": "Multilingual TTS with voice cloning, preset speakers, and voice design",
        "icon": "\U0001f3a4",
        "accent_color": "#6366f1",
        "accent_color_dark": "#818cf8",
        "recommended_for": ["studio", "multilingual", "cloning", "voice_design"],
        "models": [
            {"id": "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16", "label": "1.7B CustomVoice bf16", "tags": ["recommended"]},
            {"id": "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-8bit", "label": "1.7B CustomVoice 8bit"},
            {"id": "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-4bit", "label": "1.7B CustomVoice 4bit"},
            {"id": "mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-bf16", "label": "0.6B CustomVoice bf16"},
            {"id": "mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-8bit", "label": "0.6B CustomVoice 8bit"},
            {"id": "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16",        "label": "1.7B Base bf16"},
            {"id": "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-8bit",        "label": "1.7B Base 8bit"},
            {"id": "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16",        "label": "0.6B Base bf16"},
            {"id": "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16", "label": "1.7B VoiceDesign bf16"},
            {"id": "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-8bit", "label": "1.7B VoiceDesign 8bit"},
        ],
        "voices": [
            {"id": "Vivian",   "label": "Vivian",    "desc": "bright, edgy female",           "lang": "zh"},
            {"id": "Serena",   "label": "Serena",    "desc": "warm, gentle female",           "lang": "zh"},
            {"id": "Uncle_Fu", "label": "Uncle Fu",   "desc": "seasoned, mellow male",         "lang": "zh"},
            {"id": "Dylan",    "label": "Dylan",      "desc": "clear, natural male",           "lang": "zh"},
            {"id": "Eric",     "label": "Eric",       "desc": "lively, husky male",            "lang": "zh"},
            {"id": "Ryan",     "label": "Ryan",       "desc": "dynamic, rhythmic male",        "lang": "en"},
            {"id": "Aiden",    "label": "Aiden",      "desc": "sunny, clear male",             "lang": "en"},
            {"id": "Ono_Anna", "label": "Ono Anna",   "desc": "playful, nimble female",        "lang": "ja"},
            {"id": "Sohee",    "label": "Sohee",      "desc": "warm, emotional female",        "lang": "ko"},
        ],
        "params": ["speed", "temperature", "top_p", "top_k", "repetition_penalty", "max_tokens"],
        "features": ["voice_cloning", "voice_design", "instruct", "emotion"],
        "capabilities": {
            "type_cards": [
                {"id": "CustomVoice", "label_key": "t_custom", "desc_key": "t_custom_d", "shows": ["voices", "emotion"]},
                {"id": "Base",        "label_key": "t_base",   "desc_key": "t_base_d",   "shows": ["ref_audio", "emotion"]},
                {"id": "VoiceDesign", "label_key": "t_design", "desc_key": "t_design_d", "shows": ["voice_design"]},
            ],
            "preview": True,
            "voice_override": True,
            "instruct": True,
            "emotion": True,
            "language_select": True,
            "voice_filter": False,
            "dialogue_mode": False,
            "dialogue_editor": False,
        },
        "default_params": {
            "speed": 1.0,
            "temperature": 0.7,
            "top_p": 0.9,
            "top_k": 50,
            "repetition_penalty": 1.1,
            "max_tokens": 4096,
        },
        "languages": [
            {"id": "auto", "label": "Auto"},
            {"id": "en",   "label": "English"},
            {"id": "zh",   "label": "Chinese"},
            {"id": "ja",   "label": "Japanese"},
            {"id": "ko",   "label": "Korean"},
            {"id": "ru",   "label": "Russian"},
            {"id": "es",   "label": "Spanish"},
            {"id": "fr",   "label": "French"},
            {"id": "de",   "label": "German"},
            {"id": "pt",   "label": "Portuguese"},
            {"id": "ar",   "label": "Arabic"},
        ],
        "default_model": "mlx-community/Qwen3-TTS-12Hz-1.7B-CustomVoice-bf16",
        "default_voice": "Vivian",
    },

    "kokoro": {
        "label": "Kokoro",
        "description": "Fast, natural-sounding TTS \u2014 82 M params, 50+ voices",
        "icon": "\U0001f343",
        "accent_color": "#f59e0b",
        "accent_color_dark": "#fbbf24",
        "recommended_for": ["fast", "lightweight", "preset_voices"],
        "models": [
            {"id": "mlx-community/Kokoro-82M-bf16", "label": "82M bf16", "tags": ["recommended"]},
            {"id": "mlx-community/Kokoro-82M-8bit", "label": "82M 8bit"},
            {"id": "mlx-community/Kokoro-82M-6bit", "label": "82M 6bit"},
            {"id": "mlx-community/Kokoro-82M-4bit", "label": "82M 4bit"},
        ],
        "voices": [
            {"id": "af_heart",   "label": "Heart",   "desc": "warm female",        "lang": "en", "group": "American Female"},
            {"id": "af_alloy",   "label": "Alloy",   "desc": "balanced female",    "lang": "en", "group": "American Female"},
            {"id": "af_aoede",   "label": "Aoede",   "desc": "melodic female",     "lang": "en", "group": "American Female"},
            {"id": "af_bella",   "label": "Bella",   "desc": "expressive female",  "lang": "en", "group": "American Female"},
            {"id": "af_jessica", "label": "Jessica", "desc": "clear female",       "lang": "en", "group": "American Female"},
            {"id": "af_kore",    "label": "Kore",    "desc": "steady female",      "lang": "en", "group": "American Female"},
            {"id": "af_nicole",  "label": "Nicole",  "desc": "smooth female",      "lang": "en", "group": "American Female"},
            {"id": "af_nova",    "label": "Nova",    "desc": "bright female",      "lang": "en", "group": "American Female"},
            {"id": "af_river",   "label": "River",   "desc": "flowing female",     "lang": "en", "group": "American Female"},
            {"id": "af_sarah",   "label": "Sarah",   "desc": "natural female",     "lang": "en", "group": "American Female"},
            {"id": "af_sky",     "label": "Sky",     "desc": "airy female",        "lang": "en", "group": "American Female"},
            {"id": "am_adam",    "label": "Adam",    "desc": "clear male",         "lang": "en", "group": "American Male"},
            {"id": "am_echo",    "label": "Echo",    "desc": "resonant male",      "lang": "en", "group": "American Male"},
            {"id": "am_eric",    "label": "Eric",    "desc": "steady male",        "lang": "en", "group": "American Male"},
            {"id": "am_fenrir",  "label": "Fenrir",  "desc": "deep male",          "lang": "en", "group": "American Male"},
            {"id": "am_liam",    "label": "Liam",    "desc": "warm male",          "lang": "en", "group": "American Male"},
            {"id": "am_michael", "label": "Michael", "desc": "professional male",  "lang": "en", "group": "American Male"},
            {"id": "am_onyx",    "label": "Onyx",    "desc": "rich male",          "lang": "en", "group": "American Male"},
            {"id": "am_puck",    "label": "Puck",    "desc": "playful male",       "lang": "en", "group": "American Male"},
            {"id": "bf_alice",    "label": "Alice",    "desc": "refined female",   "lang": "en-gb", "group": "British Female"},
            {"id": "bf_emma",     "label": "Emma",     "desc": "warm female",      "lang": "en-gb", "group": "British Female"},
            {"id": "bf_isabella", "label": "Isabella", "desc": "elegant female",   "lang": "en-gb", "group": "British Female"},
            {"id": "bf_lily",     "label": "Lily",     "desc": "gentle female",    "lang": "en-gb", "group": "British Female"},
            {"id": "bm_daniel",  "label": "Daniel",  "desc": "composed male",     "lang": "en-gb", "group": "British Male"},
            {"id": "bm_fable",   "label": "Fable",   "desc": "narrative male",    "lang": "en-gb", "group": "British Male"},
            {"id": "bm_george",  "label": "George",  "desc": "classic male",      "lang": "en-gb", "group": "British Male"},
            {"id": "bm_lewis",   "label": "Lewis",   "desc": "articulate male",   "lang": "en-gb", "group": "British Male"},
            {"id": "ef_dora",  "label": "Dora",  "desc": "female", "lang": "es", "group": "Spanish"},
            {"id": "em_alex",  "label": "Alex",  "desc": "male",   "lang": "es", "group": "Spanish"},
            {"id": "ff_siwis", "label": "Siwis", "desc": "female", "lang": "fr", "group": "French"},
            {"id": "hf_alpha", "label": "Alpha", "desc": "female", "lang": "hi", "group": "Hindi"},
            {"id": "hf_beta",  "label": "Beta",  "desc": "female", "lang": "hi", "group": "Hindi"},
            {"id": "hm_omega", "label": "Omega", "desc": "male",   "lang": "hi", "group": "Hindi"},
            {"id": "hm_psi",   "label": "Psi",   "desc": "male",   "lang": "hi", "group": "Hindi"},
            {"id": "if_sara",   "label": "Sara",   "desc": "female", "lang": "it", "group": "Italian"},
            {"id": "im_nicola", "label": "Nicola", "desc": "male",   "lang": "it", "group": "Italian"},
            {"id": "jf_alpha",      "label": "Alpha",      "desc": "female",             "lang": "ja", "group": "Japanese"},
            {"id": "jf_gongitsune", "label": "Gongitsune", "desc": "storytelling female", "lang": "ja", "group": "Japanese"},
            {"id": "jf_nezumi",     "label": "Nezumi",     "desc": "nimble female",      "lang": "ja", "group": "Japanese"},
            {"id": "jf_tebukuro",   "label": "Tebukuro",   "desc": "warm female",        "lang": "ja", "group": "Japanese"},
            {"id": "jm_kumo",       "label": "Kumo",       "desc": "male",               "lang": "ja", "group": "Japanese"},
            {"id": "pf_dora",  "label": "Dora",  "desc": "female", "lang": "pt", "group": "Portuguese"},
            {"id": "pm_alex",  "label": "Alex",  "desc": "male",   "lang": "pt", "group": "Portuguese"},
            {"id": "zf_xiaobei",  "label": "Xiaobei",  "desc": "female", "lang": "zh", "group": "Chinese"},
            {"id": "zf_xiaoni",   "label": "Xiaoni",   "desc": "female", "lang": "zh", "group": "Chinese"},
            {"id": "zf_xiaoxiao", "label": "Xiaoxiao", "desc": "female", "lang": "zh", "group": "Chinese"},
            {"id": "zf_xiaoyi",   "label": "Xiaoyi",   "desc": "female", "lang": "zh", "group": "Chinese"},
            {"id": "zm_yunjian",  "label": "Yunjian",  "desc": "male",   "lang": "zh", "group": "Chinese"},
            {"id": "zm_yunxi",    "label": "Yunxi",    "desc": "male",   "lang": "zh", "group": "Chinese"},
            {"id": "zm_yunxia",   "label": "Yunxia",   "desc": "male",   "lang": "zh", "group": "Chinese"},
            {"id": "zm_yunyang",  "label": "Yunyang",  "desc": "male",   "lang": "zh", "group": "Chinese"},
        ],
        "params": ["speed"],
        "features": [],
        "capabilities": {
            "preview": True,
            "voice_override": False,
            "instruct": False,
            "emotion": False,
            "language_select": True,
            "voice_filter": True,
            "dialogue_mode": False,
            "dialogue_editor": False,
        },
        "default_params": {
            "speed": 1.0,
        },
        "languages": [
            {"id": "en",    "label": "English (US)"},
            {"id": "en-gb", "label": "English (UK)"},
            {"id": "ja",    "label": "Japanese"},
            {"id": "zh",    "label": "Chinese"},
            {"id": "es",    "label": "Spanish"},
            {"id": "fr",    "label": "French"},
            {"id": "hi",    "label": "Hindi"},
            {"id": "it",    "label": "Italian"},
            {"id": "pt",    "label": "Portuguese"},
        ],
        "default_model": "mlx-community/Kokoro-82M-bf16",
        "default_voice": "af_heart",
    },

    "dia": {
        "label": "Dia",
        "description": "Dialogue TTS \u2014 two speakers with emotions, laughter, and natural pauses",
        "icon": "\U0001f4ac",
        "accent_color": "#10b981",
        "accent_color_dark": "#34d399",
        "recommended_for": ["dialogue", "two_speaker", "expressive"],
        "models": [
            {"id": "mlx-community/Dia-1.6B",      "label": "1.6B",      "tags": ["recommended"]},
            {"id": "mlx-community/Dia-1.6B-fp16",  "label": "1.6B fp16"},
            {"id": "mlx-community/Dia-1.6B-4bit",  "label": "1.6B 4bit"},
            {"id": "mlx-community/Dia-1.6B-6bit",  "label": "1.6B 6bit"},
            {"id": "mlx-community/Dia-1.6B-3bit",  "label": "1.6B 3bit"},
        ],
        "voices": [],
        "params": [],
        "features": ["dialogue", "voice_cloning"],
        "capabilities": {
            "preview": False,
            "voice_override": False,
            "instruct": False,
            "emotion": False,
            "language_select": True,
            "voice_filter": False,
            "dialogue_mode": True,
            "dialogue_editor": True,
            "ref_audio": True,
        },
        "default_params": {
            "temperature": 0.9,
            "top_p": 0.85,
            "max_tokens": 512,
        },
        "languages": [
            {"id": "en", "label": "English"},
        ],
        "default_model": "mlx-community/Dia-1.6B",
        "default_voice": "",
    },
}

PARAM_DEFS: dict = {
    "speed":              {"min": 0.5, "max": 2.0, "step": 0.1,  "default": 1.0,  "label": "Speed"},
    "temperature":        {"min": 0.0, "max": 1.5, "step": 0.05, "default": 0.7,  "label": "Temperature"},
    "top_p":              {"min": 0.0, "max": 1.0, "step": 0.05, "default": 0.9,  "label": "Top P"},
    "top_k":              {"min": 1,   "max": 200, "step": 1,    "default": 50,   "label": "Top K"},
    "repetition_penalty": {"min": 1.0, "max": 2.0, "step": 0.05, "default": 1.1,  "label": "Repetition Penalty"},
    "max_tokens":         {"min": 512, "max": 8192,"step": 256,  "default": 4096, "label": "Max Tokens"},
}

def build_generate_kwargs(engine_id: str, model, body: dict) -> dict:
    eng = ENGINES.get(engine_id, {})
    defaults = eng.get("default_params", {})
    text = body.get("text", "")
    voice = body.get("voice") or None
    kw: dict = {"text": text, "verbose": False}

    if engine_id == "qwen3":
        kw.update(
            voice=voice,
            speed=float(body.get("speed", defaults.get("speed", 1.0))),
            temperature=float(body.get("temperature", defaults.get("temperature", 0.7))),
            max_tokens=int(body.get("max_tokens", defaults.get("max_tokens", 4096))),
            lang_code=body.get("lang_code", "auto"),
            top_p=float(body.get("top_p", defaults.get("top_p", 0.9))),
            top_k=int(body.get("top_k", defaults.get("top_k", 50))),
            repetition_penalty=float(body.get("repetition_penalty", defaults.get("repetition_penalty", 1.1))),
            stream=False,
        )
        instruct = body.get("instruct")
        if instruct:
            kw["instruct"] = instruct

    elif engine_id == "kokoro":
        kw.update(
            voice=voice or "af_heart",
            speed=float(body.get("speed", defaults.get("speed", 1.0))),
            lang_code=body.get("lang_code", "en"),
        )

    elif engine_id == "dia":
        temp = body.get("temperature")
        top_p = body.get("top_p")
        max_tok = body.get("max_tokens")
        if temp not in (None, ""):
            kw["temperature"] = float(temp)
        if top_p not in (None, ""):
            kw["top_p"] = float(top_p)
        if max_tok not in (None, ""):
            kw["max_tokens"] = int(max_tok)
        if voice:
            kw["voice"] = voice

    return kw


def needs_ref_audio(engine_id: str, model_id: str) -> bool:
    if engine_id == "qwen3" and "Base" in model_id:
        return True
    if engine_id == "dia":
        return True
    return False
