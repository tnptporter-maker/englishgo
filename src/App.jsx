import { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp } from "firebase/app";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, deleteUser,
} from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import duckImg from "./assets/duck.png";
import duck2Img from "./assets/duck2.png";

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

const SHEET_ID = "1njMTapDCnpFP4mj6U0EEHPGumHfbBVWrljrX99_zUg0";
const REVIEW_INTERVALS = [1, 2, 3, 7, 14, 30, 45, 60, 75, 90];

const C = {
  bg: "#FFFBE8",
  card: "#FFFFFF",
  primary: "#F59E0B",
  primaryDark: "#D97706",
  primaryLight: "#FEF3C7",
  accent: "#F97316",
  accentLight: "#FFF7ED",
  text: "#1C1917",
  sub: "#78716C",
  border: "#E7E5E4",
  borderLight: "#F5F5F4",
  error: "#EF4444",
  errorBg: "#FEF2F2",
  errorBorder: "#FCA5A5",
  done: "#D97706",
  doneBg: "#FEF3C7",
  doneBorder: "#FDE68A",
};

const S = {
  page: {
    position: "fixed", inset: 0, background: C.bg, overflowY: "auto",
    fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif",
    paddingBottom: 70,
  },
  inner: { maxWidth: 480, margin: "0 auto", padding: "20px 16px 20px" },
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
  input: {
    width: "100%", padding: "12px 14px", borderRadius: 10,
    border: `1.5px solid ${C.border}`, fontSize: 15, outline: "none",
    boxSizing: "border-box", background: "#fff", color: C.text,
    fontFamily: "inherit", resize: "none",
  },
};

const normalize = (s) =>
  (s || "").toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
const checkCorrect = (expected, given) => normalize(expected) === normalize(given);
const similarityScore = (expected, given) => {
  const exp = normalize(expected).split(" ");
  const giv = normalize(given).split(" ");
  const matches = exp.filter(w => giv.includes(w)).length;
  return exp.length > 0 ? matches / exp.length : 0;
};
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

const fetchBlanks = (sentence) => {
  const words = sentence.split(" ");
  const total = words.length;
  if (total <= 3) return [sentence];
  const size = Math.ceil(total / 3);
  const chunks = [];
  for (let i = 0; i < total; i += size) {
    chunks.push(words.slice(i, i + size).join(" "));
  }
  return chunks;
};


const DEFAULT_DATA = { progress: {}, studyDays: [], quizProgress: {}, favorites: {}, diaries: [], stepDone: {} };
const loadUserData = async (uid) => {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? { ...DEFAULT_DATA, ...snap.data() } : { ...DEFAULT_DATA };
};

function useMic(onResult) {
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const restartRef = useRef(null);
  const activeRef = useRef(false);
  const accumulatedRef = useRef("");

  const stopMic = useCallback(() => {
    activeRef.current = false;
    clearTimeout(restartRef.current);
    try { recRef.current?.stop(); } catch {}
    setListening(false);
    accumulatedRef.current = "";
  }, []);

  const startNewRec = useCallback((SR) => {
    const rec = new SR();
    rec.lang = "en-US"; rec.continuous = true; rec.interimResults = false;
    rec.onresult = (e) => {
      let final = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          final += e.results[i][0].transcript + " ";
        }
      }
      if (final.trim()) {
        accumulatedRef.current += (accumulatedRef.current ? " " : "") + final.trim();
        onResult(accumulatedRef.current);
      }
    };
    rec.onend = () => {
      if (activeRef.current) {
        restartRef.current = setTimeout(() => {
          try {
            const newRec = startNewRec(SR);
            recRef.current = newRec;
            newRec.start();
          } catch {}
        }, 200);
      } else {
        setListening(false);
      }
    };
    rec.onerror = (err) => {
      if (["no-speech", "audio-capture", "network"].includes(err.error)) {
        if (activeRef.current) {
          restartRef.current = setTimeout(() => {
            try {
              const newRec = startNewRec(SR);
              recRef.current = newRec;
              newRec.start();
            } catch {}
          }, 200);
        }
      }
    };
    return rec;
  }, [onResult]);

  const startMic = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert("Chrome 브라우저를 사용해주세요.");
    stopSpeak();
    activeRef.current = true;
    accumulatedRef.current = "";
    try {
      const rec = startNewRec(SR);
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch {}
  }, [startNewRec]);

  useEffect(() => () => stopMic(), [stopMic]);
  return { listening, startMic, stopMic };
}

function Header({ title, onBack, onQuit, onHome }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, minHeight: 44 }}>
      {onBack && (
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: C.text, padding: "4px 0", lineHeight: 1, flexShrink: 0 }}>←</button>
      )}
      {onHome && (
        <button onClick={onHome} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: C.text, padding: "4px 0", lineHeight: 1, flexShrink: 0 }}>🏠</button>
      )}
      {onQuit && !onBack && !onHome && <div style={{ width: 22 }} />}
      {title && <span style={{ fontWeight: 700, fontSize: 16, color: C.text, flex: 1, lineHeight: 1.3, textAlign: "left" }}>{title}</span>}
      {onQuit && (
        <button onClick={onQuit} style={{ ...S.btn, ...S.btnDanger, width: "auto", padding: "8px 14px", fontSize: 13, flexShrink: 0 }}>그만하기</button>
      )}
    </div>
  );
}

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

function Modal({ visible, title, desc, buttons, small }) {
  if (!visible) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "28px 24px", maxWidth: small ? 260 : 340, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ fontWeight: 800, fontSize: small ? 16 : 18, color: C.text, marginBottom: 8 }}>{title}</div>
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

function ResultCard({ correct, english }) {
  return (
    <div style={{
      background: correct ? C.accentLight : C.errorBg,
      border: `1.5px solid ${correct ? C.accent : C.errorBorder}`,
      borderRadius: 12, padding: "16px", marginTop: 12, textAlign: "center",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontWeight: 700, color: correct ? C.accent : C.error, fontSize: 22 }}>
          {correct ? "정답!" : "오답"}
        </span>
      </div>
      <div style={{ color: C.text, fontWeight: 600, fontSize: 15 }}>{english}</div>
    </div>
  );
}

function TabBar({ tab, setTab }) {
  const tabs = [
    { id: "home", icon: "🏠", label: "Home" },
    { id: "review", icon: "🔄", label: "Review" },
    { id: "like", icon: "⭐", label: "Like" },
    { id: "diary", icon: "📔", label: "Diary" },
    { id: "script", icon: "📖", label: "Script" },
  ];
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
      background: "#fff", borderTop: `1px solid ${C.border}`,
      display: "flex", maxWidth: 480, margin: "0 auto",
    }}>
      {tabs.map((t) => (
        <button key={t.id} onClick={() => setTab(t.id)} style={{
          flex: 1, padding: "10px 0 14px", background: "none", border: "none", cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
        }}>
          <span style={{ fontSize: 22 }}>{t.icon}</span>
          <span style={{ fontSize: 11, fontWeight: tab === t.id ? 700 : 400, color: tab === t.id ? C.primary : C.sub }}>{t.label}</span>
          {tab === t.id && <div style={{ width: 20, height: 2, background: C.primary, borderRadius: 99 }} />}
        </button>
      ))}
    </div>
  );
}

function StepIcon({ type, color }) {
  const s = { width: 28, height: 28 };
  if (type === "video") return (<svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={s}><polygon points="5,3 19,12 5,21" fill={color} stroke="none" /></svg>);
  if (type === "read") return (<svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={s}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><circle cx="9" cy="11" r="1" fill={color} /><circle cx="12" cy="11" r="1" fill={color} /><circle cx="15" cy="11" r="1" fill={color} /></svg>);
  if (type === "build") return (<svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={s}><rect x="2" y="2" width="9" height="9" rx="1" /><rect x="13" y="2" width="9" height="9" rx="1" /><rect x="2" y="13" width="9" height="9" rx="1" /><rect x="13" y="13" width="9" height="9" rx="1" /></svg>);
  if (type === "quiz") return (<svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={s}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>);
  if (type === "diary") return (<svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={s}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>);
  return null;
}

function QuizCoreWithIdx({ rawItems, initIdx = 0, onResult, onIdxChange, onDone }) {
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
        <div style={{ fontSize: 17, fontWeight: 700, color: C.text, lineHeight: 1.6, marginBottom: 14 }}>{curItem.Korean}</div>
        <button onClick={() => speak(curItem.English)} style={{ background: C.primaryLight, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, color: C.primaryDark, fontWeight: 600 }}>🔊 듣기</button>
      </div>
      <button onClick={listening ? stopMic : startMic} style={{ ...S.btn, background: listening ? C.accent : C.primary, color: "#fff", marginBottom: 12, fontSize: 16, padding: "16px" }}>
        {listening ? "⏹ 녹음 중지" : "🎤 영어로 말하기"}
      </button>
      <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="또는 직접 영어로 입력하세요"
        style={{ ...S.input, minHeight: 72, marginBottom: 12, display: "block" }} />
      {!submitted
        ? <button onClick={handleSubmit} disabled={!answer.trim()} style={{ ...S.btn, ...S.btnPrimary, opacity: answer.trim() ? 1 : 0.5 }}>제출</button>
        : (
          <>
            <ResultCard correct={result} english={curItem.English} />
            <button onClick={handleNext} style={{ ...S.btn, ...S.btnPrimary, marginTop: 12 }}>
              {idx + 1 < shuffledItems.length ? "다음" : "완료"}
            </button>
          </>
        )}
    </div>
  );
}

function QuizCore({ rawItems, onResult, onDone }) {
  return <QuizCoreWithIdx rawItems={rawItems} onResult={onResult} onDone={onDone} />;
}

function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const handleGoogle = async () => {
    setLoading(true);
    try { await signInWithPopup(auth, googleProvider); }
    catch (e) { alert("로그인 실패: " + e.message); }
    finally { setLoading(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif" }}>
      <div style={{ textAlign: "center", padding: "0 32px", width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <img src={duckImg} alt="QUAK" style={{ width: 120, height: 120, objectFit: "contain", marginBottom: 32, filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.2))" }} />
        <div style={{ color: C.primaryDark, fontSize: 40, fontWeight: 900, letterSpacing: 2, marginBottom: 32 }}>QUAK</div>
        <button onClick={handleGoogle} disabled={loading} style={{ ...S.btn, background: C.primary, color: "#fff", boxShadow: "0 4px 20px rgba(245,158,11,0.4)", fontSize: 20, padding: "16px 24px", width: "260px", borderRadius: 20 }}>
          {loading ? "로그인 중..." : "Google로 시작하기"}
        </button>
      </div>
    </div>
  );
}

function HomeScreen({ go, user, userData, setUserData, categories, sources, lessons, items, selectedSourceId, setSelectedSourceId }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [resumeModal, setResumeModal] = useState(false);
  const [resumeTarget, setResumeTarget] = useState(null);
  const lessonRefs = useRef({});

  const { studyDays = [], quizProgress = {} } = userData;

  const activeSourceId = selectedSourceId || (sources.length > 0 ? [...sources].sort((a, b) => Number(a.Order || 0) - Number(b.Order || 0))[0]?.SourceID : null);

  const sortedLessons = (() => {
    if (!activeSourceId) return [];
    return lessons
      .filter(l => l.SourceID === activeSourceId && l.LessonID && l.Title)
      .sort((a, b) => Number(a.Order || 0) - Number(b.Order || 0));
  })();

  const selectedSource = sources.find(s => s.SourceID === activeSourceId) || null;
  const selectedCat = selectedSource ? categories.find(c => c.CategoryID === selectedSource.CategoryID) : null;

  const todayLesson = (() => {
    if (!sortedLessons.length) return null;
    const inProgress = sortedLessons.find((l) => {
      const key = `${l.LessonID}_${l.SourceID}`;
      const p = quizProgress[key];
      return p && p !== "done";
    });
    if (inProgress) return inProgress;
    for (const l of sortedLessons) {
      const key = `${l.LessonID}_${l.SourceID}`;
      if (quizProgress[key] === "done") {
        const idx = sortedLessons.findIndex(x => x.LessonID === l.LessonID);
        if (idx >= 0 && idx + 1 < sortedLessons.length) {
          const next = sortedLessons[idx + 1];
          if (quizProgress[`${next.LessonID}_${next.SourceID}`] !== "done") return next;
        }
      }
    }
    return sortedLessons[0];
  })();

  // 앱 열면 todayLesson 자동 선택 (펼침) - 자동 스크롤은 하지 않음(1번)
  useEffect(() => {
    if (todayLesson && !selectedLesson) {
      setSelectedLesson(todayLesson);
    }
  }, [todayLesson]);

  // 레슨 선택 시 해당 레슨으로 스크롤 (13번)
  useEffect(() => {
    if (selectedLesson) {
      setTimeout(() => {
        lessonRefs.current[selectedLesson.LessonID]?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [selectedLesson]);

  const streakDays = (() => {
    if (!studyDays.length) return 0;
    const sorted = [...studyDays].sort((a, b) => b.localeCompare(a));
    let streak = 0;
    let check = new Date();
    for (let i = 0; i < 365; i++) {
      const ds = check.toISOString().slice(0, 10);
      if (sorted.includes(ds)) { streak++; check.setDate(check.getDate() - 1); }
      else if (i === 0) { check.setDate(check.getDate() - 1); continue; }
      else break;
    }
    return streak;
  })();

  const handleDeleteAccount = async () => {
    if (!window.confirm("정말로 탈퇴하시겠어요? 모든 데이터가 삭제됩니다.")) return;
    try { await deleteUser(auth.currentUser); }
    catch (e) { alert("탈퇴 실패. 재로그인 후 시도해주세요."); }
  };

  // 12번: 영상 없으면 영상보기 제외
  const getStepList = (lesson) => {
    const hasVideo = !!lesson?.VideoURL;
    const steps = [];
    let num = 1;
    if (hasVideo) { steps.push({ id: "stepVideo", type: "video", label: "영상 보기", num: num++ }); }
    steps.push({ id: "stepRead", type: "read", label: "따라읽기", num: num++ });
    steps.push({ id: "stepBuild", type: "build", label: "문장 만들기", num: num++ });
    steps.push({ id: "stepQuiz", type: "quiz", label: "Speaking", num: num++ });
    steps.push({ id: "stepDiary", type: "diary", label: "Diary", num: num++ });
    return steps;
  };

  // 8번: Start 버튼 로직
  const handleStart = (l) => {
    const key = `${l.LessonID}_${l.SourceID}`;
    const qp = quizProgress[key];
    const sd = userData.stepDone?.[key] || {};
    const stepList = getStepList(l);

    // 진행중이면 바로 이어하기로 이동
    if (qp && qp !== "done") {
      let resumeScreen = "stepRead";
      if (qp.startsWith("preview_")) resumeScreen = "stepRead";
      else if (qp.startsWith("build_")) resumeScreen = "stepBuild";
      else resumeScreen = "stepQuiz";
      go(resumeScreen, { lessonId: l.LessonID, sourceId: l.SourceID, resume: true });
      return;
    }

    for (const step of stepList) {
      const stepKey = step.id.replace("step", "").toLowerCase();
      const isDoneStep = step.id === "stepQuiz" ? qp === "done" : sd[stepKey];
      if (!isDoneStep) {
        go(step.id, { lessonId: l.LessonID, sourceId: l.SourceID });
        return;
      }
    }
    go(stepList[0].id, { lessonId: l.LessonID, sourceId: l.SourceID });
  };

  const handleResume = () => {
    if (resumeTarget) go(resumeTarget.screen, { lessonId: resumeTarget.lessonId, sourceId: resumeTarget.sourceId, resume: true });
    setResumeModal(false);
  };
  const handleFresh = () => {
    if (resumeTarget) {
      setUserData((prev) => ({ ...prev, quizProgress: { ...prev.quizProgress, [resumeTarget.key]: null }, stepDone: { ...prev.stepDone, [resumeTarget.key]: {} } }));
      const l = sortedLessons.find(x => x.LessonID === resumeTarget.lessonId);
      if (l) {
        const stepList = getStepList(l);
        go(stepList[0].id, { lessonId: resumeTarget.lessonId, sourceId: resumeTarget.sourceId });
      }
    }
    setResumeModal(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: C.bg, fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif", paddingBottom: 70, display: "flex", flexDirection: "column" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
        {/* 10번: 고정 헤더 영역 */}
        <div style={{ padding: "20px 16px 0", flexShrink: 0, background: C.bg }}>
          {/* 상단 바 */}
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, minHeight: 48 }}>
            <button onClick={() => go("courseSelect")} style={{ background: C.primaryLight, border: "none", borderRadius: 20, padding: "8px 16px", fontWeight: 700, fontSize: 14, color: C.primaryDark, cursor: "pointer" }}>
              Course ▾
            </button>
            <div onClick={() => go("calendar")} style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 4, background: C.accentLight, borderRadius: 20, padding: "8px 14px", cursor: "pointer" }}>
              <span style={{ fontSize: 18 }}>🔥</span>
              <span style={{ fontWeight: 800, fontSize: 16, color: C.accent }}>{streakDays}</span>
            </div>
            <div style={{ position: "relative" }}>
              <img src={user?.photoURL || duckImg} alt="profile" onClick={() => setMenuOpen((v) => !v)}
                style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", cursor: "pointer", border: `2.5px solid ${C.primary}` }} />
              {menuOpen && (
                <div style={{ position: "absolute", right: 0, top: 48, background: "#fff", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", padding: 8, minWidth: 140, zIndex: 100 }}>
                  <button onClick={() => { setMenuOpen(false); signOut(auth); }} style={{ display: "block", width: "100%", padding: "10px 16px", background: "none", border: "none", textAlign: "left", cursor: "pointer", fontSize: 14, color: C.text, borderRadius: 8 }}>로그아웃</button>
                  <button onClick={() => { setMenuOpen(false); handleDeleteAccount(); }} style={{ display: "block", width: "100%", padding: "10px 16px", background: "none", border: "none", textAlign: "left", cursor: "pointer", fontSize: 14, color: "#EF4444", borderRadius: 8 }}>회원 탈퇴</button>
                </div>
              )}
            </div>
          </div>

          {/* 2,3번: 카테고리명(작게) + 교재명(크게) + 4번: 스크립트 아이콘만 */}
          {selectedSource && (
            <div style={{ marginBottom: 12 }}>
              {selectedCat && <div style={{ fontSize: 13, fontWeight: 600, color: C.sub, marginBottom: 4, textAlign: "left" }}>{selectedCat.Name}</div>}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.text, textAlign: "left", flex: 1 }}>{selectedSource.Name}</div>
                <button onClick={() => {
                  const targetLesson = selectedLesson || todayLesson || sortedLessons[0];
                  if (targetLesson) go("scriptDetail", { lessonId: targetLesson.LessonID, sourceId: activeSourceId, fromHome: true });
                }}
                  style={{ background: C.primaryLight, border: "none", borderRadius: 10, width: 44, height: 44, cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>📖</button>
              </div>
            </div>
          )}
          <div style={{ height: 1, background: C.border }} />
        </div>

        {/* 레슨 리스트 (스크롤 영역) */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 20px" }}>
          {sortedLessons.map((l) => {
            const key = `${l.LessonID}_${l.SourceID}`;
            const qp = quizProgress[key];
            const isDone = qp === "done";
            const isInProgress = qp && qp !== "done";
            const isSelected = selectedLesson?.LessonID === l.LessonID;
            const sd = userData.stepDone?.[key] || {};
            const stepList = getStepList(l);

            return (
              <div key={l.LessonID} ref={(el) => { lessonRefs.current[l.LessonID] = el; }} style={{ marginBottom: 10 }}>
                <div
                  style={{ ...S.card, marginBottom: 0, cursor: "pointer", border: isSelected ? `2px solid ${C.primary}` : `1.5px solid ${C.border}` }}
                  onClick={() => {
                    if (isSelected) { setSelectedLesson(null); return; }
                    setSelectedLesson(l);
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: C.text, textAlign: "left", flex: 1 }}>{l.Title}</div>
                    <span style={{ color: C.sub, fontSize: 18, marginLeft: 8, transform: isSelected ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>›</span>
                  </div>
                  {(isDone || isInProgress) && (
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      {isDone && <Badge label="완료" color={C.done} bg={C.doneBg} />}
                      {isInProgress && <Badge label="진행중" color={C.accent} bg={C.accentLight} />}
                    </div>
                  )}
                </div>

                {/* 7번: 동그라미 하위학습 + 6번: 체크 표시 + 8번: Start 버튼 */}
                {isSelected && (
                  <div style={{ background: C.primaryLight, borderRadius: "0 0 16px 16px", padding: "16px 16px 16px" }}>
                    <div style={{ display: "flex", gap: 12, overflowX: "auto", marginBottom: 16, paddingBottom: 4, WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
                      {stepList.map((step) => {
                        const stepKey = step.id.replace("step", "").toLowerCase();
                        const isDoneStep = step.id === "stepQuiz" ? qp === "done" : sd[stepKey];
                        return (
                          <div key={step.id}
                            onClick={() => {
                            const stepKey = step.id.replace("step", "").toLowerCase();
                            const stepQp = quizProgress[`${l.LessonID}_${l.SourceID}`];
                            const stepSd = userData.stepDone?.[`${l.LessonID}_${l.SourceID}`] || {};
                            // 해당 스텝이 진행중인지 확인
                            if (step.id === "stepRead" && stepQp && stepQp.startsWith("preview_")) {
                              setResumeTarget({ lessonId: l.LessonID, sourceId: l.SourceID, screen: "stepRead", key: `${l.LessonID}_${l.SourceID}` });
                              setResumeModal(true);
                            } else if (step.id === "stepBuild" && stepQp && stepQp.startsWith("build_")) {
                              setResumeTarget({ lessonId: l.LessonID, sourceId: l.SourceID, screen: "stepBuild", key: `${l.LessonID}_${l.SourceID}` });
                              setResumeModal(true);
                            } else if (step.id === "stepQuiz" && stepQp && !isNaN(Number(stepQp)) && !stepQp.startsWith("preview") && !stepQp.startsWith("build")) {
                              setResumeTarget({ lessonId: l.LessonID, sourceId: l.SourceID, screen: "stepQuiz", key: `${l.LessonID}_${l.SourceID}` });
                              setResumeModal(true);
                            } else {
                              go(step.id, { lessonId: l.LessonID, sourceId: l.SourceID });
                            }
                          }}
                            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer", width: 56 }}>
                            <div style={{
                              position: "relative",
                              width: 48, height: 48, borderRadius: "50%",
                              background: isDoneStep ? C.primary : "#fff",
                              border: `2px solid ${isDoneStep ? C.primary : C.border}`,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              <StepIcon type={step.type} color={isDoneStep ? "#fff" : C.primaryDark} />
                              {isDoneStep && (
                                <div style={{
                                  position: "absolute", top: -2, right: -2,
                                  width: 16, height: 16, borderRadius: "50%",
                                  background: "#22C55E", display: "flex", alignItems: "center", justifyContent: "center",
                                }}>
                                  <span style={{ color: "#fff", fontSize: 10, fontWeight: 900 }}>✓</span>
                                </div>
                              )}
                            </div>
                            <div style={{ fontWeight: 600, fontSize: 10, color: isDoneStep ? C.primaryDark : C.sub, textAlign: "center", lineHeight: 1.2 }}>{step.label}</div>
                          </div>
                        );
                      })}
                    </div>
                    <button onClick={() => handleStart(l)}
                      style={{ ...S.btn, ...S.btnPrimary, borderRadius: 14, fontSize: 16, padding: "14px" }}>
                      Start
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {/* 13번: 마지막 레슨도 상단 스크롤 가능하도록 하단 여백 */}
          <div style={{ height: 400 }} />
        </div>
      </div>
      {/* 9번: 이어하기 모달 */}
      <Modal visible={resumeModal} title="이어서 학습할까요?" desc="이전에 학습하다가 멈췄어요." small
        buttons={[{ label: "처음부터", onClick: handleFresh }, { label: "이어하기", primary: true, onClick: handleResume }]} />
    </div>
  );
}

function CourseSelectScreen({ go, categories, sources, lessons, setSelectedSourceId }) {
  const catGroups = categories.map((cat) => ({
    cat,
    srcs: sources.filter((s) => s.CategoryID === cat.CategoryID),
  })).filter((g) => g.srcs.length);

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <Header title="교재 선택" onBack={() => go("home")} />
        {catGroups.map(({ cat, srcs }) => (
          <div key={cat.CategoryID} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.done, marginBottom: 8 }}>{cat.Name}</div>
            {srcs.map((src) => (
              <div key={src.SourceID}
                onClick={() => { setSelectedSourceId(src.SourceID); go("home"); }}
                style={{ ...S.card, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: C.text, textAlign: "left" }}>{src.Name}</div>
                  <div style={{ fontSize: 12, color: C.sub, marginTop: 2, textAlign: "left" }}>{lessons.filter((l) => l.SourceID === src.SourceID).length}개 레슨</div>
                </div>
                <span style={{ color: C.sub, fontSize: 20 }}>›</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function StepReadScreen({ go, nav, items, sources, categories, userData, setUserData }) {
  const { lessonId, sourceId, resume } = nav;
  const key = `${lessonId}_${sourceId}`;
  const { quizProgress = {} } = userData;
  const rawItems = items.filter((it) => it.LessonID === lessonId && it.SourceID === sourceId);
  const source = sources.find((s) => s.SourceID === sourceId);
  const cat = categories.find((c) => c.CategoryID === source?.CategoryID);
  const isOPIc = cat?.Name === "OPIc";
  const [shuffledItems] = useState(() => isOPIc ? shuffle(rawItems) : rawItems);
  const [resumeModal, setResumeModal] = useState(false);

  const savedState = (() => {
    const saved = quizProgress[key];
    if (saved && saved.startsWith("preview_")) {
      const p = saved.split("_");
      return { idx: Number(p[1]) || 0, round: Number(p[2]) || 1 };
    }
    return null;
  })();

  const [idx, setIdx] = useState(resume && savedState ? savedState.idx : 0);
  const [round, setRound] = useState(resume && savedState ? savedState.round : 1);
  const [spokenText, setSpokenText] = useState("");
  const [feedback, setFeedback] = useState("");
  const curItem = shuffledItems[idx];
  const total = shuffledItems.length;
  const totalRounds = 2;

  useEffect(() => { if (resume && savedState) setResumeModal(true); }, []);
  const handleResumeContinue = () => setResumeModal(false);
  const handleResumeFresh = () => { setIdx(0); setRound(1); setResumeModal(false); };

  useEffect(() => {
    setUserData((prev) => ({ ...prev, quizProgress: { ...prev.quizProgress, [key]: `preview_${idx}_${round}` } }));
  }, [idx, round]);

  const { listening, startMic, stopMic } = useMic((text) => {
    setSpokenText(text);
    const score = similarityScore(curItem?.English || "", text);
    if (score >= 0.8) setFeedback("잘 했어요! 👍");
    else if (text.trim().length > 0) setFeedback("다시 해보세요");
    else setFeedback("");
  });

  const handleNext = () => {
    stopMic(); stopSpeak(); setSpokenText(""); setFeedback("");
    if (idx + 1 < total) {
      setIdx(idx + 1);
    } else if (round < totalRounds) {
      setRound(round + 1); setIdx(0);
    } else {
      setUserData((prev) => ({
        ...prev,
        stepDone: { ...prev.stepDone, [key]: { ...(prev.stepDone[key] || {}), read: true } },
        studyDays: prev.studyDays.includes(today()) ? prev.studyDays : [...prev.studyDays, today()],
      }));
      go("stepBuild", { lessonId, sourceId });
    }
  };

  if (!curItem) return null;
  return (
    <div style={S.page}>
      <div style={S.inner}>
        <Header title="따라읽기" onQuit={() => { stopMic(); stopSpeak(); go("home"); }} />
        <ProgressBar current={(round - 1) * total + idx} total={totalRounds * total} />
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[1, 2].map((r) => (
            <div key={r} style={{ flex: 1, padding: "8px 0", borderRadius: 10, textAlign: "center", fontWeight: 700, fontSize: 13, background: round >= r ? C.primary : "#fff", color: round >= r ? "#fff" : C.sub, border: `1.5px solid ${round >= r ? C.primary : C.border}` }}>
              {r}회차
            </div>
          ))}
        </div>
        <div style={{ ...S.card, textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 20, lineHeight: 1.6 }}>{curItem.Korean}</div>
          <div style={{ width: "100%", height: 1, background: C.borderLight, marginBottom: 20 }} />
          <div style={{ fontSize: 20, fontWeight: 700, color: C.primaryDark, lineHeight: 1.5 }}>{curItem.English}</div>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <button onClick={() => speak(curItem.English)} style={{ ...S.btn, flex: 1, padding: "12px", background: "#fff", color: C.text, fontWeight: 700, fontSize: 14, border: `1.5px solid ${C.border}` }}>🔊 듣기</button>
          <button onClick={listening ? stopMic : startMic} style={{ ...S.btn, flex: 1, padding: "12px", background: listening ? "#7BAF3A" : "#A8C96B", color: "#fff", fontWeight: 700, fontSize: 14 }}>
            {listening ? "⏹ 중지" : "🎤 따라읽기"}
          </button>
        </div>
        {spokenText && <div style={{ ...S.card, fontSize: 13, color: C.sub, marginBottom: 12 }}>내 답 : {spokenText}</div>}
        {feedback && <div style={{ textAlign: "center", color: C.accent, fontWeight: 700, fontSize: 16, marginBottom: 12 }}>{feedback}</div>}
        <button onClick={handleNext} style={{ ...S.btn, ...S.btnPrimary }}>
          {idx + 1 < total ? "다음" : round < totalRounds ? "2회차 시작" : "완료! 문장 만들기"}
        </button>
      </div>
      <Modal visible={resumeModal} title="이어서 학습할까요?" desc="이전에 학습하다가 멈췄어요." small
        buttons={[{ label: "처음부터", onClick: handleResumeFresh }, { label: "이어하기", primary: true, onClick: handleResumeContinue }]} />
    </div>
  );
}

function StepBuildScreen({ go, nav, items, sources, categories, userData, setUserData }) {
  const { lessonId, sourceId, resume } = nav;
  const key = `${lessonId}_${sourceId}`;
  const { quizProgress = {} } = userData;
  const rawItems = items.filter((it) => it.LessonID === lessonId && it.SourceID === sourceId);
  const source = sources.find((s) => s.SourceID === sourceId);
  const cat = categories.find((c) => c.CategoryID === source?.CategoryID);
  const isOPIc = cat?.Name === "OPIc";
  const [shuffledItems] = useState(() => isOPIc ? shuffle(rawItems) : rawItems);
  const [resumeModal, setResumeModal] = useState(false);
  const savedIdx = (() => {
    const saved = quizProgress[key];
    return (saved && saved.startsWith("build_")) ? Number(saved.split("_")[1]) || 0 : 0;
  })();
  const [idx, setIdx] = useState(resume ? savedIdx : 0);
  const [selected, setSelected] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const curItem = shuffledItems[idx];

  useEffect(() => { if (resume && savedIdx > 0) setResumeModal(true); }, []);
  const handleResumeContinue = () => setResumeModal(false);
  const handleResumeFresh = () => { setIdx(0); setResumeModal(false); };

  const getChunks = (sentence) => {
    const CONJUNCTIONS = /^(and|but|or|so|because|until|when|while|if|before|after|though|although|unless|that|which|who)$/i;
    const PREPOSITIONS = /^(for|in|on|at|to|of|with|by|from|about|as|into|through|during|a|an|the)$/i;
    const words = sentence.split(" ");

    // 각 문장을 접속사/전치사 기준으로 쪼개는 내부 함수
    const splitOne = (s) => {
      const ws = s.split(" ");
      if (ws.length <= 3) return [s];
      let chunks = [];
      let current = [];
      for (let i = 0; i < ws.length; i++) {
        if (i > 0 && current.length >= 2 && (CONJUNCTIONS.test(ws[i]) || PREPOSITIONS.test(ws[i]))) {
          chunks.push(current.join(" "));
          current = [ws[i]];
        } else {
          current.push(ws[i]);
        }
      }
      if (current.length > 0) chunks.push(current.join(" "));
      // 너무 긴 청크 추가 분리
      const out = [];
      for (const chunk of chunks) {
        const cw = chunk.split(" ");
        if (cw.length > 8) {
          const mid = Math.ceil(cw.length / 2);
          out.push(cw.slice(0, mid).join(" "));
          out.push(cw.slice(mid).join(" "));
        } else { out.push(chunk); }
      }
      return out.length > 1 ? out : [s];
    };

    // 구두점 기준으로 먼저 문장 분리
    const punctChunks = sentence.split(/(?<=[.?!])\s+/).filter(s => s.trim());
    if (punctChunks.length > 1) {
      // 각 문장도 추가로 쪼개기
      const all = [];
      for (const pc of punctChunks) { splitOne(pc).forEach(c => all.push(c)); }
      return all;
    }

    if (words.length <= 3) return [sentence];
    return splitOne(sentence);
  };

  const [options] = useState(() => shuffle(getChunks(shuffledItems[0]?.English || "").map((c, i) => ({ id: i, text: c }))));
  const [chunkOptions, setChunkOptions] = useState(() => shuffle(getChunks(curItem?.English || "").map((c, i) => ({ id: i, text: c }))));

  useEffect(() => {
    if (curItem) { setSelected([]); setResult(null); setChunkOptions(shuffle(getChunks(curItem.English).map((c, i) => ({ id: i, text: c })))); }
  }, [idx]);
  useEffect(() => {
    setUserData((prev) => ({ ...prev, quizProgress: { ...prev.quizProgress, [key]: `build_${idx}` } }));
  }, [idx]);

  const handleSelect = (opt) => { if (result !== null) return; if (selected.find(s => s.id === opt.id)) return; setSelected((prev) => [...prev, opt]); };
  const handleDeselect = (opt, si) => { if (result !== null) return; setSelected((prev) => prev.filter((_, i) => i !== si)); };
  const handleSubmit = () => { setResult(checkCorrect(curItem.English, selected.map((s) => s.text).join(" "))); };
  const handleNext = () => {
    if (idx + 1 < shuffledItems.length) {
      setIdx(idx + 1);
    } else {
      setUserData((prev) => ({
        ...prev,
        stepDone: { ...prev.stepDone, [key]: { ...(prev.stepDone[key] || {}), build: true } },
        studyDays: prev.studyDays.includes(today()) ? prev.studyDays : [...prev.studyDays, today()],
      }));
      go("stepQuiz", { lessonId, sourceId });
    }
  };

  if (!curItem) return null;

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <Header title="문장 만들기" onQuit={() => go("home")} />
        <ProgressBar current={idx} total={shuffledItems.length} />
        <div style={{ ...S.card, marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>{curItem.Korean}</div>
        </div>
        <div style={{ minHeight: 56, border: `2px dashed ${result === true ? C.accent : result === false ? C.error : C.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 14, background: "#fff" }}>
          {selected.length === 0
            ? <span style={{ color: C.sub, fontSize: 13 }}>청크를 순서대로 선택하세요</span>
            : <span style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{selected.map(s => s.text).join(" ")}</span>}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {chunkOptions.map((opt) => {
            const isSelected = selected.find(s => s.id === opt.id);
            return (
              <button key={opt.id} onClick={() => isSelected ? handleDeselect(opt, selected.findIndex(s => s.id === opt.id)) : handleSelect(opt)}
                style={{ background: isSelected ? "#FCD34D" : C.primaryLight, color: isSelected ? "#92400E" : C.primaryDark, border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{opt.text}</button>
            );
          })}
        </div>
        {result !== null && <ResultCard correct={result} english={curItem.English} />}
        {result === null
          ? <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button onClick={() => setSelected([])} style={{ ...S.btn, flex: 1, background: "#fff", color: C.sub, border: `1.5px solid ${C.border}` }}>초기화</button>
              <button onClick={handleSubmit} disabled={selected.length === 0} style={{ ...S.btn, ...S.btnPrimary, flex: 1, opacity: selected.length === 0 ? 0.5 : 1 }}>제출</button>
            </div>
          : <button onClick={handleNext} style={{ ...S.btn, ...S.btnPrimary, marginTop: 12 }}>{idx + 1 < shuffledItems.length ? "다음" : "Speaking Test"}</button>}
      </div>
      <Modal visible={resumeModal} title="이어서 학습할까요?" desc="이전에 학습하다가 멈췄어요." small
        buttons={[{ label: "처음부터", onClick: handleResumeFresh }, { label: "이어하기", primary: true, onClick: handleResumeContinue }]} />
    </div>
  );
}

function StepQuizScreen({ go, nav, items, userData, setUserData }) {
  const { lessonId, sourceId, resume } = nav;
  const key = `${lessonId}_${sourceId}`;
  const { quizProgress = {} } = userData;
  const [done, setDone] = useState(false);
  const lessonItems = items.filter((it) => it.LessonID === lessonId && it.SourceID === sourceId);
  const [resumeModal, setResumeModal] = useState(false);
  const savedIdx = (() => {
    const saved = quizProgress[key];
    return (saved && !isNaN(Number(saved)) && !saved.startsWith("preview") && !saved.startsWith("build")) ? Number(saved) : 0;
  })();
  const [startIdx, setStartIdx] = useState(resume ? savedIdx : 0);

  useEffect(() => { if (resume && savedIdx > 0) setResumeModal(true); }, []);
  const handleResumeContinue = () => setResumeModal(false);
  const handleResumeFresh = () => { setStartIdx(0); setResumeModal(false); };

  const handleResult = (itemId, correct) => {
    setUserData((prev) => {
      const p = prev.progress[itemId] || { level: 0, history: [] };
      const newLevel = correct ? Math.min(p.level + 1, 5) : 0;
      return {
        ...prev,
        progress: { ...prev.progress, [itemId]: { level: newLevel, nextReview: calcNextReview(newLevel), history: [...(p.history || []), { date: today(), result: correct ? "o" : "x" }] } },
        studyDays: prev.studyDays.includes(today()) ? prev.studyDays : [...prev.studyDays, today()],
      };
    });
  };

  const handleDone = () => {
    setUserData((prev) => ({ ...prev, quizProgress: { ...prev.quizProgress, [key]: "done" } }));
    setDone(true);
  };

  if (done) return (
    <div style={S.page}>
      <div style={{ ...S.inner, textAlign: "center", paddingTop: 60 }}>
        <img src={duck2Img} alt="완료" style={{ width: 120, marginBottom: 20 }} />
        <div style={{ fontSize: 24, fontWeight: 900, color: C.text, marginBottom: 8 }}>Speaking Test 완료! 🎉</div>
        <div style={{ color: C.sub, marginBottom: 32 }}>수고했어요! 다이어리를 작성해볼까요?</div>
        <button onClick={() => go("stepDiary", { lessonId, sourceId })} style={{ ...S.btn, ...S.btnPrimary, marginBottom: 12 }}>📔 Diary 쓰기</button>
        <button onClick={() => go("home")} style={{ ...S.btn, ...S.btnGhost }}>홈으로 돌아가기</button>
      </div>
    </div>
  );

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <Header title="Speaking Test" onQuit={() => go("home")} />
        <QuizCoreWithIdx rawItems={lessonItems} initIdx={startIdx}
          onResult={handleResult}
          onIdxChange={(i) => setUserData((prev) => ({ ...prev, quizProgress: { ...prev.quizProgress, [key]: String(i) } }))}
          onDone={handleDone} />
      </div>
      <Modal visible={resumeModal} title="이어서 학습할까요?" desc="이전에 학습하다가 멈췄어요." small
        buttons={[{ label: "처음부터", onClick: handleResumeFresh }, { label: "이어하기", primary: true, onClick: handleResumeContinue }]} />
    </div>
  );
}

function StepVideoScreen({ go, nav, lessons, setUserData }) {
  const { lessonId, sourceId } = nav;
  const lesson = lessons.find((l) => l.LessonID === lessonId && l.SourceID === sourceId);
  const videoId = lesson?.VideoURL?.match(/(?:youtu\.be\/|v=)([^&\s]+)/)?.[1];
  const handleNext = () => {
    setUserData((prev) => {
      const key = `${lessonId}_${sourceId}`;
      return { ...prev, stepDone: { ...prev.stepDone, [key]: { ...(prev.stepDone[key] || {}), video: true } } };
    });
    go("stepRead", { lessonId, sourceId });
  };
  return (
    <div style={S.page}>
      <div style={S.inner}>
        <Header title="영상 보기" onBack={() => go("home")} />
        {videoId && (
          <div style={{ borderRadius: 12, overflow: "hidden", marginBottom: 16, aspectRatio: "16/9" }}>
            <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${videoId}`} frameBorder="0" allowFullScreen style={{ display: "block" }} />
          </div>
        )}
        <button onClick={handleNext} style={{ ...S.btn, ...S.btnPrimary }}>다음: 따라읽기</button>
      </div>
    </div>
  );
}

function StepDiaryScreen({ go, nav, lessons, sources, userData, setUserData }) {
  const { lessonId, sourceId } = nav;
  const lesson = lessons.find((l) => l.LessonID === lessonId && l.SourceID === sourceId);
  const source = sources.find((s) => s.SourceID === sourceId);
  const key = `${lessonId}_${sourceId}`;
  const [content, setContent] = useState("");
  const handleSave = () => {
    if (!content.trim()) return;
    const diary = { id: `${lessonId}_${sourceId}_${Date.now()}`, lessonId, sourceId, lessonTitle: lesson?.Title || "", sourceName: source?.Name || "", content: content.trim(), date: today(), createdAt: new Date().toISOString() };
    setUserData((prev) => ({
      ...prev,
      diaries: [diary, ...(prev.diaries || [])],
      stepDone: { ...prev.stepDone, [key]: { ...(prev.stepDone[key] || {}), diary: true } },
    }));
    go("home");
  };
  return (
    <div style={S.page}>
      <div style={S.inner}>
        <Header title="Diary 쓰기" onBack={() => go("home")} />
        {lesson?.DiaryPrompt && (
          <div style={{ ...S.card, background: C.primaryLight, marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: C.primaryDark, fontWeight: 600 }}>💡 오늘의 주제</div>
            <div style={{ fontSize: 14, color: C.text, marginTop: 6 }}>{lesson.DiaryPrompt}</div>
          </div>
        )}
        <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="오늘 배운 표현을 사용해서 영어로 일기를 써보세요..."
          style={{ ...S.input, minHeight: 200, marginBottom: 12, display: "block" }} />
        <button onClick={handleSave} disabled={!content.trim()} style={{ ...S.btn, ...S.btnPrimary, marginBottom: 12, opacity: content.trim() ? 1 : 0.5 }}>저장하기</button>
        <button onClick={() => go("home")} style={{ ...S.btn, ...S.btnGhost }}>건너뛰기</button>
      </div>
    </div>
  );
}

function ReviewTab({ userData, setUserData, items, go }) {
  const { progress = {} } = userData;
  const reviewItems = items.filter((it) => { const p = progress[it.ItemID]; return p?.nextReview && p.nextReview <= today(); });
  const [done, setDone] = useState(false);

  const handleResult = (itemId, correct) => {
    setUserData((prev) => {
      const p = prev.progress[itemId] || { level: 0, history: [] };
      const newLevel = correct ? Math.min(p.level + 1, 5) : 0;
      return {
        ...prev,
        progress: { ...prev.progress, [itemId]: { level: newLevel, nextReview: calcNextReview(newLevel), history: [...(p.history || []), { date: today(), result: correct ? "o" : "x" }] } },
        studyDays: prev.studyDays.includes(today()) ? prev.studyDays : [...prev.studyDays, today()],
      };
    });
  };

  if (done || reviewItems.length === 0) return (
    <div style={S.page}>
      <div style={{ ...S.inner, textAlign: "center", paddingTop: 60 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 8 }}>복습 완료!</div>
        <div style={{ color: C.sub, marginBottom: 32 }}>{reviewItems.length === 0 ? "오늘 복습할 항목이 없어요" : "오늘의 복습을 모두 마쳤어요!"}</div>
      </div>
    </div>
  );

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <Header title="오늘의 복습" onQuit={() => go("home")} />
        <QuizCore rawItems={reviewItems} onResult={handleResult} onDone={() => setDone(true)} />
      </div>
    </div>
  );
}

function LikeTab({ userData, setUserData, items }) {
  const { favorites = {} } = userData;
  const favItems = items.filter((it) => favorites[it.ItemID]);
  const [done, setDone] = useState(false);
  const [quizMode, setQuizMode] = useState(false);

  const toggleFav = (itemId) => {
    setUserData((prev) => { const f = { ...prev.favorites }; if (f[itemId]) delete f[itemId]; else f[itemId] = true; return { ...prev, favorites: f }; });
  };

  const handleResult = (itemId, correct) => {
    setUserData((prev) => {
      const p = prev.progress[itemId] || { level: 0, history: [] };
      const newLevel = correct ? Math.min(p.level + 1, 5) : 0;
      return { ...prev, progress: { ...prev.progress, [itemId]: { level: newLevel, nextReview: calcNextReview(newLevel), history: [...(p.history || []), { date: today(), result: correct ? "o" : "x" }] } } };
    });
  };

  if (quizMode) {
    if (done) return (
      <div style={S.page}>
        <div style={{ ...S.inner, textAlign: "center", paddingTop: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⭐</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: C.text, marginBottom: 32 }}>퀴즈 완료!</div>
          <button onClick={() => { setQuizMode(false); setDone(false); }} style={{ ...S.btn, ...S.btnPrimary }}>돌아가기</button>
        </div>
      </div>
    );
    return (
      <div style={S.page}>
        <div style={S.inner}>
          <Header title="저장 문장 퀴즈" onQuit={() => setQuizMode(false)} />
          <QuizCore rawItems={favItems} onResult={handleResult} onDone={() => setDone(true)} />
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <div style={{ fontWeight: 800, fontSize: 20, color: C.text, marginBottom: 20 }}>저장한 문장</div>
        {favItems.length > 0 && (
          <button onClick={() => setQuizMode(true)} style={{ ...S.btn, ...S.btnPrimary, marginBottom: 16 }}>🎲 랜덤 QUIZ</button>
        )}
        {favItems.length === 0 && <div style={{ textAlign: "center", color: C.sub, padding: 40 }}>스크립트에서 ☆를 눌러 문장을 저장해보세요</div>}
        {favItems.map((it) => (
          <div key={it.ItemID} style={{ ...S.card }}>
            <button onClick={() => toggleFav(it.ItemID)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, padding: 0, marginBottom: 4, display: "block" }}>⭐</button>
            <div style={{ fontSize: 13, color: C.sub, marginBottom: 6 }}>{it.Korean}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>{it.English}</div>
            <button onClick={() => speak(it.English)} style={{ ...S.btn, ...S.btnSecondary, padding: "8px 16px", fontSize: 13 }}>🔊 듣기</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DiaryTab({ userData, setUserData, go }) {
  const { diaries = [] } = userData;
  const sorted = [...diaries].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const handleDelete = (id) => {
    if (!window.confirm("삭제할까요?")) return;
    setUserData((prev) => ({ ...prev, diaries: prev.diaries.filter((d) => d.id !== id) }));
  };

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <div style={{ fontWeight: 800, fontSize: 20, color: C.text, marginBottom: 20 }}>내 다이어리</div>
        {sorted.length === 0 && <div style={{ textAlign: "center", color: C.sub, padding: 40 }}>아직 작성한 다이어리가 없어요</div>}
        {sorted.map((d) => (
          <div key={d.id} style={{ ...S.card, cursor: "pointer" }} onClick={() => go("diaryDetail", { diaryId: d.id })}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <button onClick={(e) => { e.stopPropagation(); handleDelete(d.id); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: C.sub, padding: 0 }}>🗑️</button>
              <span style={{ fontSize: 12, color: C.sub }}>{d.date}</span>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 12, color: C.sub, marginBottom: 4 }}>{d.sourceName}</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{d.lessonTitle}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalendarScreen({ go, userData }) {
  const { studyDays = [] } = userData;
  const [monthOffset, setMonthOffset] = useState(0);
  const base = new Date();
  base.setMonth(base.getMonth() + monthOffset);
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array(firstDay).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));

  const streakDays = (() => {
    if (!studyDays.length) return 0;
    const sorted = [...studyDays].sort((a, b) => b.localeCompare(a));
    let streak = 0;
    let check = new Date();
    for (let i = 0; i < 365; i++) {
      const ds = check.toISOString().slice(0, 10);
      if (sorted.includes(ds)) { streak++; check.setDate(check.getDate() - 1); }
      else if (i === 0) { check.setDate(check.getDate() - 1); continue; }
      else break;
    }
    return streak;
  })();

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <Header title="학습 달력" onBack={() => go("home")} />
        <div style={{ ...S.card, display: "flex", alignItems: "center", textAlign: "center", gap: 8, marginBottom: 12, background: C.accentLight, border: `1.5px solid ${C.accent}` }}>
          <span style={{ fontSize: 22 }}>🔥</span>
          <span style={{ fontWeight: 900, fontSize: 18, color: C.accent }}>연속 학습</span>
          <span style={{ fontWeight: 900, fontSize: 18, color: C.accent }}>{streakDays}일</span>
        </div>
        <div style={{ ...S.card }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <button onClick={() => setMonthOffset((v) => v - 1)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>‹</button>
            <span style={{ fontWeight: 700, fontSize: 16 }}>{year}년 {month + 1}월</span>
            <button onClick={() => setMonthOffset((v) => v + 1)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}>›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 8 }}>
            {["일","월","화","수","목","금","토"].map((d) => (
              <div key={d} style={{ fontSize: 11, color: C.sub, fontWeight: 700, padding: "4px 0", textAlign: "center" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
              const studied = studyDays.includes(ds);
              const isToday = ds === today();
              return (
                <div key={i} style={{ aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", fontSize: 13, fontWeight: studied ? 700 : 400, background: studied ? C.primary : isToday ? C.primaryLight : "transparent", color: studied ? "#fff" : isToday ? C.primaryDark : C.text }}>
                  {d}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function DiaryDetailScreen({ go, nav, userData }) {
  const { diaryId } = nav;
  const diary = userData.diaries?.find((d) => d.id === diaryId);
  if (!diary) return (
    <div style={S.page}>
      <div style={S.inner}>
        <Header title="다이어리" onBack={() => go("diary")} />
        <p>찾을 수 없습니다.</p>
      </div>
    </div>
  );
  return (
    <div style={S.page}>
      <div style={S.inner}>
        <Header title="다이어리 상세" onBack={() => go("diary")} />
        <div style={{ ...S.card }}>
          <div style={{ fontSize: 12, color: C.sub, marginBottom: 4 }}>{diary.date} · {diary.sourceName}</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: C.text, marginBottom: 16 }}>{diary.lessonTitle}</div>
          <div style={{ fontSize: 15, color: C.text, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{diary.content}</div>
        </div>
      </div>
    </div>
  );
}

function ScriptTab({ go, sources, lessons, categories }) {
  const catGroups = categories.map((cat) => ({
    cat,
    srcs: sources.filter((s) => s.CategoryID === cat.CategoryID),
  })).filter((g) => g.srcs.length);

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <div style={{ fontWeight: 800, fontSize: 20, color: C.text, marginBottom: 20 }}>Script</div>
        {catGroups.map(({ cat, srcs }) => (
          <div key={cat.CategoryID} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, marginBottom: 8 }}>{cat.Name}</div>
            {srcs.map((src) => (
              <div key={src.SourceID} onClick={() => go("scriptSource", { sourceId: src.SourceID })}
                style={{ ...S.card, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: C.text, textAlign: "left" }}>{src.Name}</div>
                  <div style={{ fontSize: 12, color: C.sub, marginTop: 2, textAlign: "left" }}>{lessons.filter((l) => l.SourceID === src.SourceID).length}개 레슨</div>
                </div>
                <span style={{ color: C.sub, fontSize: 20 }}>›</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScriptSourceScreen({ go, nav, sources, lessons, items }) {
  const { sourceId } = nav;
  const source = sources.find((s) => s.SourceID === sourceId);
  const srcLessons = lessons.filter((l) => l.SourceID === sourceId).sort((a, b) => Number(a.Order) - Number(b.Order));
  return (
    <div style={S.page}>
      <div style={S.inner}>
        <Header title={source?.Name} onBack={() => go("script")} />
        {srcLessons.map((l) => {
          const lessonItems = items.filter((it) => it.LessonID === l.LessonID && it.SourceID === sourceId);
          return (
            <div key={l.LessonID} onClick={() => go("scriptDetail", { lessonId: l.LessonID, sourceId })}
              style={{ ...S.card, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: C.text, textAlign: "left" }}>{l.Title}</div>
                <div style={{ fontSize: 12, color: C.sub, marginTop: 4, textAlign: "left" }}>{lessonItems.length}문장</div>
              </div>
              <span style={{ color: C.sub, fontSize: 20 }}>›</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScriptDetailScreen({ go, nav, lessons, sources, items, userData, setUserData }) {
  const { lessonId, sourceId } = nav;
  const lesson = lessons.find((l) => l.LessonID === lessonId && l.SourceID === sourceId);
  const source = sources.find((s) => s.SourceID === sourceId);
  const lessonItems = items.filter((it) => it.LessonID === lessonId && it.SourceID === sourceId).sort((a, b) => Number(a.Order || 0) - Number(b.Order || 0));
  const { favorites = {} } = userData;
  const toggleFav = (itemId) => {
    setUserData((prev) => { const f = { ...prev.favorites }; if (f[itemId]) delete f[itemId]; else f[itemId] = true; return { ...prev, favorites: f }; });
  };
  return (
    <div style={S.page}>
      <div style={S.inner}>
        <Header title={lesson?.Title} onBack={() => nav.fromHome ? go("home") : go("scriptSource", { sourceId })} />
        <div style={{ fontSize: 12, color: C.sub, marginBottom: 20 }}>{source?.Name}</div>
        {lessonItems.map((item) => (
          <div key={item.ItemID} style={{ ...S.card, marginBottom: 12 }}>
            <button onClick={() => toggleFav(item.ItemID)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, padding: 0, marginBottom: 8, display: "block" }}>
              {favorites[item.ItemID] ? "⭐" : "☆"}
            </button>
            <div style={{ fontSize: 14, color: C.sub, marginBottom: 6, lineHeight: 1.5 }}>{item.Korean}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12, lineHeight: 1.5 }}>{item.English}</div>
            <button onClick={() => speak(item.English)} style={{ background: C.primaryLight, border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, color: C.primaryDark, fontWeight: 600 }}>🔊 듣기</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState("home");
  const [screen, setScreen] = useState(null);
  const [nav, setNav] = useState({});
  const [userData, setUserDataRaw] = useState(DEFAULT_DATA);
  const [categories, setCategories] = useState([]);
  const [sources, setSources] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [items, setItems] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState(null);
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

  const go = useCallback((s, n = {}) => {
    const tabScreens = ["home", "review", "like", "diary", "script"];
    if (tabScreens.includes(s)) {
      setTab(s);
      setScreen(null);
      setNav({});
    } else {
      setScreen(s);
      setNav(n);
    }
  }, []);

  const loadingStyle = { position: "fixed", inset: 0, background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "'Pretendard',sans-serif" };

  if (authLoading) return (
    <div style={loadingStyle}>
      <img src={duckImg} alt="QUAK" style={{ width: 100, objectFit: "contain" }} />
    </div>
  );
  if (!user) return <LoginScreen />;
  if (!dataLoaded) return (
    <div style={loadingStyle}>
      <img src={duckImg} alt="QUAK" style={{ width: 100, objectFit: "contain" }} />
      <div style={{ color: C.primaryDark, fontWeight: 600 }}>학습 데이터 불러오는 중...</div>
    </div>
  );

  const shared = { go, nav, userData, setUserData, categories, sources, lessons, items, user };

  if (screen) {
    const screenMap = {
      courseSelect: <CourseSelectScreen {...shared} setSelectedSourceId={setSelectedSourceId} />,
      stepVideo: <StepVideoScreen {...shared} />,
      stepRead: <StepReadScreen {...shared} />,
      stepBuild: <StepBuildScreen {...shared} />,
      stepQuiz: <StepQuizScreen {...shared} />,
      stepDiary: <StepDiaryScreen {...shared} />,
      scriptSource: <ScriptSourceScreen {...shared} />,
      scriptDetail: <ScriptDetailScreen {...shared} />,
      diaryDetail: <DiaryDetailScreen {...shared} />,
      calendar: <CalendarScreen {...shared} />,
    };
    return screenMap[screen] || null;
  }

  const tabContent = {
    home: <HomeScreen {...shared} selectedSourceId={selectedSourceId} setSelectedSourceId={setSelectedSourceId} />,
    review: <ReviewTab {...shared} />,
    like: <LikeTab {...shared} />,
    diary: <DiaryTab {...shared} />,
    script: <ScriptTab {...shared} />,
  };

  return (
    <div>
      {tabContent[tab]}
      <TabBar tab={tab} setTab={(t) => go(t)} />
    </div>
  );
}
