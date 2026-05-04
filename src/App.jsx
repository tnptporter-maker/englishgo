import { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, deleteUser,
} from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAtCebZRWhwVnWfOREs1sU9BNyvQHPDtGI",
  authDomain: "quak-f5907.firebaseapp.com",
  projectId: "quak-f5907",
  storageBucket: "quak-f5907.firebasestorage.app",
  messagingSenderId: "774370737638",
  appId: "1:774370737638:web:1289dba637975707ad6a27",
};
const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
const googleProvider = new GoogleAuthProvider();

import duckImg from "./assets/duck.png";
import duck2Img from "./assets/duck2.png";

const SHEET_ID = "1njMTapDCnpFP4mj6U0EEHPGumHfbBVWrljrX99_zUg0";
const REVIEW_INTERVALS = [1, 3, 7, 14, 30, 90];

// ─── 노란색 중심 디자인 토큰 ──────────────────────────────────────────────────
const C = {
  bg: "#FFFDF5",           // 따뜻한 아이보리 배경
  card: "#FFFFFF",
  primary: "#F59E0B",      // 노란색 주조
  primaryDark: "#D97706",
  primaryLight: "#FEF3C7",
  accent: "#F97316",       // 주황색 포인트
  accentLight: "#FFF7ED",
  green: "#22C55E",
  greenLight: "#F0FDF4",
  greenDark: "#16A34A",
  text: "#1C1917",
  sub: "#78716C",
  border: "#E7E5E4",
  borderLight: "#F5F5F4",
  success: "#22C55E",
  successBg: "#F0FDF4",
  successBorder: "#86EFAC",
  error: "#EF4444",
  errorBg: "#FEF2F2",
  errorBorder: "#FCA5A5",
  done: "#16A34A",
  doneBg: "#DCFCE7",
  doneBorder: "#86EFAC",
};

const S = {
  page: {
    position: "fixed", inset: 0, background: C.bg, overflowY: "auto",
    fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif",
  },
  inner: { maxWidth: 480, margin: "0 auto", padding: "20px 16px 100px" },
  card: {
    background: C.card, borderRadius: 16,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06),0 4px 16px rgba(0,0,0,0.04)",
    padding: "16px 20px", marginBottom: 12,
  },
  btn: {
    display: "block", width: "100%", padding: "14px 20px", borderRadius: 12,
    border: "none", fontWeight: 700, fontSize: 15, cursor: "pointer",
    transition: "all 0.15s", textAlign: "center",
  },
  btnPrimary: { background: C.primary, color: "#fff" },
  btnSecondary: { background: C.primaryLight, color: C.primaryDark },
  btnGhost: { background: "transparent", color: C.sub, border: `1.5px solid ${C.border}` },
  btnDanger: { background: "#FEE2E2", color: "#EF4444" },
  btnGreen: { background: C.green, color: "#fff" },
  input: {
    width: "100%", padding: "12px 14px", borderRadius: 10,
    border: `1.5px solid ${C.border}`, fontSize: 15, outline: "none",
    boxSizing: "border-box", background: "#fff", color: C.text,
    fontFamily: "inherit", resize: "none",
  },
};

// ─── Utilities ─────────────────────────────────────────────────────────────────
const normalize = (s) =>
  (s || "").toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
const checkCorrect = (expected, given) => normalize(expected) === normalize(given);
const today = () => new Date().toISOString().slice(0, 10);
const speak = (text) => {
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US"; u.rate = 0.9;
  window.speechSynthesis.speak(u);
};
const stopSpeak = () => window.speechSynthesis.cancel();
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
const calcNextReview = (level) => {
  const days = REVIEW_INTERVALS[Math.min(level, REVIEW_INTERVALS.length - 1)];
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const fetchSheet = async (sheetName) => {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  const text = await res.text();
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim());
  return lines.slice(1).map((line) => {
    const vals = []; let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === "," && !inQ) { vals.push(cur); cur = ""; }
      else cur += ch;
    }
    vals.push(cur);
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] || "").trim()]));
  });
};

const splitIntoChunks = async (sentence) => {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", max_tokens: 300,
        messages: [{ role: "user", content: `Split this English sentence into 3-6 meaningful chunks for a language learning app. Return ONLY a JSON array of strings, no explanation.\nSentence: "${sentence}"` }]
      })
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || "";
    const match = text.match(/\[.*\]/s);
    if (match) {
      const chunks = JSON.parse(match[0]);
      if (Array.isArray(chunks) && chunks.length > 1) return chunks;
    }
  } catch {}
  return sentence.split(" ").reduce((acc, w, i) => {
    const g = Math.floor(i / 2); acc[g] = acc[g] ? acc[g] + " " + w : w; return acc;
  }, []);
};

const DEFAULT_DATA = { progress: {}, studyDays: [], quizProgress: {}, favorites: {}, diaries: [], stepDone: {} };
const loadUserData = async (uid) => {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { ...DEFAULT_DATA, ...snap.data() } : { ...DEFAULT_DATA };
};

// ─── useMic ────────────────────────────────────────────────────────────────────
function useMic(onResult) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const restartRef = useRef(null);
  const activeRef = useRef(false);

  const stopMic = useCallback(() => {
    activeRef.current = false;
    clearTimeout(restartRef.current);
    try { recRef.current?.stop(); } catch {}
    setListening(false);
  }, []);

  const startMic = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert("Chrome 브라우저를 사용해주세요.");
    stopSpeak();
    activeRef.current = true;
    const rec = new SR();
    rec.lang = "en-US"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e) => {
      const t = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      onResult(t);
    };
    rec.onend = () => {
      if (activeRef.current) restartRef.current = setTimeout(() => { try { rec.start(); } catch {} }, 100);
      else setListening(false);
    };
    rec.onerror = (err) => {
      if (err.error === "no-speech" || err.error === "audio-capture" || err.error === "network") {
        if (activeRef.current) restartRef.current = setTimeout(() => { try { rec.start(); } catch {} }, 100);
      }
    };
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch {}
  }, [onResult]);

  useEffect(() => () => stopMic(), [stopMic]);
  return { listening, startMic, stopMic };
}

// ─── ResultCard (스피커 삭제, 내 답 삭제, 가운데 정렬) ────────────────────────
function ResultCard({ correct, english }) {
  return (
    <div style={{
      background: correct ? C.accentLight : C.errorBg,
      border: `1.5px solid ${correct ? C.accent : C.errorBorder}`,
      borderRadius: 12, padding: "16px", marginTop: 12, textAlign: "center",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontWeight: 700, color: correct ? C.accent : C.error, fontSize: 20 }}>
          {correct ? "정답!" : "오답"}
        </span>
      </div>
      <div style={{ color: C.text, fontWeight: 600, fontSize: 15 }}>{english}</div>
    </div>
  );
}

// ─── Header (뒤로 버튼 옆에 제목 배치) ────────────────────────────────────────
function Header({ title, onBack, onQuit }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, minHeight: 44 }}>
      {onBack && (
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: C.text, padding: "4px 0", lineHeight: 1, flexShrink: 0 }}>←</button>
      )}
      {onQuit && !onBack && (
        <div style={{ width: 22 }} />
      )}
      {title && <span style={{ fontWeight: 700, fontSize: 16, color: C.text, flex: 1, lineHeight: 1.3, textAlign: "left" }}>{title}</span>}
      {onQuit && (
        <button onClick={onQuit} style={{ ...S.btn, ...S.btnDanger, width: "auto", padding: "8px 14px", fontSize: 13, flexShrink: 0 }}>그만하기</button>
      )}
    </div>
  );
}

// ─── ProgressBar (더 잘 보이는 색) ────────────────────────────────────────────
function ProgressBar({ current, total }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>{current} / {total}</span>
        <span style={{ fontSize: 12, color: C.primaryDark, fontWeight: 700 }}>{pct}%</span>
      </div>
      <div style={{ height: 8, background: "#E7E5E4", borderRadius: 99 }}>
        <div style={{ height: "100%", background: C.primary, borderRadius: 99, width: `${pct}%`, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

function Modal({ visible, title, desc, buttons }) {
  if (!visible) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "28px 24px", maxWidth: 340, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: C.text, marginBottom: 8 }}>{title}</div>
        <div style={{ color: C.sub, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>{desc}</div>
        <div style={{ display: "flex", gap: 10 }}>
          {buttons.map((b, i) => (
            <button key={i} onClick={b.onClick} style={{ ...S.btn, flex: 1, ...(b.primary ? S.btnPrimary : S.btnGhost) }}>{b.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Badge({ label, color = C.primaryDark, bg = C.primaryLight }) {
  return <span style={{ background: bg, color, fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "2px 8px" }}>{label}</span>;
}

// ─── QuizCoreWithIdx (다음 버튼 화살표 삭제, ResultCard 업데이트) ──────────────
function QuizCoreWithIdx({ rawItems, initIdx = 0, onResult, onIdxChange, onDone, screenTitle }) {
  const [shuffledItems] = useState(() => shuffle(rawItems));
  const [idx, setIdx] = useState(initIdx);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const curItem = shuffledItems[idx];

  useEffect(() => { onIdxChange?.(idx); }, [idx]);

  const { listening, startMic, stopMic } = useMic((text) => setAnswer(text));

  const handleSubmit = () => {
    if (!answer.trim()) return;
    stopMic();
    const correct = checkCorrect(curItem.English, answer);
    setResult(correct); setSubmitted(true);
    onResult?.(curItem.ItemID, correct);
  };

  const handleNext = () => {
    stopMic(); setAnswer(""); setResult(null); setSubmitted(false);
    if (idx + 1 < shuffledItems.length) setIdx(idx + 1);
    else onDone?.();
  };

  if (!curItem) return null;

  return (
    <div>
      <ProgressBar current={idx} total={shuffledItems.length} />
      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>한국어</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.text, lineHeight: 1.6, marginBottom: 14 }}>{curItem.Korean}</div>
        <button onClick={() => speak(curItem.English)} style={{ background: C.primaryLight, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, color: C.primaryDark, fontWeight: 600 }}>🔊 정답 듣기</button>
      </div>
      <button onClick={listening ? stopMic : startMic} style={{ ...S.btn, background: listening ? C.accent : C.primary, color: "#fff", marginBottom: 12, fontSize: 16, padding: "16px" }}>
        {listening ? "⏹ 녹음 중지" : "🎤 영어로 말하기"}
      </button>
      <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="또는 직접 영어로 입력하세요"
        style={{ ...S.input, minHeight: 72, marginBottom: 12, display: "block" }} />
      {!submitted
        ? <button onClick={handleSubmit} disabled={!answer.trim()} style={{ ...S.btn, ...S.btnPrimary, opacity: answer.trim() ? 1 : 0.5 }}>제출</button>
        : <>
          <ResultCard correct={result} english={curItem.English} />
          <button onClick={handleNext} style={{ ...S.btn, ...S.btnPrimary, marginTop: 12 }}>
            {idx + 1 < shuffledItems.length ? "다음" : "완료"}
          </button>
        </>}
    </div>
  );
}

function QuizCore({ rawItems, onResult, onDone }) {
  return <QuizCoreWithIdx rawItems={rawItems} onResult={onResult} onDone={onDone} />;
}

// ════════════════════════════════════════════════════════════════════════════════
// SCREENS
// ════════════════════════════════════════════════════════════════════════════════

function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const handleGoogle = async () => {
    setLoading(true);
    try { await signInWithPopup(auth, googleProvider); }
    catch (e) { alert("로그인 실패: " + e.message); }
    finally { setLoading(false); }
  };
  return (
    <div style={{ ...S.page, background: "#F59E0B", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", padding: "0 32px", width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <img src={duckImg} alt="QUAK" style={{ width: 120, height: 120, objectFit: "contain", marginBottom: 32, filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.2))" }} />
        <div style={{ color: "#fff", fontSize: 40, fontWeight: 900, letterSpacing: 2, marginBottom: 32 }}>QUAK</div>
        <button onClick={handleGoogle} disabled={loading} style={{ ...S.btn, background: "#fff", color: C.text, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", fontSize: 15, padding: "16px 32px" }}>
          {loading ? "로그인 중..." : "Google로 시작하기"}
        </button>
      </div>
    </div>
  );
}

// ─── HomeScreen ────────────────────────────────────────────────────────────────
function HomeScreen({ go, userData, categories, sources, lessons, items, user }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { progress = {}, studyDays = [], quizProgress = {}, favorites = {}, diaries = [] } = userData;

  const todayLesson = (() => {
    if (!lessons.length) return null;
    const inProgress = lessons.find((l) => {
      const key = `${l.LessonID}_${l.SourceID}`;
      const p = quizProgress[key];
      return p && p !== "done";
    });
    if (inProgress) return inProgress;
    const doneKeys = Object.entries(quizProgress).filter(([, v]) => v === "done").map(([k]) => k);
    if (doneKeys.length) {
      for (const key of doneKeys) {
        const [lessonId, sourceId] = key.split("_");
        const srcLessons = lessons.filter((l) => l.SourceID === sourceId).sort((a, b) => Number(a.Order) - Number(b.Order));
        const idx = srcLessons.findIndex((l) => l.LessonID === lessonId);
        if (idx >= 0 && idx + 1 < srcLessons.length) {
          const next = srcLessons[idx + 1];
          if (quizProgress[`${next.LessonID}_${next.SourceID}`] !== "done") return next;
        }
      }
    }
    return lessons[0];
  })();

  const todayLessonSource = todayLesson ? sources.find((s) => s.SourceID === todayLesson.SourceID) : null;
  const reviewCount = Object.values(progress).filter((p) => p.nextReview && p.nextReview <= today()).length;
  const favCount = Object.keys(favorites).length;

  // 오늘의 레슨 클릭: 진행중이면 바로 해당 화면으로, 아니면 lessonSteps로
  const handleTodayLesson = () => {
    if (!todayLesson) return;
    const key = `${todayLesson.LessonID}_${todayLesson.SourceID}`;
    const qp = quizProgress[key];
    if (qp && qp !== "done") {
      // 진행 중인 화면으로 바로 이동 (resume: true → 해당 화면에서 팝업 뜸)
      let screen = "stepQuiz";
      if (qp.startsWith("preview_")) screen = "stepRead";
      else if (qp.startsWith("build_")) screen = "stepBuild";
      go(screen, { lessonId: todayLesson.LessonID, sourceId: todayLesson.SourceID, resume: true });
    } else {
      go("lessonSteps", { lessonId: todayLesson.LessonID, sourceId: todayLesson.SourceID });
    }
  };

  const catGroups = categories.map((cat) => ({
    cat,
    srcs: sources.filter((s) => s.CategoryID === cat.CategoryID),
  })).filter((g) => g.srcs.length);

  const handleDeleteAccount = async () => {
    if (!window.confirm("정말로 탈퇴하시겠어요? 모든 데이터가 삭제됩니다.")) return;
    try { await deleteUser(auth.currentUser); }
    catch (e) { alert("탈퇴 실패. 재로그인 후 시도해주세요."); }
  };

  return (
    <div style={S.page}>
      <div style={S.inner}>
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ fontWeight: 900, fontSize: 26, color: C.text, letterSpacing: 1 }}>QUAK</div>
          <div style={{ position: "relative" }}>
            <img src={user?.photoURL || "./assets/profile.jpg"} alt="profile" onClick={() => setMenuOpen((v) => !v)}
              style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", cursor: "pointer", border: `2.5px solid ${C.primary}` }} />
            {menuOpen && (
              <div style={{ position: "absolute", right: 0, top: 48, background: "#fff", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", padding: 8, minWidth: 140, zIndex: 100 }}>
                <button onClick={() => { setMenuOpen(false); signOut(auth); }} style={{ display: "block", width: "100%", padding: "10px 16px", background: "none", border: "none", textAlign: "left", cursor: "pointer", fontSize: 14, color: C.text, borderRadius: 8 }}>로그아웃</button>
                <button onClick={() => { setMenuOpen(false); handleDeleteAccount(); }} style={{ display: "block", width: "100%", padding: "10px 16px", background: "none", border: "none", textAlign: "left", cursor: "pointer", fontSize: 14, color: "#EF4444", borderRadius: 8 }}>회원 탈퇴</button>
              </div>
            )}
          </div>
        </div>

        {/* 통계 카드 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
          {[
            { label: "학습일", value: studyDays.length, icon: "📅", onClick: () => go("calendar"), highlight: false },
            { label: "복습", value: reviewCount, icon: "🔄", onClick: reviewCount > 0 ? () => go("review") : null, highlight: reviewCount > 0 },
            { label: "저장", value: favCount, icon: "⭐", onClick: favCount > 0 ? () => go("favoriteList") : null, highlight: false },
          ].map((s, i) => (
            <div key={i} onClick={s.onClick} style={{
              ...S.card, marginBottom: 0, textAlign: "center", cursor: s.onClick ? "pointer" : "default",
              padding: "10px 5px",
              border: s.highlight ? `2px solid ${C.accent}` : `1.5px solid ${C.border}`,
              background: s.highlight ? C.accentLight : C.card,
              display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 90,
            }}>
              <div style={{ fontSize: 20 }}>{s.icon}</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 20, color: s.highlight ? C.accent : C.primary, marginBottom: 2 }}>{s.value}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.sub }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* 오늘의 레슨 */}
        {todayLesson && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, marginBottom: 8 }}>오늘의 레슨</div>
            <div onClick={handleTodayLesson}
              style={{ ...S.card, marginBottom: 0, cursor: "pointer", background: "linear-gradient(135deg,#F59E0B,#F97316)", color: "#fff" }}>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4 }}>{todayLessonSource?.Name}</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>{todayLesson.Title}</div>
              <div style={{ display: "inline-block", background: "rgba(255,255,255,0.25)", borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 700 }}>학습 시작</div>
            </div>
          </div>
        )}

        {/* 학습 선택 */}
        <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, marginBottom: 8 }}>학습 선택</div>
        {catGroups.map(({ cat, srcs }) => (
          <div key={cat.CategoryID} onClick={() => go("lesson", { catId: cat.CategoryID })}
            style={{ ...S.card, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15, color: C.text }}>{cat.Name}</div>
              <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{srcs.length}개 교재</div>
            </div>
            <span style={{ color: C.sub, fontSize: 20 }}>›</span>
          </div>
        ))}

        {/* 다이어리 */}
        {diaries.length > 0 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, marginBottom: 8 }}>내 다이어리</div>
            <div onClick={() => go("diaryList")} style={{ ...S.card, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: C.text }}>📔 다이어리</div>
                <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{diaries.length}개 작성됨</div>
              </div>
              <span style={{ color: C.sub, fontSize: 20 }}>›</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CalendarScreen({ go, userData }) {
  const { studyDays = [] } = userData;
  const [monthOffset, setMonthOffset] = useState(0);
  const base = new Date(); base.setMonth(base.getMonth() + monthOffset);
  const year = base.getFullYear(); const month = base.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array(firstDay).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));
  return (
    <div style={S.page}><div style={S.inner}>
      <Header title="학습 달력" onBack={() => go("home")} />
      <div style={{ ...S.card, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <button onClick={() => setMonthOffset((v) => v - 1)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>‹</button>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{year}년 {month + 1}월</span>
          <button onClick={() => setMonthOffset((v) => v + 1)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 8 }}>
          {["일","월","화","수","목","금","토"].map((d) => <div key={d} style={{ fontSize: 11, color: C.sub, fontWeight: 700, padding: "4px 0" }}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const ds = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
            const studied = studyDays.includes(ds); const isToday = ds === today();
            return <div key={i} style={{ aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", fontSize: 13, fontWeight: studied ? 700 : 400, background: studied ? C.primary : isToday ? C.primaryLight : "transparent", color: studied ? "#fff" : isToday ? C.primaryDark : C.text }}>{d}</div>;
          })}
        </div>
      </div>
      <div style={{ ...S.card, textAlign: "center" }}>
        <div style={{ fontSize: 32, fontWeight: 900, color: C.primary }}>{studyDays.length}</div>
        <div style={{ color: C.sub, fontSize: 14 }}>총 학습일</div>
      </div>
    </div></div>
  );
}

function LessonScreen({ go, nav, sources, lessons, items, userData }) {
  const { sourceId, catId } = nav;
  const { quizProgress = {}, progress = {} } = userData;

  // sourceId가 있으면 레슨 목록, 없으면 교재 목록 표시
  if (!sourceId) {
    const catSources = sources.filter((s) => s.CategoryID === catId);
    return (
      <div style={S.page}><div style={S.inner}>
        <Header title="교재 선택" onBack={() => go("home")} />
        {catSources.map((src) => (
          <div key={src.SourceID} onClick={() => go("lesson", { sourceId: src.SourceID, catId })}
            style={{ ...S.card, cursor: "pointer" }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: C.text, textAlign: "left" }}>{src.Name}</div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 2, textAlign: "left" }}>{lessons.filter((l) => l.SourceID === src.SourceID).length}개 레슨</div>
          </div>
        ))}
      </div></div>
    );
  }

  const source = sources.find((s) => s.SourceID === sourceId);
  const srcLessons = lessons.filter((l) => l.SourceID === sourceId).sort((a, b) => Number(a.Order) - Number(b.Order));
  return (
    <div style={S.page}><div style={S.inner}>
      <Header title={source?.Name} onBack={() => go("lesson", { catId })} />
      {srcLessons.map((l) => {
        const key = `${l.LessonID}_${l.SourceID}`; const qp = quizProgress[key];
        const lessonItems = items.filter((it) => it.LessonID === l.LessonID);
        const studiedCount = lessonItems.filter((it) => progress[it.ItemID]).length;
        const isDone = qp === "done"; const isInProgress = qp && qp !== "done";
        return (
          <div key={l.LessonID} onClick={() => go("lessonSteps", { lessonId: l.LessonID, sourceId, catId })}
            style={{ ...S.card, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: C.text, marginBottom: 4 }}>{l.Title}</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: C.sub }}>{lessonItems.length}문장</span>
                {studiedCount > 0 && <span style={{ fontSize: 12, color: C.primaryDark }}>({studiedCount}개 학습됨)</span>}
                {isDone && <Badge label="완료" color={C.done} bg={C.doneBg} />}
                {isInProgress && <Badge label="진행중" color={C.accent} bg={C.accentLight} />}
              </div>
            </div>
            <span style={{ color: C.sub, fontSize: 20 }}>›</span>
          </div>
        );
      })}
    </div></div>
  );
}

function LessonStepsScreen({ go, nav, lessons, sources, userData, setUserData }) {
  const { lessonId, sourceId } = nav;
  const lesson = lessons.find((l) => l.LessonID === lessonId);
  const source = sources.find((s) => s.SourceID === sourceId);
  const { quizProgress = {}, stepDone = {} } = userData;
  const key = `${lessonId}_${sourceId}`;
  const qp = quizProgress[key]; const sd = stepDone[key] || {};
  const [resumeModal, setResumeModal] = useState(false);

  useEffect(() => { if (qp && qp !== "done" && !nav.skipResume) setResumeModal(true); }, []);

  const getResumeScreen = () => {
    if (!qp || qp === "done") return null;
    if (qp.startsWith("preview_")) return "stepRead";
    if (qp.startsWith("build_")) return "stepBuild";
    return "stepQuiz";
  };

  const handleResume = () => { const s = getResumeScreen(); if (s) go(s, { lessonId, sourceId, resume: true }); setResumeModal(false); };
  const handleFresh = () => {
    setUserData((prev) => ({ ...prev, quizProgress: { ...prev.quizProgress, [key]: null }, stepDone: { ...prev.stepDone, [key]: {} } }));
    setResumeModal(false);
  };

  const steps = [
    lesson?.VideoURL && { id: "video", icon: "🎬", label: "영상 보기", done: sd.video, screen: "stepVideo" },
    { id: "read", icon: "🗣️", label: "따라읽기", done: sd.read, screen: "stepRead" },
    { id: "build", icon: "🧩", label: "문장 만들기", done: sd.build, screen: "stepBuild" },
    { id: "quiz", icon: "🎤", label: "Speaking Test", done: qp === "done", screen: "stepQuiz" },
    { id: "diary", icon: "📔", label: "Diary 쓰기", done: sd.diary, screen: "stepDiary" },
  ].filter(Boolean);

  return (
    <div style={S.page}><div style={S.inner}>
      <Header title={lesson?.Title} onBack={() => go("lesson", { sourceId, catId: nav.catId })} />
      <div style={{ fontSize: 13, color: C.sub, marginBottom: 20 }}>{source?.Name}</div>
      {steps.map((step, i) => (
        <div key={step.id} onClick={() => go(step.screen, { lessonId, sourceId, catId: nav.catId })}
          style={{ ...S.card, cursor: "pointer", display: "flex", alignItems: "center", gap: 14, border: step.done ? `1.5px solid ${C.doneBorder}` : `1.5px solid ${C.border}`, background: step.done ? C.doneBg : C.card }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: step.done ? C.green : C.primaryLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{step.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: step.done ? C.done : C.text }}>{step.label}</div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{i + 1}단계</div>
          </div>
          {step.done ? <Badge label="완료" color={C.done} bg={C.doneBg} /> : <span style={{ color: C.sub, fontSize: 20 }}>›</span>}
        </div>
      ))}
    </div>
    <Modal visible={resumeModal} title="이어서 학습할까요?" desc="이전에 학습하다가 멈췄어요. 이어서 할까요?" buttons={[{ label: "처음부터", onClick: handleFresh }, { label: "이어하기", primary: true, onClick: handleResume }]} />
    </div>
  );
}

function StepVideoScreen({ go, nav, lessons, setUserData }) {
  const { lessonId, sourceId } = nav;
  const lesson = lessons.find((l) => l.LessonID === lessonId);
  const videoId = lesson?.VideoURL?.match(/(?:youtu\.be\/|v=)([^&\s]+)/)?.[1];
  const handleNext = () => {
    setUserData((prev) => { const key = `${lessonId}_${sourceId}`; return { ...prev, stepDone: { ...prev.stepDone, [key]: { ...(prev.stepDone[key] || {}), video: true } } }; });
    go("stepRead", { lessonId, sourceId });
  };
  return (
    <div style={S.page}><div style={S.inner}>
      <Header title="영상 보기" onBack={() => go("lessonSteps", nav)} />
      {videoId && <div style={{ borderRadius: 12, overflow: "hidden", marginBottom: 16, aspectRatio: "16/9" }}><iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${videoId}`} frameBorder="0" allowFullScreen style={{ display: "block" }} /></div>}
      <button onClick={handleNext} style={{ ...S.btn, ...S.btnPrimary }}>다음: 따라읽기</button>
    </div></div>
  );
}

function StepReadScreen({ go, nav, items, sources, categories, userData, setUserData }) {
  const { lessonId, sourceId, resume } = nav;
  const key = `${lessonId}_${sourceId}`;
  const { quizProgress = {} } = userData;
  const rawItems = items.filter((it) => it.LessonID === lessonId);
  const source = sources.find((s) => s.SourceID === sourceId);
  const cat = categories.find((c) => c.CategoryID === source?.CategoryID);
  const isOPIc = cat?.Name === "OPIc";
  const [shuffledItems] = useState(() => isOPIc ? shuffle(rawItems) : rawItems);
  const [resumeModal, setResumeModal] = useState(false);

  const savedState = (() => {
    const saved = quizProgress[key];
    if (saved && saved.startsWith("preview_")) { const p = saved.split("_"); return { idx: Number(p[1]) || 0, round: Number(p[2]) || 1 }; }
    return null;
  })();

  const [idx, setIdx] = useState(resume && savedState ? savedState.idx : 0);
  const [round, setRound] = useState(resume && savedState ? savedState.round : 1);
  const [spokenText, setSpokenText] = useState("");
  const [feedback, setFeedback] = useState("");
  const curItem = shuffledItems[idx];
  const total = shuffledItems.length; const totalRounds = 2;

  // resume=true이고 진행 중인 게 있으면 팝업
  useEffect(() => {
    if (resume && savedState) setResumeModal(true);
  }, []);

  const handleResumeContinue = () => setResumeModal(false);
  const handleResumeFresh = () => { setIdx(0); setRound(1); setResumeModal(false); };

  useEffect(() => {
    setUserData((prev) => ({ ...prev, quizProgress: { ...prev.quizProgress, [key]: `preview_${idx}_${round}` } }));
  }, [idx, round]);

  const { listening, startMic, stopMic } = useMic((text) => {
    setSpokenText(text);
    if (curItem && normalize(text).includes(normalize(curItem.English?.substring(0, 10)))) setFeedback("잘 했어요! 👍");
    else setFeedback("");
  });

  const handleNext = () => {
    stopMic(); stopSpeak(); setSpokenText(""); setFeedback("");
    if (idx + 1 < total) { setIdx(idx + 1); }
    else if (round < totalRounds) { setRound(round + 1); setIdx(0); }
    else {
      setUserData((prev) => ({ ...prev, stepDone: { ...prev.stepDone, [key]: { ...(prev.stepDone[key] || {}), read: true } }, studyDays: prev.studyDays.includes(today()) ? prev.studyDays : [...prev.studyDays, today()] }));
      go("stepBuild", { lessonId, sourceId });
    }
  };

  if (!curItem) return null;
  return (
    <div style={S.page}><div style={S.inner}>
      <Header title={`따라읽기 ${round}/${totalRounds}회차`} onQuit={() => { stopMic(); stopSpeak(); go("lessonSteps", { lessonId, sourceId, skipResume: true }); }} />
      <ProgressBar current={(round - 1) * total + idx} total={totalRounds * total} />
      <div style={{ ...S.card, textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: C.sub, marginBottom: 12 }}>한국어</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 20, lineHeight: 1.6 }}>{curItem.Korean}</div>
        <div style={{ width: "100%", height: 1, background: C.borderLight, marginBottom: 20 }} />
        <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>영어</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.primaryDark, lineHeight: 1.5 }}>{curItem.English}</div>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button onClick={() => speak(curItem.English)} style={{ ...S.btn, ...S.btnSecondary, flex: 1, padding: "12px" }}>🔊 듣기</button>
        <button onClick={listening ? stopMic : startMic} style={{ ...S.btn, flex: 1, padding: "12px", background: listening ? C.accent : C.green, color: "#fff" }}>
          {listening ? "⏹ 중지" : "🎤 따라읽기"}
        </button>
      </div>
      {spokenText && <div style={{ ...S.card, fontSize: 13, color: C.sub, marginBottom: 12 }}>들린 말: {spokenText}</div>}
      {feedback && <div style={{ textAlign: "center", color: C.green, fontWeight: 700, fontSize: 16, marginBottom: 12 }}>{feedback}</div>}
      <button onClick={handleNext} style={{ ...S.btn, ...S.btnPrimary }}>
        {idx + 1 < total ? "다음" : round < totalRounds ? "2회차 시작" : "완료! 문장 만들기"}
      </button>
    </div>
    <Modal visible={resumeModal} title="이어서 학습할까요?" desc="이전에 학습하다가 멈췄어요. 이어서 할까요?" buttons={[{ label: "처음부터", onClick: handleResumeFresh }, { label: "이어하기", primary: true, onClick: handleResumeContinue }]} />
    </div>
  );
}

function StepBuildScreen({ go, nav, items, sources, categories, userData, setUserData }) {
  const { lessonId, sourceId, resume } = nav;
  const key = `${lessonId}_${sourceId}`;
  const { quizProgress = {} } = userData;
  const rawItems = items.filter((it) => it.LessonID === lessonId);
  const source = sources.find((s) => s.SourceID === sourceId);
  const cat = categories.find((c) => c.CategoryID === source?.CategoryID);
  const isOPIc = cat?.Name === "OPIc";
  const [shuffledItems] = useState(() => isOPIc ? shuffle(rawItems) : rawItems);
  const [resumeModal, setResumeModal] = useState(false);

  const savedIdx = (() => { const saved = quizProgress[key]; return (saved && saved.startsWith("build_")) ? Number(saved.split("_")[1]) || 0 : 0; })();
  const [idx, setIdx] = useState(resume ? savedIdx : 0);
  const [options, setOptions] = useState([]);
  const [selected, setSelected] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const curItem = shuffledItems[idx];

  useEffect(() => { if (resume && savedIdx > 0) setResumeModal(true); }, []);

  const handleResumeContinue = () => setResumeModal(false);
  const handleResumeFresh = () => { setIdx(0); setResumeModal(false); };

  const loadChunks = async (item) => {
    setLoading(true); setSelected([]); setResult(null);
    const ch = await splitIntoChunks(item.English);
    setOptions(shuffle(ch.map((c, i) => ({ id: i, text: c })))); setLoading(false);
  };

  useEffect(() => { if (curItem) loadChunks(curItem); }, [idx]);
  useEffect(() => { setUserData((prev) => ({ ...prev, quizProgress: { ...prev.quizProgress, [key]: `build_${idx}` } })); }, [idx]);

  const handleSelect = (opt) => { if (result !== null) return; setSelected((prev) => [...prev, opt]); setOptions((prev) => prev.filter((o) => o.id !== opt.id)); };
  const handleDeselect = (opt, si) => { if (result !== null) return; setSelected((prev) => prev.filter((_, i) => i !== si)); setOptions((prev) => [...prev, opt]); };
  const handleSubmit = () => { setResult(checkCorrect(curItem.English, selected.map((s) => s.text).join(" "))); };
  const handleNext = () => {
    if (idx + 1 < shuffledItems.length) { setIdx(idx + 1); }
    else {
      setUserData((prev) => ({ ...prev, stepDone: { ...prev.stepDone, [key]: { ...(prev.stepDone[key] || {}), build: true } }, studyDays: prev.studyDays.includes(today()) ? prev.studyDays : [...prev.studyDays, today()] }));
      go("stepQuiz", { lessonId, sourceId });
    }
  };

  if (!curItem) return null;
  return (
    <div style={S.page}><div style={S.inner}>
      <Header title="문장 만들기" onQuit={() => go("lessonSteps", { lessonId, sourceId, skipResume: true })} />
      <ProgressBar current={idx} total={shuffledItems.length} />
      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>한국어</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>{curItem.Korean}</div>
      </div>
      <div style={{ minHeight: 56, border: `2px dashed ${result === true ? C.successBorder : result === false ? C.errorBorder : C.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 14, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", background: result === true ? C.successBg : result === false ? C.errorBg : "#fff" }}>
        {selected.length === 0 ? <span style={{ color: C.sub, fontSize: 13 }}>단어를 선택하세요</span>
          : selected.map((s, i) => (
            <button key={i} onClick={() => handleDeselect(s, i)} style={{ background: result === true ? C.success : result === false ? C.error : C.primary, color: result !== null ? "#fff" : C.text, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{s.text}</button>
          ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {loading ? <span style={{ color: C.sub, fontSize: 13 }}>문장 분석 중...</span>
          : options.map((opt) => (
            <button key={opt.id} onClick={() => handleSelect(opt)} style={{ background: C.primaryLight, color: C.primaryDark, border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{opt.text}</button>
          ))}
      </div>
      {result !== null && <ResultCard correct={result} english={curItem.English} />}
      {result === null
        ? <button onClick={handleSubmit} disabled={selected.length === 0} style={{ ...S.btn, ...S.btnPrimary, marginTop: 12, opacity: selected.length === 0 ? 0.5 : 1 }}>제출</button>
        : <button onClick={handleNext} style={{ ...S.btn, ...S.btnPrimary, marginTop: 12 }}>{idx + 1 < shuffledItems.length ? "다음" : "Speaking Test"}</button>}
    </div>
    <Modal visible={resumeModal} title="이어서 학습할까요?" desc="이전에 학습하다가 멈췄어요. 이어서 할까요?" buttons={[{ label: "처음부터", onClick: handleResumeFresh }, { label: "이어하기", primary: true, onClick: handleResumeContinue }]} />
    </div>
  );
}

function StepQuizScreen({ go, nav, items, userData, setUserData }) {
  const { lessonId, sourceId, resume } = nav;
  const key = `${lessonId}_${sourceId}`;
  const { quizProgress = {} } = userData;
  const [done, setDone] = useState(false);
  const lessonItems = items.filter((it) => it.LessonID === lessonId);
  const [resumeModal, setResumeModal] = useState(false);

  const savedIdx = (() => { const saved = quizProgress[key]; return (saved && !isNaN(Number(saved)) && !saved.startsWith("preview") && !saved.startsWith("build")) ? Number(saved) : 0; })();
  const [startIdx, setStartIdx] = useState(resume ? savedIdx : 0);

  useEffect(() => { if (resume && savedIdx > 0) setResumeModal(true); }, []);
  const handleResumeContinue = () => setResumeModal(false);
  const handleResumeFresh = () => { setStartIdx(0); setResumeModal(false); };

  const handleResult = (itemId, correct) => {
    setUserData((prev) => {
      const p = prev.progress[itemId] || { level: 0, history: [] };
      const newLevel = correct ? Math.min(p.level + 1, 5) : 0;
      return { ...prev, progress: { ...prev.progress, [itemId]: { level: newLevel, nextReview: calcNextReview(newLevel), history: [...(p.history || []), { date: today(), result: correct ? "o" : "x" }] } }, studyDays: prev.studyDays.includes(today()) ? prev.studyDays : [...prev.studyDays, today()] };
    });
  };

  const handleDone = () => {
    setUserData((prev) => ({ ...prev, quizProgress: { ...prev.quizProgress, [key]: "done" } }));
    setDone(true);
  };

  if (done) return (
    <div style={S.page}><div style={{ ...S.inner, textAlign: "center", paddingTop: 60 }}>
      <img src={duck2Img} alt="완료" style={{ width: 120, marginBottom: 20 }} />
      <div style={{ fontSize: 24, fontWeight: 900, color: C.text, marginBottom: 8 }}>Speaking Test 완료! 🎉</div>
      <div style={{ color: C.sub, marginBottom: 32 }}>수고했어요! 다이어리를 작성해볼까요?</div>
      <button onClick={() => go("stepDiary", { lessonId, sourceId })} style={{ ...S.btn, ...S.btnPrimary, marginBottom: 12 }}>📔 Diary 쓰기</button>
      <button onClick={() => go("lessonSteps", { lessonId, sourceId })} style={{ ...S.btn, ...S.btnGhost }}>레슨으로 돌아가기</button>
    </div></div>
  );

  return (
    <div style={S.page}><div style={S.inner}>
      <Header title="Speaking Test" onQuit={() => go("lessonSteps", { lessonId, sourceId, skipResume: true })} />
      <QuizCoreWithIdx rawItems={lessonItems} initIdx={startIdx}
        onResult={handleResult}
        onIdxChange={(i) => setUserData((prev) => ({ ...prev, quizProgress: { ...prev.quizProgress, [key]: String(i) } }))}
        onDone={handleDone} />
    </div>
    <Modal visible={resumeModal} title="이어서 학습할까요?" desc="이전에 학습하다가 멈췄어요. 이어서 할까요?" buttons={[{ label: "처음부터", onClick: handleResumeFresh }, { label: "이어하기", primary: true, onClick: handleResumeContinue }]} />
    </div>
  );
}

function StepDiaryScreen({ go, nav, lessons, sources, userData, setUserData }) {
  const { lessonId, sourceId } = nav;
  const lesson = lessons.find((l) => l.LessonID === lessonId);
  const source = sources.find((s) => s.SourceID === sourceId);
  const key = `${lessonId}_${sourceId}`;
  const [content, setContent] = useState("");
  const handleSave = () => {
    if (!content.trim()) return;
    const diary = { id: `${lessonId}_${sourceId}_${Date.now()}`, lessonId, sourceId, lessonTitle: lesson?.Title || "", sourceName: source?.Name || "", content: content.trim(), date: today(), createdAt: new Date().toISOString() };
    setUserData((prev) => ({ ...prev, diaries: [diary, ...(prev.diaries || [])], stepDone: { ...prev.stepDone, [key]: { ...(prev.stepDone[key] || {}), diary: true } } }));
    go("lessonSteps", { lessonId, sourceId });
  };
  return (
    <div style={S.page}><div style={S.inner}>
      <Header title="Diary 쓰기" onBack={() => go("lessonSteps", nav)} />
      {lesson?.DiaryPrompt && <div style={{ ...S.card, background: C.primaryLight, marginBottom: 16 }}><div style={{ fontSize: 13, color: C.primaryDark, fontWeight: 600 }}>💡 오늘의 주제</div><div style={{ fontSize: 14, color: C.text, marginTop: 6 }}>{lesson.DiaryPrompt}</div></div>}
      <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="오늘 배운 표현을 사용해서 영어로 일기를 써보세요..." style={{ ...S.input, minHeight: 200, marginBottom: 12, display: "block" }} />
      <button onClick={handleSave} disabled={!content.trim()} style={{ ...S.btn, ...S.btnPrimary, marginBottom: 12, opacity: content.trim() ? 1 : 0.5 }}>저장하기</button>
      <button onClick={() => go("lessonSteps", nav)} style={{ ...S.btn, ...S.btnGhost }}>건너뛰기</button>
    </div></div>
  );
}

// ─── ReviewScreen (제목 좌측, 말하기 버튼 초록, ResultCard 업데이트) ───────────
function ReviewScreen({ go, userData, setUserData, items }) {
  const { progress = {} } = userData;
  const reviewItems = items.filter((it) => { const p = progress[it.ItemID]; return p?.nextReview && p.nextReview <= today(); });
  const [done, setDone] = useState(false);
  const handleResult = (itemId, correct) => {
    setUserData((prev) => {
      const p = prev.progress[itemId] || { level: 0, history: [] };
      const newLevel = correct ? Math.min(p.level + 1, 5) : 0;
      return { ...prev, progress: { ...prev.progress, [itemId]: { level: newLevel, nextReview: calcNextReview(newLevel), history: [...(p.history || []), { date: today(), result: correct ? "o" : "x" }] } }, studyDays: prev.studyDays.includes(today()) ? prev.studyDays : [...prev.studyDays, today()] };
    });
  };
  if (done || reviewItems.length === 0) return (
    <div style={S.page}><div style={{ ...S.inner, textAlign: "center", paddingTop: 60 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 8 }}>복습 완료!</div>
      <div style={{ color: C.sub, marginBottom: 32 }}>오늘의 복습을 모두 마쳤어요!</div>
      <button onClick={() => go("home")} style={{ ...S.btn, ...S.btnPrimary }}>홈으로</button>
    </div></div>
  );
  return (
    <div style={S.page}><div style={S.inner}>
      <Header title="오늘의 복습" onQuit={() => go("home")} />
      <QuizCore rawItems={reviewItems} onResult={handleResult} onDone={() => setDone(true)} />
    </div></div>
  );
}

// ─── FavoriteListScreen (카드 재디자인) ────────────────────────────────────────
function FavoriteListScreen({ go, userData, setUserData, items }) {
  const { favorites = {} } = userData;
  const favItems = items.filter((it) => favorites[it.ItemID]);
  const toggleFav = (itemId) => { setUserData((prev) => { const f = { ...prev.favorites }; if (f[itemId]) delete f[itemId]; else f[itemId] = true; return { ...prev, favorites: f }; }); };
  return (
    <div style={S.page}><div style={S.inner}>
      <Header title="저장한 문장" onBack={() => go("home")} />
      {favItems.length > 0 && <button onClick={() => go("favoriteQuiz")} style={{ ...S.btn, ...S.btnPrimary, marginBottom: 16 }}>🎲 랜덤 QUIZ</button>}
      {favItems.length === 0 && <div style={{ textAlign: "center", color: C.sub, padding: 40 }}>저장한 문장이 없어요</div>}
      {favItems.map((it) => (
        <div key={it.ItemID} style={{ ...S.card }}>
          {/* 상단: 별 아이콘 */}
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 4 }}>
            <button onClick={() => toggleFav(it.ItemID)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, padding: 0 }}>⭐</button>
          </div>
          {/* 한국어 */}
          <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>{it.Korean}</div>
          {/* 영어 */}
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>{it.English}</div>
          {/* 듣기 버튼 */}
          <button onClick={() => speak(it.English)} style={{ ...S.btn, ...S.btnSecondary, padding: "8px 16px", fontSize: 13 }}>듣기</button>
        </div>
      ))}
    </div></div>
  );
}

// ─── FavoriteQuizScreen (제목 좌측, ResultCard 업데이트) ──────────────────────
function FavoriteQuizScreen({ go, userData, setUserData, items }) {
  const { favorites = {} } = userData;
  const favItems = items.filter((it) => favorites[it.ItemID]);
  const [done, setDone] = useState(false);
  const handleResult = (itemId, correct) => {
    setUserData((prev) => { const p = prev.progress[itemId] || { level: 0, history: [] }; const newLevel = correct ? Math.min(p.level + 1, 5) : 0; return { ...prev, progress: { ...prev.progress, [itemId]: { level: newLevel, nextReview: calcNextReview(newLevel), history: [...(p.history || []), { date: today(), result: correct ? "o" : "x" }] } } }; });
  };
  if (done) return (
    <div style={S.page}><div style={{ ...S.inner, textAlign: "center", paddingTop: 60 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⭐</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 32 }}>퀴즈 완료!</div>
      <button onClick={() => go("favoriteList")} style={{ ...S.btn, ...S.btnPrimary }}>돌아가기</button>
    </div></div>
  );
  return (
    <div style={S.page}><div style={S.inner}>
      <Header title="저장 문장 퀴즈" onQuit={() => go("favoriteList")} />
      <QuizCore rawItems={favItems} onResult={handleResult} onDone={() => setDone(true)} />
    </div></div>
  );
}

// ─── DiaryListScreen (휴지통 상단, 레슨명 가운데, 내용 숨김) ─────────────────
function DiaryListScreen({ go, userData, setUserData }) {
  const { diaries = [] } = userData;
  const sorted = [...diaries].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const handleDelete = (id) => { if (!window.confirm("삭제할까요?")) return; setUserData((prev) => ({ ...prev, diaries: prev.diaries.filter((d) => d.id !== id) })); };
  return (
    <div style={S.page}><div style={S.inner}>
      <Header title="내 다이어리" onBack={() => go("home")} />
      {sorted.length === 0 && <div style={{ textAlign: "center", color: C.sub, padding: 40 }}>아직 작성한 다이어리가 없어요</div>}
      {sorted.map((d) => (
        <div key={d.id} style={{ ...S.card, cursor: "pointer", padding: "15px" }} onClick={() => go("diaryDetail", { diaryId: d.id })}>
          {/* 휴지통 + 날짜 같은 줄 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <button onClick={(e) => { e.stopPropagation(); handleDelete(d.id); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: C.sub, padding: 0 }}>🗑️</button>
            <span style={{ fontSize: 12, color: C.sub }}>{d.date}</span>
          </div>
          {/* 교재명, 레슨명 가운데 정렬 */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 4 }}>{d.sourceName}</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{d.lessonTitle}</div>
          </div>
        </div>
      ))}
    </div></div>
  );
}

function DiaryDetailScreen({ go, nav, userData }) {
  const { diaryId } = nav;
  const diary = userData.diaries?.find((d) => d.id === diaryId);

  if (!diary) {
    return (
      <div style={S.page}>
        <div style={S.inner}>
          <Header title="다이어리" onBack={() => go("diaryList")} />
          <p>찾을 수 없습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.inner}>
        {/* 헤더 영역: 뒤로가기 버튼과 왼쪽 정렬된 날짜 */}
        <div style={{ position: "relative" }}>
          <Header title="" onBack={() => go("diaryList")} />
          <div style={{ 
            position: "absolute", 
            left: 50, 
            top: 14, 
            fontSize: 18, 
            fontWeight: 700, 
            color: C.text 
          }}>
            {diary.date}
          </div>
        </div>

        {/* 상세 내용 카드 */}
        <div style={{ ...S.card, marginTop: 10 }}>
          <div style={{ fontSize: 12, color: C.sub, marginBottom: 4 }}>
            {diary.sourceName}
          </div>
          <div style={{ fontWeight: 700, fontSize: 16, color: C.text, marginBottom: 16 }}>
            {diary.lessonTitle}
          </div>
          <div style={{ fontSize: 15, color: C.text, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
            {diary.content}
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ════════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [screen, setScreen] = useState("home");
  const [nav, setNav] = useState({});
  const [userData, setUserDataRaw] = useState(DEFAULT_DATA);
  const [categories, setCategories] = useState([]);
  const [sources, setSources] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [items, setItems] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const screenHistory = useRef([]);
  const pendingSave = useRef(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) { const data = await loadUserData(u.uid); setUserDataRaw(data); }
      setAuthLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    Promise.all([fetchSheet("Category"), fetchSheet("Source"), fetchSheet("Lesson"), fetchSheet("Item")])
      .then(([cats, srcs, lsns, itms]) => { setCategories(cats); setSources(srcs); setLessons(lsns); setItems(itms); setDataLoaded(true); });
  }, [user]);

  const setUserData = useCallback((updater) => {
    setUserDataRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      clearTimeout(saveTimer.current);
      pendingSave.current = next;
      saveTimer.current = setTimeout(() => {
        if (user && pendingSave.current) setDoc(doc(db, "users", user.uid), pendingSave.current, { merge: true }).catch(console.error);
      }, 1000);
      return next;
    });
  }, [user]);

  const navRef = useRef(nav);
  navRef.current = nav;

  const go = useCallback((s, n = {}) => {
    setScreen((prev) => { screenHistory.current.push({ screen: prev, nav: navRef.current }); return s; });
    setNav(n);
  }, []);

  useEffect(() => {
    const handler = () => { const prev = screenHistory.current.pop(); if (prev) { setScreen(prev.screen); setNav(prev.nav); } };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  if (authLoading) return <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}><img src={duckImg} alt="QUAK" style={{ width: 100, objectFit: "contain" }} /></div>;
  if (!user) return <LoginScreen />;
  if (!dataLoaded) return <div style={{ ...S.page, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}><img src={duckImg} alt="QUAK" style={{ width: 100, objectFit: "contain" }} /><div style={{ color: C.sub }}>학습 데이터 불러오는 중...</div></div>;

  const shared = { go, nav, userData, setUserData, categories, sources, lessons, items, user };

  const screens = {
    home: <HomeScreen {...shared} />,
    calendar: <CalendarScreen {...shared} />,
    lesson: <LessonScreen {...shared} />,
    lessonSteps: <LessonStepsScreen {...shared} />,
    stepVideo: <StepVideoScreen {...shared} />,
    stepRead: <StepReadScreen {...shared} />,
    stepBuild: <StepBuildScreen {...shared} />,
    stepQuiz: <StepQuizScreen {...shared} />,
    stepDiary: <StepDiaryScreen {...shared} />,
    review: <ReviewScreen {...shared} />,
    favoriteList: <FavoriteListScreen {...shared} />,
    favoriteQuiz: <FavoriteQuizScreen {...shared} />,
    diaryList: <DiaryListScreen {...shared} />,
    diaryDetail: <DiaryDetailScreen {...shared} />,
  };

  return screens[screen] || screens.home;
}
function ScriptLessonScreen({ go, nav, sources, lessons, items }) {
  const src = sources.find(s => s.SourceID === nav.sourceId);
  const srcLessons = lessons.filter(l => l.SourceID === nav.sourceId).sort((a, b) => Number(a.Order) - Number(b.Order));
  const lesson = srcLessons.find(l => l.LessonID === nav.lessonId);
  const lessonItems = items.filter(i => i.LessonID === nav.lessonId && i.SourceID === nav.sourceId);

  return (
    <div style={S.page}>
      <div style={S.pageInner}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => go("scriptLesson", { sourceId: nav.sourceId })} style={{ ...S.btn, background: C.pill, color: C.primary, padding: "8px 14px" }}>← 뒤로</button>
          <div style={{ fontWeight: 600, fontSize: 12, color: C.sub, flex: 1, lineHeight: 1.4 }}>{lesson?.Title}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={S.card}>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.sub, marginBottom: 12 }}>🇰🇷 한국어</div>
            {lessonItems.map((item, i) => (
              <div key={item.ItemID} style={{ padding: "8px 0", borderBottom: i < lessonItems.length - 1 ? `1px solid ${C.border}` : "none", fontSize: 15, color: C.text }}>
                {item.Korean}
              </div>
            ))}
          </div>
          <div style={S.card}>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.sub, marginBottom: 12 }}>🇺🇸 English</div>
            {lessonItems.map((item, i) => (
              <div key={item.ItemID} style={{ padding: "8px 0", borderBottom: i < lessonItems.length - 1 ? `1px solid ${C.border}` : "none", fontSize: 15, color: C.text }}>
                {item.English}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScriptLessonListScreen({ go, nav, sources, lessons, items }) {
  const src = sources.find(s => s.SourceID === nav.sourceId);
  const srcLessons = lessons.filter(l => l.SourceID === nav.sourceId).sort((a, b) => Number(a.Order) - Number(b.Order));
  return (
    <div style={S.page}>
      <div style={S.pageInner}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => go("source")} style={{ ...S.btn, background: C.pill, color: C.primary, padding: "8px 14px" }}>← 뒤로</button>
          <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.4 }}>{src?.Name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {srcLessons.map(lesson => {
            const lessonItems = items.filter(i => i.LessonID === lesson.LessonID && i.SourceID === lesson.SourceID);
            return (
              <div key={lesson.LessonID} onClick={() => go("scriptItem", { lessonId: lesson.LessonID, sourceId: lesson.SourceID })} style={{ ...S.card, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                <div style={{ flex: 1 }}>
                  <div style={S.listTitle}>{lesson.Title}</div>
                  <div style={S.listSub}>{lessonItems.length}문장</div>
                </div>
                <div style={{ color: C.sub, fontSize: 18 }}>›</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}