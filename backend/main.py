from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import time
import tempfile
import os
from transcriber import transcribe
from analyzer import (
    extract_word_list,
    calculate_wpm,
    detect_fillers,
    detect_stutters,
    score_words,
    analyze_volume,
)
from tip import generate_tips

app = FastAPI(title="Speech Coach API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],   # Vite default — adjust if needed
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/analyze")
async def analyze(
    audio: UploadFile = File(...),
    target_text: str = Form(default=""),   # empty string for freestyle
):
    """
    Accepts a recorded audio file and an optional target_text string.
    Returns transcript, WPM, filler words, stutters, per-word scores,
    and prioritised coaching tips.
    """
    audio_bytes = await audio.read()

    # Write to a temp file so librosa can read it by path
    suffix = os.path.splitext(audio.filename or "recording.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        start_time = time.perf_counter()
        result = transcribe(audio_bytes)
        print(f"[main] Transcription time: {time.perf_counter() - start_time:.2f}s")

        # ── Analysis ───────────────────────────────────────────────────────────
        transcript = result["text"].strip()
        segments   = result["segments"]

        start_time = time.perf_counter()
        word_list  = extract_word_list(result)

        wpm                   = calculate_wpm(transcript, segments)
        filler_count, fillers = detect_fillers(transcript)
        stutters              = detect_stutters(word_list)
        word_scores           = score_words(word_list, target_text)
        volume                = analyze_volume(tmp_path)
        print(f"[main] Volume result: {volume}")
        print(f"[main] Analysis time: {time.perf_counter() - start_time:.2f}s")

        tips = generate_tips(
            wpm=wpm,
            filler_count=filler_count,
            filler_words=fillers,
            stutter_count=len(stutters),
            word_scores=word_scores,
            has_target=bool(target_text.strip()),
        )
        return {
            "transcript":    transcript,
            "wpm":           wpm,
            "filler_count":  filler_count,
            "filler_words":  fillers,
            "stutter_count": len(stutters),
            "stutters":      stutters,
            "word_scores":   word_scores,
            "volume":        volume,
            "tips":          tips,
        }

    finally:
        os.unlink(tmp_path)  # always clean up, even if something above throws