import { useState, useRef, useCallback } from "react";

const PRESET_SENTENCES = [
  "The early bird catches the worm, but the second mouse gets the cheese.",
  "Whether the weather be fine or whether the weather be not, we'll weather the weather whatever the weather.",
  "She sells seashells by the seashore on the warm summer shore.",
  "I am not afraid of storms, for I am learning how to sail my ship.",
  "The greatest glory in living lies not in never falling, but in rising every time we fall.",
];

const API_URL = "http://localhost:8000/analyze";

// ─── Colour tokens ───────────────────────────────────────────────────────────
const C = {
  bg:        "#0c0e13",
  surface:   "#161820",
  surfaceAlt:"#0f1117",
  border:    "#2a2c35",
  gold:      "#c9a84c",
  goldDim:   "#8a7035",
  text:      "#e8e6df",
  textMid:   "#9e9b94",
  textDim:   "#6e6b62",
  textFaint: "#4e4d48",
  red:       "#e07070",
  green:     "#6dbf8a",
  amber:     "#e8a84c",
};

function scoreColor(score) {
  if (score >= 0.88) return C.green;
  if (score >= 0.72) return C.gold;
  if (score >= 0.50) return C.amber;
  return C.red;
}

function scoreLabel(score, status) {
  if (status === "skipped") return "Skipped";
  if (score >= 0.92) return "Excellent";
  if (score >= 0.80) return "Good";
  if (score >= 0.65) return "Fair";
  if (score >= 0.45) return "Poor";
  return "Missed";
}

function tipBorderColor(priority) {
  if (priority === "high")   return C.red;
  if (priority === "medium") return C.amber;
  return C.green;
}

function getWpmRating(wpm) {
  if (wpm < 100) return { label: "Too slow",        color: C.red };
  if (wpm < 130) return { label: "Measured",         color: C.amber };
  if (wpm < 165) return { label: "Conversational ✓", color: C.green };
  if (wpm < 190) return { label: "Brisk",            color: C.amber };
  return            { label: "Too fast",             color: C.red };
}

/**
 * Loudness band based on avg_db.
 * Typical speech: -20 to -10 dB RMS (after resampling to 16 kHz).
 * Below -30 is too quiet; above -10 may be clipping risk.
 */
function getLoudnessRating(avg_db) {
  if (avg_db < -35) return { label: "Too quiet",   color: C.red };
  if (avg_db < -25) return { label: "A bit soft",  color: C.amber };
  if (avg_db < -10) return { label: "Good level ✓",color: C.green };
  return               { label: "Very loud",       color: C.amber };
}

function getMumbleRating(score) {
  if (score === 0)  return { label: "Crystal clear ✓", color: C.green };
  if (score === 1)  return { label: "Mostly clear",    color: C.green };
  if (score === 2)  return { label: "Some softness",   color: C.amber };
  if (score === 3)  return { label: "Mumbling",        color: C.red };
  return               { label: "Hard to hear",       color: C.red };
}

function formatTime(s) {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

// ─── Keyframes ───────────────────────────────────────────────────────────────
const keyframes = `
@keyframes pulse {
  0%,100% { box-shadow: 0 0 0 8px rgba(192,57,43,0.12), 0 0 0 16px rgba(192,57,43,0.06); }
  50%      { box-shadow: 0 0 0 12px rgba(192,57,43,0.18), 0 0 0 22px rgba(192,57,43,0.08); }
}
@keyframes spin  { to { transform: rotate(360deg); } }
@keyframes rise  { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
@keyframes barIn { from { width: 0; } }

.rise   { animation: rise 0.35s ease forwards; }
select:focus, textarea:focus { border-color: #c9a84c !important; }
.mode-card:hover { transform:translateY(-2px) !important; border-color:#3a3c48 !important; }
.btn-primary:hover:not(:disabled) { filter:brightness(1.08); transform:translateY(-1px); }
.btn-ghost:hover { border-color:#4a4c58; color:#9e9b94; }
.word-row:hover  { background:#151720 !important; }
`;

// ─── Style helpers ────────────────────────────────────────────────────────────
const S = {
  root: {
    minHeight: "100vh",
    background: C.bg,
    color: C.text,
    fontFamily: "'Georgia', serif",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "48px 24px 80px",
  },
  header: { textAlign: "center", marginBottom: "48px" },
  wordmark: {
    fontSize: "11px", letterSpacing: "0.25em", textTransform: "uppercase",
    color: C.gold, fontFamily: "'Courier New', monospace", marginBottom: "12px",
  },
  title:    { fontSize: "38px", fontWeight: "400", color: "#f0ece3", margin: "0 0 10px", letterSpacing: "-0.5px" },
  subtitle: { fontSize: "15px", color: C.textDim, margin: 0, fontFamily: "system-ui, sans-serif" },

  card: {
    background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: "16px", padding: "28px",
    width: "100%", maxWidth: "680px", marginBottom: "20px",
  },
  sectionLabel: {
    fontSize: "10px", letterSpacing: "0.2em", textTransform: "uppercase",
    color: C.gold, fontFamily: "'Courier New', monospace",
    marginBottom: "18px", display: "block",
  },

  modeGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" },
  modeCard: (active) => ({
    background: active ? "#1e1f10" : "#1a1c24",
    border: `1px solid ${active ? C.gold : C.border}`,
    borderRadius: "12px", padding: "20px 16px",
    cursor: "pointer", textAlign: "center",
    transition: "all 0.18s ease",
    transform: active ? "translateY(-1px)" : "none",
  }),
  modeIcon:  { fontSize: "26px", marginBottom: "10px" },
  modeTitle: (a) => ({
    fontSize: "13px", fontWeight: "600",
    color: a ? C.gold : "#b8b4ab",
    fontFamily: "system-ui, sans-serif", letterSpacing: "0.01em", marginBottom: "4px",
  }),
  modeDesc: { fontSize: "11px", color: C.textFaint, fontFamily: "system-ui, sans-serif", lineHeight: "1.4" },

  promptBox: {
    background: C.surfaceAlt, border: `1px solid ${C.border}`,
    borderRadius: "10px", padding: "20px 22px", marginBottom: "0",
  },
  promptText: { fontSize: "20px", lineHeight: "1.65", color: "#d8d4cb", margin: 0, letterSpacing: "0.01em" },

  select: {
    width: "100%", background: C.surfaceAlt, border: `1px solid ${C.border}`,
    borderRadius: "10px", padding: "12px 36px 12px 16px",
    color: "#d8d4cb", fontSize: "14px", fontFamily: "system-ui, sans-serif",
    cursor: "pointer", outline: "none", appearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='%236e6b62' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14L2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat", backgroundPosition: "calc(100% - 14px) center",
    marginBottom: "20px",
  },
  textarea: {
    width: "100%", background: C.surfaceAlt, border: `1px solid ${C.border}`,
    borderRadius: "10px", padding: "14px 16px",
    color: "#d8d4cb", fontSize: "15px", fontFamily: "'Georgia', serif",
    lineHeight: "1.6", resize: "vertical", minHeight: "100px",
    outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
  },

  recordSection: { display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", padding: "8px 0" },
  recordOuter: (rec) => ({
    width: "96px", height: "96px", borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    background: rec ? "radial-gradient(circle,#3d0f0f,#220808)" : "radial-gradient(circle,#1c1e28,#13151d)",
    border: `2px solid ${rec ? "#c0392b" : C.border}`,
    cursor: "pointer", transition: "all 0.2s ease",
    animation: rec ? "pulse 1.8s ease-in-out infinite" : "none",
    boxShadow: rec ? "0 0 0 8px rgba(192,57,43,0.12),0 0 0 16px rgba(192,57,43,0.06)" : "none",
    userSelect: "none",
  }),
  recordDot: (rec) => ({
    width: rec ? "34px" : "40px", height: rec ? "34px" : "40px",
    borderRadius: rec ? "6px" : "50%",
    background: rec ? "#c0392b" : C.gold,
    transition: "all 0.2s ease",
  }),
  timerText: { fontFamily: "'Courier New', monospace", fontSize: "28px", color: "#c0392b", letterSpacing: "0.05em" },
  recordHint: { fontSize: "12px", color: C.textFaint, fontFamily: "system-ui, sans-serif", textAlign: "center" },

  // Metrics
  metricsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px", marginBottom: "24px" },
  volumeGrid:  { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "24px" },
  metricTile: {
    background: C.surfaceAlt, border: `1px solid ${C.border}`,
    borderRadius: "12px", padding: "22px 16px", textAlign: "center",
  },
  metricValue: { fontSize: "40px", fontWeight: "400", display: "block", marginBottom: "6px", fontFamily: "'Georgia', serif" },
  metricLabel: { fontSize: "10px", letterSpacing: "0.18em", textTransform: "uppercase", color: C.textFaint, fontFamily: "'Courier New', monospace" },
  metricSub: { fontSize: "11px", marginTop: "6px", fontFamily: "system-ui, sans-serif" },

  transcriptBox: {
    background: C.surfaceAlt, border: `1px solid ${C.border}`,
    borderRadius: "10px", padding: "20px 22px",
    fontSize: "15px", lineHeight: "1.75", color: C.textMid,
    fontFamily: "'Georgia', serif", marginBottom: "24px",
  },

  // Volume detail bar
  volumeDetailRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 0", borderBottom: `1px solid ${C.border}`,
    fontFamily: "system-ui, sans-serif",
  },
  volumeDetailLabel: { fontSize: "12px", color: C.textDim },
  volumeDetailValue: { fontSize: "13px", fontFamily: "'Courier New', monospace" },

  // Mumbling alert banner
  mumbleAlert: {
    display: "flex", alignItems: "flex-start", gap: "12px",
    background: "#160e08", border: "1px solid #4a2808",
    borderRadius: "10px", padding: "14px 18px", marginBottom: "24px",
  },
  mumbleAlertIcon: { fontSize: "18px", lineHeight: 1, flexShrink: 0, marginTop: "1px" },
  mumbleAlertText: { fontSize: "13px", color: "#d4904a", fontFamily: "system-ui, sans-serif", lineHeight: "1.6" },

  // Word scores
  wordTable: { width: "100%", borderCollapse: "collapse", marginBottom: "8px" },

  // Tips
  tipCard: (priority) => ({
    borderLeft: `3px solid ${tipBorderColor(priority)}`,
    background: C.surfaceAlt,
    borderRadius: "0 10px 10px 0",
    padding: "16px 20px",
    marginBottom: "12px",
  }),
  tipHeader: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" },
  tipIcon:   { fontSize: "18px", lineHeight: 1 },
  tipTitle:  { fontSize: "14px", fontWeight: "600", color: C.text, fontFamily: "system-ui, sans-serif" },
  tipDetail: { fontSize: "13px", color: C.textMid, fontFamily: "system-ui, sans-serif", lineHeight: "1.6", margin: 0 },

  btnPrimary: (dis) => ({
    width: "100%", padding: "14px",
    background: dis ? "#1a1c24" : C.gold,
    color: dis ? "#3a3932" : C.bg,
    border: "none", borderRadius: "10px",
    fontSize: "13px", fontWeight: "700", letterSpacing: "0.12em",
    textTransform: "uppercase", fontFamily: "system-ui, sans-serif",
    cursor: dis ? "not-allowed" : "pointer", transition: "all 0.15s ease",
  }),
  btnGhost: {
    background: "transparent", border: `1px solid ${C.border}`,
    borderRadius: "8px", padding: "10px 22px",
    color: C.textDim, fontSize: "12px", letterSpacing: "0.1em",
    textTransform: "uppercase", fontFamily: "system-ui, sans-serif",
    cursor: "pointer", transition: "all 0.15s ease",
  },
  spinner: {
    display: "inline-block", width: "16px", height: "16px",
    border: `2px solid ${C.bg}`, borderTopColor: "transparent",
    borderRadius: "50%", animation: "spin 0.7s linear infinite",
    marginRight: "8px", verticalAlign: "middle",
  },
  errorBox: {
    background: "#1a0f0f", border: "1px solid #4a1f1f",
    borderRadius: "10px", padding: "14px 18px",
    color: "#e07070", fontSize: "13px", fontFamily: "system-ui, sans-serif", marginBottom: "16px",
  },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function MetricTile({ value, label, sub, color }) {
  return (
    <div style={S.metricTile}>
      <span style={{ ...S.metricValue, color }}>{value}</span>
      <span style={S.metricLabel}>{label}</span>
      {sub && <div style={{ ...S.metricSub, color }}>{sub}</div>}
    </div>
  );
}

/** Horizontal detail row inside the volume card */
function VolumeDetailRow({ label, value, color }) {
  return (
    <div style={S.volumeDetailRow}>
      <span style={S.volumeDetailLabel}>{label}</span>
      <span style={{ ...S.volumeDetailValue, color: color ?? C.textMid }}>{value}</span>
    </div>
  );
}

/**
 * Full volume/clarity breakdown card.
 *
 * Expects `volume` shape from analyze_volume():
 *   { avg_db, volume_std, zcr, spectral_centroid, mumble_score, is_mumbling }
 */
function VolumeCard({ volume }) {
  const loudness = getLoudnessRating(volume.avg_db);
  const mumble   = getMumbleRating(volume.mumble_score);

  // Dynamics: how expressive is the volume variation?
  const dynamicsLabel =
    volume.volume_std < 0.005 ? { label: "Flat — vary your pace",    color: C.red   } :
    volume.volume_std < 0.015 ? { label: "Moderate dynamics",        color: C.amber } :
                                { label: "Expressive ✓",             color: C.green };

  // Articulation: zero-crossing rate as consonant sharpness proxy
  const articLabel =
    volume.zcr < 0.04 ? { label: "Soft consonants",   color: C.amber } :
    volume.zcr < 0.08 ? { label: "Clear articulation ✓", color: C.green } :
                        { label: "Sharp delivery ✓",   color: C.green };

  return (
    <>
      {/* Top two tiles: loudness + mumble score */}
      <div style={S.volumeGrid}>
        <MetricTile
          value={`${volume.avg_db} dB`}
          label="Avg Loudness"
          sub={loudness.label}
          color={loudness.color}
        />
        <MetricTile
          value={`${volume.mumble_score} / 5`}
          label="Clarity Score"
          sub={mumble.label}
          color={mumble.color}
        />
      </div>

      {/* Mumbling alert banner — only shown when flagged */}
      {volume.is_mumbling && (
        <div style={S.mumbleAlert}>
          <span style={S.mumbleAlertIcon}>⚠️</span>
          <p style={{ ...S.mumbleAlertText, margin: 0 }}>
            <strong style={{ color: "#e8a84c" }}>Mumbling detected.</strong>{" "}
            Try speaking up, opening your mouth wider, and hitting consonants harder — especially
            at the ends of words. Recording yourself in a quieter environment can also help.
          </p>
        </div>
      )}

      {/* Detail breakdown */}
      <div style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "4px 18px", marginBottom: "24px" }}>
        <VolumeDetailRow
          label="Volume dynamics"
          value={dynamicsLabel.label}
          color={dynamicsLabel.color}
        />
        <VolumeDetailRow
          label="Articulation (ZCR)"
          value={articLabel.label}
          color={articLabel.color}
        />
        <VolumeDetailRow
          label="Spectral brightness"
          value={
            volume.spectral_centroid < 1500
              ? "Muffled — speak more forward"
              : volume.spectral_centroid < 2500
              ? "Balanced ✓"
              : "Bright & clear ✓"
          }
          color={
            volume.spectral_centroid < 1500 ? C.amber :
            volume.spectral_centroid < 2500 ? C.green : C.green
          }
        />
        <VolumeDetailRow
          label="Raw RMS std dev"
          value={volume.volume_std.toFixed(4)}
        />
      </div>
    </>
  );
}

function WordScoreRow({ entry, rank }) {
  const pct   = Math.round(entry.score * 100);
  const color = scoreColor(entry.score);
  const label = scoreLabel(entry.score, entry.status);
  const diff  = entry.spoken && entry.spoken !== entry.word && entry.spoken !== "(skipped)";

  return (
    <tr
      className="word-row"
      style={{
        background: "transparent",
        borderBottom: `1px solid ${C.border}`,
        transition: "background 0.12s",
      }}
    >
      <td style={{ padding: "10px 12px 10px 0", width: "28px", color: C.textFaint, fontFamily: "'Courier New', monospace", fontSize: "11px", verticalAlign: "middle" }}>
        {rank}
      </td>
      <td style={{ padding: "10px 16px 10px 0", fontFamily: "'Georgia', serif", fontSize: "15px", color: C.text, verticalAlign: "middle", minWidth: "120px" }}>
        {entry.word}
        {diff && (
          <span style={{ display: "block", fontSize: "11px", color: C.textDim, fontFamily: "system-ui, sans-serif", marginTop: "2px" }}>
            heard: <em>"{entry.spoken}"</em>
          </span>
        )}
        {entry.status === "skipped" && (
          <span style={{ display: "block", fontSize: "11px", color: C.red, fontFamily: "system-ui, sans-serif", marginTop: "2px" }}>
            not spoken
          </span>
        )}
      </td>
      <td style={{ padding: "10px 16px 10px 0", verticalAlign: "middle" }}>
        <div style={{ background: C.border, borderRadius: "4px", height: "6px", width: "100%", minWidth: "80px", overflow: "hidden" }}>
          <div
            style={{
              height: "100%", borderRadius: "4px",
              width: `${pct}%`, background: color,
              animation: "barIn 0.5s ease forwards",
            }}
          />
        </div>
      </td>
      <td style={{ padding: "10px 16px 10px 0", fontFamily: "'Courier New', monospace", fontSize: "12px", color, verticalAlign: "middle", whiteSpace: "nowrap", width: "42px" }}>
        {pct}%
      </td>
      <td style={{ padding: "10px 0", verticalAlign: "middle" }}>
        <span style={{
          fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase",
          fontFamily: "'Courier New', monospace", color,
        }}>
          {label}
        </span>
      </td>
    </tr>
  );
}

function TipCard({ tip }) {
  return (
    <div style={S.tipCard(tip.priority)}>
      <div style={S.tipHeader}>
        <span style={S.tipIcon}>{tip.icon}</span>
        <span style={S.tipTitle}>{tip.title}</span>
      </div>
      <p style={S.tipDetail}>{tip.detail}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SpeechCoach() {
  const [mode,           setMode]          = useState(null);
  const [selectedPreset, setSelectedPreset]= useState(0);
  const [customText,     setCustomText]    = useState("");
  const [recording,      setRecording]     = useState(false);
  const [audioBlob,      setAudioBlob]     = useState(null);
  const [recordingTime,  setRecordingTime] = useState(0);
  const [results,        setResults]       = useState(null);
  const [loading,        setLoading]       = useState(false);
  const [error,          setError]         = useState(null);
  const [showAllWords,   setShowAllWords]  = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef        = useRef([]);
  const timerRef         = useRef(null);

  // ── Recording ──────────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    setError(null); setAudioBlob(null); setResults(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        setAudioBlob(new Blob(chunksRef.current, { type: "audio/webm" }));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      setRecording(true); setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      setError("Microphone access denied. Please allow microphone permissions and try again.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    clearInterval(timerRef.current);
  }, []);

  // ── Analysis ───────────────────────────────────────────────────────────────
  const analyze = useCallback(async () => {
    if (!audioBlob) return;
    setLoading(true); setError(null);

    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");
    if (promptText) formData.append("target_text", promptText);

    try {
      const res = await fetch(API_URL, { method: "POST", body: formData });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      console.log("API response:", data);   // ← add this
      setResults(data);
      
    } catch (err) {
      setError(
        err.message.includes("Failed to fetch")
          ? "Cannot reach the backend. Make sure your FastAPI server is running on port 8000."
          : err.message
      );
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioBlob]);

  const reset = () => {
    setAudioBlob(null); setResults(null);
    setError(null); setRecordingTime(0); setShowAllWords(false);
  };

  const promptText =
    mode === "preset"  ? PRESET_SENTENCES[selectedPreset] :
    mode === "custom"  ? customText : null;

  // ── Derived display data ───────────────────────────────────────────────────
  const wpmRating    = results ? getWpmRating(results.wpm) : null;
  const wordScores   = results?.word_scores ?? [];
  const visibleWords = showAllWords ? wordScores : wordScores.slice(0, 8);
  const hasMore      = wordScores.length > 8;

  const stutterColor =
    !results ? C.textFaint :
    results.stutter_count === 0 ? C.green :
    results.stutter_count < 3  ? C.amber : C.red;
  const stutterSub =
    !results ? "" :
    results.stutter_count === 0 ? "None detected" :
    results.stutter_count < 3  ? "Minor" : "Focus here";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      <style>{keyframes}</style>

      {/* Header */}
      <div style={S.header}>
        <p style={S.wordmark}>● Speech Analysis</p>
        <h1 style={S.title}>Voice Coach</h1>
        <p style={S.subtitle}>Record yourself speaking and get instant feedback on pace, clarity, and delivery.</p>
      </div>

      {/* ── 01 Mode ── */}
      <div style={S.card}>
        <span style={S.sectionLabel}>01 — Choose your mode</span>
        <div style={S.modeGrid}>
          {[
            { key: "preset",    icon: "📋", title: "Prompt",    desc: "Read one of our curated sentences" },
            { key: "custom",    icon: "✏️",  title: "Custom",    desc: "Write your own passage to practise" },
            { key: "freestyle", icon: "🎙️",  title: "Freestyle", desc: "Speak freely on any topic" },
          ].map(({ key, icon, title, desc }) => (
            <div
              key={key}
              className="mode-card"
              style={S.modeCard(mode === key)}
              onClick={() => { setMode(key); reset(); }}
            >
              <div style={S.modeIcon}>{icon}</div>
              <div style={S.modeTitle(mode === key)}>{title}</div>
              <div style={S.modeDesc}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 02 Sentence ── */}
      {mode && mode !== "freestyle" && (
        <div style={S.card}>
          <span style={S.sectionLabel}>02 — Your sentence</span>

          {mode === "preset" && (
            <>
              <select style={S.select} value={selectedPreset}
                onChange={(e) => { setSelectedPreset(Number(e.target.value)); reset(); }}>
                {PRESET_SENTENCES.map((s, i) => (
                  <option key={i} value={i}>Sentence {i + 1}</option>
                ))}
              </select>
              <div style={S.promptBox}>
                <p style={S.promptText}>{PRESET_SENTENCES[selectedPreset]}</p>
              </div>
            </>
          )}

          {mode === "custom" && (
            <>
              <textarea
                style={S.textarea}
                placeholder="Type the sentence or passage you want to practise…"
                value={customText}
                onChange={(e) => { setCustomText(e.target.value); reset(); }}
                rows={4}
              />
              {customText && (
                <div style={{ ...S.promptBox, marginTop: "14px" }}>
                  <p style={S.promptText}>{customText}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── 03 Record ── */}
      {mode && (mode !== "custom" || customText.trim()) && !results && (
        <div style={S.card}>
          <span style={S.sectionLabel}>
            {mode === "freestyle" ? "02" : "03"} — Record
          </span>
          <div style={S.recordSection}>
            <div
              style={S.recordOuter(recording)}
              onClick={recording ? stopRecording : startRecording}
              title={recording ? "Click to stop" : "Click to start recording"}
            >
              <div style={S.recordDot(recording)} />
            </div>

            {recording && <span style={S.timerText}>{formatTime(recordingTime)}</span>}

            <p style={S.recordHint}>
              {recording
                ? "Recording… click the button to stop"
                : audioBlob
                ? "Recording ready — analyse it or re-record"
                : "Click the button to start recording"}
            </p>

            {error && <div style={S.errorBox}>{error}</div>}

            {audioBlob && !recording && (
              <>
                <audio
                  controls
                  src={URL.createObjectURL(audioBlob)}
                  style={{ width: "100%", height: "36px", filter: "invert(0.85) hue-rotate(180deg)" }}
                />
                <div style={{ display: "flex", gap: "10px", width: "100%" }}>
                  <button className="btn-ghost" style={{ ...S.btnGhost, flex: "0 0 auto" }} onClick={reset}>
                    Re-record
                  </button>
                  <button
                    disabled={loading}
                    className="btn-primary"
                    style={{ ...S.btnPrimary(loading), flex: 1 }}
                    onClick={analyze}
                  >
                    {loading ? <><span style={S.spinner} />Analysing…</> : "Analyse Recording"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {results && (
        <div style={S.card} className="rise">

          {/* ── Main metrics row ── */}
          <span style={S.sectionLabel}>Results</span>
          <div style={S.metricsGrid}>
            <MetricTile
              value={results.wpm}
              label="Words / Min"
              sub={wpmRating.label}
              color={wpmRating.color}
            />
            <MetricTile
              value={results.filler_count}
              label="Filler Words"
              sub={results.filler_count === 0 ? "None detected" : results.filler_count < 3 ? "A few" : "Reduce these"}
              color={results.filler_count === 0 ? C.green : results.filler_count < 3 ? C.amber : C.red}
            />
            <MetricTile
              value={results.stutter_count}
              label="Stutters"
              sub={stutterSub}
              color={stutterColor}
            />
          </div>

          {/* ── Filler breakdown ── */}
          {results.filler_words?.length > 0 && (
            <div style={{ marginBottom: "24px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {results.filler_words.map((f) => (
                <span
                  key={f.word}
                  style={{
                    background: "#1f1610", border: "1px solid #4a2f10",
                    borderRadius: "6px", padding: "4px 10px",
                    fontSize: "12px", color: C.amber, fontFamily: "system-ui, sans-serif",
                  }}
                >
                  "{f.word}" ×{f.count}
                </span>
              ))}
            </div>
          )}

          {/* ── Volume & Clarity ── */}
          {results.volume && (
            <>
              <span style={{ ...S.sectionLabel, marginBottom: "16px" }}>Volume &amp; Clarity</span>
              <VolumeCard volume={results.volume} />
            </>
          )}

          {/* ── Transcript ── */}
          <span style={{ ...S.sectionLabel, marginBottom: "12px" }}>Transcript</span>
          <div style={S.transcriptBox}>{results.transcript}</div>

          {/* ── Word pronunciation ranking ── */}
          {wordScores.length > 0 && (
            <>
              <span style={{ ...S.sectionLabel, marginBottom: "14px" }}>
                Word Pronunciation — Worst to Best
              </span>
              <table style={S.wordTable}>
                <tbody>
                  {visibleWords.map((entry, i) => (
                    <WordScoreRow key={entry.word + i} entry={entry} rank={i + 1} />
                  ))}
                </tbody>
              </table>

              {hasMore && (
                <button
                  className="btn-ghost"
                  style={{ ...S.btnGhost, marginTop: "12px", width: "100%" }}
                  onClick={() => setShowAllWords((v) => !v)}
                >
                  {showAllWords ? `Show less` : `Show all ${wordScores.length} words`}
                </button>
              )}
            </>
          )}

          {/* ── Tips ── */}
          {results.tips?.length > 0 && (
            <div style={{ marginTop: "28px" }}>
              <span style={{ ...S.sectionLabel, marginBottom: "16px" }}>Focus Areas</span>
              {results.tips.map((tip, i) => (
                <TipCard key={i} tip={tip} />
              ))}
            </div>
          )}

          {/* ── Target ── */}
          {promptText && (
            <div style={{ marginTop: "24px" }}>
              <span style={{ ...S.sectionLabel, marginBottom: "12px" }}>Target</span>
              <div style={{ ...S.transcriptBox, color: "#5a5850" }}>{promptText}</div>
            </div>
          )}

          <button className="btn-ghost" style={S.btnGhost} onClick={reset}>
            Record again
          </button>
        </div>
      )}
    </div>
  );
}