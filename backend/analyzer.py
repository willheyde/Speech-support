import re
from difflib import SequenceMatcher
import librosa
import numpy as np
import subprocess


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

FILLERS = {
    "um", "uh", "like", "you know", "literally", "basically",
    "actually", "right", "so", "hmm", "er", "ah",
}
_FRAGMENT_STOPLIST = {
    "a", "i",
    "to", "in", "it", "of", "an", "is", "at", "as", "be",
    "by", "do", "go", "he", "me", "my", "no", "on", "or",
    "so", "up", "us", "we", "am", "if", "oh", "ok",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _clean(word: str) -> str:
    return re.sub(r"[^\w']", "", word).lower()


def _phonetic_similarity(a: str, b: str) -> float:
    """
    Character-level similarity as a phonetic proxy.
    Falls back gracefully if jellyfish isn't installed.
    """
    try:
        import jellyfish
        jaro    = jellyfish.jaro_winkler_similarity(a, b)
        lev_sim = 1 - jellyfish.levenshtein_distance(a, b) / max(len(a), len(b), 1)
        return (jaro * 0.6 + lev_sim * 0.4)
    except ImportError:
        return SequenceMatcher(None, a, b).ratio()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_word_list(result: dict) -> list[dict]:
    """Flatten all segment → words into a single list."""
    words = []
    for seg in result.get("segments", []):
        for w in seg.get("words", []):
            words.append(w)
    return words


def calculate_wpm(transcript: str, segments: list) -> int:
    total_words = len(transcript.split())
    if not segments:
        return 0
    duration_min = segments[-1]["end"] / 60
    return round(total_words / max(duration_min, 0.01))


def detect_fillers(transcript: str) -> tuple[int, list[dict]]:
    lower = transcript.lower()
    total = 0
    found = []
    # Longest fillers first so "you know" isn't double-counted as "you" + "know"
    for f in sorted(FILLERS, key=len, reverse=True):
        pattern = r"\b" + re.escape(f) + r"\b"
        count = len(re.findall(pattern, lower))
        if count:
            total += count
            found.append({"word": f, "count": count})
    return total, found


def detect_stutters(word_list: list[dict]) -> list[dict]:
    """
    Detect several classes of disfluency in a timestamped word list.
 
    Returns a list of dicts, each with keys:
        type  : "repetition" | "fragment" | "initial_repetition" | "block"
        word  : the offending token
        time  : start time in seconds
    """
    stutters: list[dict] = []
 
    for i in range(1, len(word_list)):
        curr_word  = _clean(word_list[i].get("word", ""))
        prev_word  = _clean(word_list[i - 1].get("word", ""))
        curr_start = word_list[i].get("start", 0)
        curr_end   = word_list[i].get("end", 0)
        prev_end   = word_list[i - 1].get("end", 0)
 
        if not curr_word:
            continue
 
        duration = curr_end - curr_start
 
        # 1. Whole-word repetition  (e.g. "the the dog")
        #    Exact match — precise enough as-is.
        if curr_word == prev_word:
            stutters.append({
                "type": "repetition",
                "word": curr_word,
                "time": curr_start,
            })
            continue
 
        # 2. Fragment — very short token, likely a broken attempt
        #    (e.g. "st-" before "starting")
        #    Stoplist guards against common short words spoken quickly
        #    being misread as broken fragments.
        if (
            duration < 0.12
            and len(curr_word) <= 3
            and curr_word not in _FRAGMENT_STOPLIST
        ):
            stutters.append({
                "type": "fragment",
                "word": curr_word,
                "time": curr_start,
            })
            continue
 
        # 3. Initial-cluster repetition  (e.g. "sta- starting")
        #    Raised prefix match from 2 → 3 chars to avoid flagging
        #    unrelated adjacent words like "should she" or "can call".
        #    Phonetic similarity gate catches remaining edge cases where
        #    three chars match but the words are clearly different.
        if (
            len(curr_word) >= 3
            and len(prev_word) >= 3
            and curr_word[:3] == prev_word[:3]
            and duration < 0.2
            and _phonetic_similarity(curr_word, prev_word) > 0.65
        ):
            stutters.append({
                "type": "initial_repetition",
                "word": curr_word,
                "time": curr_start,
            })
            continue
 
        # 4. Hesitation block — abnormally long pause mid-sentence.
        #    Raised from 0.8 → 1.2s to avoid flagging natural breath
        #    pauses at punctuation. Upper bound of 4s treats anything
        #    longer as a deliberate pause between thoughts, not a block.
        gap = curr_start - prev_end
        if 1.2 < gap < 4.0 and i > 1:
            stutters.append({
                "type": "block",
                "word": curr_word,
                "time": curr_start,
            })
 
    return stutters


def _load_audio_ffmpeg(audio_path: str, sr: int = 16000) -> np.ndarray:
    """
    Decode any audio format (webm, mp4, ogg, wav, …) to a float32 numpy
    array via ffmpeg — no soundfile or audioread involved.
 
    ffmpeg is already a hard dependency of Whisper, so this adds nothing new.
    Significantly faster than librosa's audioread fallback for compressed
    container formats like webm/opus.
    """
    cmd = [
        "ffmpeg",
        "-v", "quiet",          # suppress banner/info
        "-i", audio_path,
        "-f", "f32le",          # raw 32-bit float little-endian PCM
        "-ac", "1",             # force mono
        "-ar", str(sr),         # resample to target rate
        "pipe:1",               # stream to stdout
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg audio decode failed:\n{proc.stderr.decode(errors='replace')}"
        )
    return np.frombuffer(proc.stdout, dtype=np.float32)
 
 
def analyze_volume(audio_path: str) -> dict:
    """
    Return loudness and clarity metrics for an audio file of any format.
 
    Keys
    ----
    avg_db             : mean RMS loudness in dB  (more negative = quieter)
    volume_std         : RMS standard deviation   (higher = more expressive)
    zcr                : mean zero-crossing rate  (proxy for consonant sharpness)
    spectral_centroid  : mean spectral centroid in Hz (higher = brighter/clearer)
    mumble_score       : 0–5 composite concern score
    is_mumbling        : True when mumble_score >= 3
    """
    sr = 16000
    y  = _load_audio_ffmpeg(audio_path, sr=sr)
 
    rms        = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
    avg_db     = float(librosa.amplitude_to_db(rms).mean())
    volume_std = float(np.std(rms))
 
    zcr      = float(librosa.feature.zero_crossing_rate(y)[0].mean())
    centroid = float(librosa.feature.spectral_centroid(y=y, sr=sr)[0].mean())
 
    mumble_score = 0
    if avg_db < -30:       mumble_score += 2   # too quiet overall
    if volume_std < 0.01:  mumble_score += 1   # flat / no dynamics
    if zcr < 0.04:         mumble_score += 1   # weak consonant articulation
    if centroid < 1500:    mumble_score += 1   # dull / muffled spectrum
 
    return {
        "avg_db":            round(avg_db, 1),
        "volume_std":        round(volume_std, 4),
        "zcr":               round(zcr, 4),
        "spectral_centroid": round(centroid, 1),
        "mumble_score":      mumble_score,
        "is_mumbling":       mumble_score >= 3,
    }
 


def score_words(word_list: list[dict], target_text: str = "") -> list[dict]:
    """
    Return a list of word-score dicts sorted WORST → BEST.

    With a target_text  : align spoken words to expected words and score each
                          pair using phonetic similarity + Whisper confidence.
    Without target_text : use Whisper's per-word probability as the score.
    """
    scored: list[dict] = []

    if target_text.strip():
        target_words  = re.sub(r"[^\w\s]", "", target_text.lower()).split()
        spoken_clean  = [_clean(w.get("word", "")) for w in word_list]

        matcher = SequenceMatcher(None, target_words, spoken_clean)

        for tag, i1, i2, j1, j2 in matcher.get_opcodes():

            if tag == "equal":
                for k in range(i2 - i1):
                    word = target_words[i1 + k]
                    prob = (
                        word_list[j1 + k].get("probability", 0.92)
                        if (j1 + k) < len(word_list) else 0.92
                    )
                    scored.append({
                        "word":     word,
                        "expected": word,
                        "spoken":   word,
                        "score":    round(min(1.0, prob), 3),
                        "status":   "correct",
                    })

            elif tag == "replace":
                span = max(i2 - i1, j2 - j1)
                for k in range(span):
                    exp     = target_words[i1 + k] if (i1 + k) < i2 else ""
                    spk_idx = j1 + k
                    spk     = spoken_clean[spk_idx] if spk_idx < j2 else ""

                    if not exp:
                        continue

                    if spk:
                        phon  = _phonetic_similarity(exp, spk)
                        prob  = (
                            word_list[spk_idx].get("probability", phon)
                            if spk_idx < len(word_list) else phon
                        )
                        score  = round(phon * 0.65 + prob * 0.35, 3)
                        status = (
                            "correct"       if score >= 0.92 else
                            "close"         if score >= 0.75 else
                            "mispronounced"
                        )
                        scored.append({
                            "word":     exp,
                            "expected": exp,
                            "spoken":   spk,
                            "score":    score,
                            "status":   status,
                        })
                    else:
                        scored.append({
                            "word":     exp,
                            "expected": exp,
                            "spoken":   "(skipped)",
                            "score":    0.0,
                            "status":   "skipped",
                        })

            elif tag == "delete":
                for k in range(i2 - i1):
                    word = target_words[i1 + k]
                    scored.append({
                        "word":     word,
                        "expected": word,
                        "spoken":   "(skipped)",
                        "score":    0.0,
                        "status":   "skipped",
                    })

            # tag == "insert" → extra spoken words, ignore for scoring

    else:
        # Freestyle — rank by Whisper confidence
        for w in word_list:
            word = _clean(w.get("word", ""))
            if not word or word in FILLERS:
                continue
            prob = w.get("probability", 0.9)
            scored.append({
                "word":     word,
                "expected": word,
                "spoken":   word,
                "score":    round(prob, 3),
                "status":   "correct" if prob >= 0.85 else "unclear",
            })

    # Deduplicate keeping lowest (worst) score per word
    seen: dict[str, dict] = {}
    for entry in scored:
        key = entry["word"]
        if key not in seen or entry["score"] < seen[key]["score"]:
            seen[key] = entry

    result = list(seen.values())
    result.sort(key=lambda x: x["score"])   # worst → best
    return result