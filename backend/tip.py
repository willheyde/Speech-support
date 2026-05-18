"""
tips.py — Rule-based tip generation from speech metrics.

Tips are returned ordered: high priority first, then medium, then good-news.
Each tip has: priority, icon, title, detail.
"""

from __future__ import annotations


_PRIORITY_ORDER = {"high": 0, "medium": 1, "good": 2}


def generate_tips(
    wpm: int,
    filler_count: int,
    filler_words: list[dict],
    stutter_count: int,
    word_scores: list[dict],
    has_target: bool,
) -> list[dict]:
    tips: list[dict] = []

    # ── Pace ────────────────────────────────────────────────────────────────
    if wpm < 90:
        tips.append({
            "priority": "high",
            "icon": "🐢",
            "title": "Speaking too slowly",
            "detail": (
                f"Your pace was {wpm} WPM — well below the natural range of 130–160 WPM. "
                "Try reading the passage in a single breath without unnecessary pauses between words. "
                "Record yourself at a slightly faster pace each attempt."
            ),
        })
    elif wpm < 120:
        tips.append({
            "priority": "medium",
            "icon": "⏱️",
            "title": "Slightly slow pace",
            "detail": (
                f"At {wpm} WPM you sound deliberate, which can feel monotonous. "
                "Aim for 130–160 WPM for conversational flow. "
                "Try marking phrase boundaries and only pausing there."
            ),
        })
    elif wpm > 200:
        tips.append({
            "priority": "high",
            "icon": "🏃",
            "title": "Speaking too quickly",
            "detail": (
                f"{wpm} WPM is too fast for comfortable listening. "
                "Slow down, breathe between sentences, and stress the most important word in each clause. "
                "Listeners need time to process what you say."
            ),
        })
    elif wpm > 175:
        tips.append({
            "priority": "medium",
            "icon": "⏩",
            "title": "Slightly fast pace",
            "detail": (
                f"At {wpm} WPM you're on the brisk side. "
                "Try adding a one-beat pause after commas and a two-beat pause after full stops. "
                "This naturally slows delivery without sounding unnatural."
            ),
        })
    else:
        tips.append({
            "priority": "good",
            "icon": "✅",
            "title": "Ideal speaking pace",
            "detail": (
                f"{wpm} WPM sits in the conversational sweet spot (130–160 WPM). "
                "Your listeners have enough time to absorb what you're saying. Keep it up."
            ),
        })

    # ── Filler words ────────────────────────────────────────────────────────
    if filler_count >= 6:
        worst = ", ".join(
            f'"{f["word"]}" ×{f["count"]}' for f in filler_words[:3]
        )
        tips.append({
            "priority": "high",
            "icon": "🚫",
            "title": "Heavy filler word usage",
            "detail": (
                f"You used {filler_count} filler words ({worst}). "
                "Replace every filler with a deliberate silent pause — silence actually sounds more confident "
                "than 'um' or 'uh'. Record yourself and count fillers per minute as a daily drill."
            ),
        })
    elif filler_count >= 2:
        tips.append({
            "priority": "medium",
            "icon": "⚠️",
            "title": "Reduce filler words",
            "detail": (
                f"{filler_count} filler word(s) detected. "
                "Build awareness by listening back to your recordings and tapping a finger each time you "
                "hear a filler. The goal is zero — a pause is always better."
            ),
        })
    elif filler_count == 0:
        tips.append({
            "priority": "good",
            "icon": "🎯",
            "title": "Zero filler words",
            "detail": "No 'um', 'uh', or 'like' detected. Your speech was clean and polished.",
        })

    # ── Stutters ────────────────────────────────────────────────────────────
    if stutter_count >= 4:
        tips.append({
            "priority": "high",
            "icon": "🔁",
            "title": "Frequent stuttering",
            "detail": (
                f"{stutter_count} word repetitions detected. "
                "Stuttering often spikes when you're speaking too fast or feeling anxious. "
                "Try box breathing (4 counts in, hold 4, out 4) before you start. "
                "Slow your overall pace — give each word its full space."
            ),
        })
    elif stutter_count >= 1:
        tips.append({
            "priority": "medium",
            "icon": "🔁",
            "title": "Minor stuttering detected",
            "detail": (
                f"{stutter_count} repeated word(s) found. "
                "This is common under pressure. Focus on the initial consonant of each word — "
                "a strong, clear start reduces repetition. Practicing with a metronome can also help."
            ),
        })
    else:
        tips.append({
            "priority": "good",
            "icon": "💬",
            "title": "Fluent delivery",
            "detail": "No stuttering detected. Your words flowed smoothly from start to finish.",
        })

    # ── Pronunciation ────────────────────────────────────────────────────────
    if has_target and word_scores:
        poor    = [w for w in word_scores if w["score"] < 0.55]
        mediocre = [w for w in word_scores if 0.55 <= w["score"] < 0.80]
        skipped = [w for w in word_scores if w["status"] == "skipped"]

        if len(poor) >= 3:
            word_str = ", ".join(f'"{w["word"]}"' for w in poor[:5])
            tips.append({
                "priority": "high",
                "icon": "🗣️",
                "title": "Several words need significant work",
                "detail": (
                    f"These words scored poorly: {word_str}. "
                    "Break each into syllables and practise them in isolation before combining. "
                    "Use a pronunciation dictionary (Merriam-Webster or Forvo) to hear the correct sounds, "
                    "then record yourself and compare."
                ),
            })
        elif poor:
            word_str = ", ".join(f'"{w["word"]}"' for w in poor)
            tips.append({
                "priority": "medium",
                "icon": "🗣️",
                "title": "Words to practise",
                "detail": (
                    f"Pay closer attention to: {word_str}. "
                    "Isolate each word, say it slowly three times, then use it in a full sentence."
                ),
            })

        if mediocre and not poor:
            word_str = ", ".join(f'"{w["word"]}"' for w in mediocre[:4])
            tips.append({
                "priority": "medium",
                "icon": "📐",
                "title": "Fine-tune these words",
                "detail": (
                    f"{word_str} were close but not quite there. "
                    "Listen carefully to stress and vowel sounds — often it's just emphasis on the wrong syllable."
                ),
            })

        if skipped:
            word_str = ", ".join(f'"{w["word"]}"' for w in skipped)
            tips.append({
                "priority": "medium",
                "icon": "📝",
                "title": "Words were skipped",
                "detail": (
                    f"You omitted: {word_str}. "
                    "Read the target text again carefully before recording. "
                    "Skipping words can change meaning and sounds unprepared in a live setting."
                ),
            })

        if not poor and not mediocre and not skipped:
            tips.append({
                "priority": "good",
                "icon": "🌟",
                "title": "Excellent pronunciation",
                "detail": (
                    "Every word in the target text was spoken clearly and accurately. "
                    "Try a more challenging passage to keep pushing your skills."
                ),
            })

    # ── Sort and return ──────────────────────────────────────────────────────
    tips.sort(key=lambda t: _PRIORITY_ORDER.get(t["priority"], 9))
    return tips