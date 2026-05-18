from faster_whisper import WhisperModel
import tempfile
import os

_model = None


def get_model():
    global _model
    if _model is None:
        print("[transcriber] Loading faster-whisper model...")
        _model = WhisperModel(
            "small",
            device="cpu",
            compute_type="int8",        # INT8 quantisation — biggest speed gain on CPU
            cpu_threads=0,              # 0 = use all available cores automatically
            num_workers=1,
        )
        print("[transcriber] Model ready.")
    return _model


def transcribe(audio_bytes: bytes, file_suffix: str = ".webm") -> dict:
    """
    Transcribe raw audio bytes using faster-whisper with word-level timestamps
    and filler-word detection enabled (suppress_tokens=[]).

    Returns a dict shaped like the original openai-whisper output so the rest
    of the pipeline (analyzer.py etc.) needs zero changes:
        {
            "text": str,
            "segments": [
                {
                    "start": float, "end": float, "text": str,
                    "words": [{"word": str, "start": float, "end": float, "probability": float}]
                },
                ...
            ]
        }
    """
    model = get_model()

    with tempfile.NamedTemporaryFile(delete=False, suffix=file_suffix) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        segments_generator, info = model.transcribe(
            tmp_path,
            word_timestamps=True,
            suppress_tokens=[],                # Keep um / uh / filler tokens
            condition_on_previous_text=False,  # Better accuracy on short clips
            temperature=0.0,                   # Deterministic output
            vad_filter=True,                   # Skip silent sections — extra speed boost
            vad_parameters=dict(
                min_silence_duration_ms=300,   # Ignore silences shorter than 300ms
            ),
        )

        # faster-whisper returns a lazy generator — consume it once here
        segments_list = []
        full_text_parts = []

        for seg in segments_generator:
            words = []
            if seg.words:
                for w in seg.words:
                    words.append({
                        "word":        w.word,
                        "start":       w.start,
                        "end":         w.end,
                        "probability": w.probability,
                    })

            segments_list.append({
                "start": seg.start,
                "end":   seg.end,
                "text":  seg.text,
                "words": words,
            })
            full_text_parts.append(seg.text)

    finally:
        os.unlink(tmp_path)

    return {
        "text":                 " ".join(full_text_parts).strip(),
        "segments":             segments_list,
        "language":             info.language,
        "language_probability": info.language_probability,
    }