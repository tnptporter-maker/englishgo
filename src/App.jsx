import { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
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

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const provider = new GoogleAuthProvider();

const SHEET_ID = "1njMTapDCnpFP4mj6U0EEHPGumHfbBVWrljrX99_zUg0";
const REVIEW_INTERVALS = [1, 3, 7, 14, 30, 90];
const getNextReview = (level) => REVIEW_INTERVALS[Math.min(level, REVIEW_INTERVALS.length - 1)];
const today = () => new Date().toISOString().split("T")[0];

async function fetchSheet(sheetName) {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
    const res = await fetch(url);
    const text = await res.text();
    const rows = text.trim().split("\n").map(row => {
      const cells = [];
      let current = "", inQuotes = false;
      for (let i = 0; i < row.length; i++) {
        if (row[i] === '"') { inQuotes = !inQuotes; }
        else if (row[i] === ',' && !inQuotes) { cells.push(current.trim()); current = ""; }
        else { current += row[i]; }
      }
      cells.push(current.trim());
      return cells;
    });
    const headers = rows[0];
    return rows.slice(1).filter(r => r.some(c => c)).map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i] || ""; });
      return obj;
    });
  } catch (e) {
    console.error("Sheet fetch error:", e);
    return [];
  }
}

const speak = (text) => {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US"; u.rate = 0.9;
  window.speechSynthesis.speak(u);
};

const C = {
  bg: "#F7F8FC", card: "#FFFFFF", primary: "#2D6BE4",
  success: "#22C55E", danger: "#EF4444", warn: "#F59E0B",
  text: "#111827", sub: "#6B7280", border: "#E5E7EB", pill: "#EEF2FF",
};

const S = {
  card: { background: C.card, borderRadius: 16, padding: "16px 20px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" },
  btn: { borderRadius: 10, padding: "11px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", border: "none", transition: "opacity .15s" },
  input: { width: "100%", borderRadius: 10, border: `1.5px solid ${C.border}`, padding: "11px 14px", fontSize: 14, outline: "none", boxSizing: "border-box", background: "#fff", color: "#111827" },
  label: { fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 8, letterSpacing: 0.3 },
  listTitle: { fontWeight: 600, color: C.text, fontSize: 14, textAlign: "left" },
  listSub: { fontSize: 12, color: C.sub, marginTop: 3, textAlign: "left" },
  page: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column", fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif", overflowY: "auto" },
  pageInner: { flex: 1, display: "flex", flexDirection: "column", padding: "20px 16px 24px", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" },
};

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [screen, setScreen] = useState("home");
  const [nav, setNav] = useState({});
  const [categories, setCategories] = useState([]);
  const [sources, setSources] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [items, setItems] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);

  const getProgressKey = (u) => `quak_progress_${u?.email || "guest"}`;
  const loadProgress = (u) => { try { return JSON.parse(localStorage.getItem(getProgressKey(u)) || "{}"); } catch { return {}; } };
  const [progress, setProgressRaw] = useState({});
  const setProgress = useCallback((updater) => {
    setProgressRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      localStorage.setItem(getProgressKey(user), JSON.stringify(next));
      return next;
    });
  }, [user]);

  const getStudyDaysKey = (u) => `quak_studydays_${u?.email || "guest"}`;
  const loadStudyDays = (u) => { try { return JSON.parse(localStorage.getItem(getStudyDaysKey(u)) || "[]"); } catch { return []; } };
  const [studyDays, setStudyDaysRaw] = useState([]);
  const setStudyDays = useCallback((updater) => {
    setStudyDaysRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      localStorage.setItem(getStudyDaysKey(user), JSON.stringify(next));
      return next;
    });
  }, [user]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u); setAuthLoading(false);
      if (u) { setProgressRaw(loadProgress(u)); setStudyDaysRaw(loadStudyDays(u)); }
    });
    return unsub;
  }, []);

  useEffect(() => {
    async function load() {
      setDataLoading(true);
      const [cats, srcs, lsns, itms] = await Promise.all([
        fetchSheet("Category"), fetchSheet("Source"), fetchSheet("Lesson"), fetchSheet("Item"),
      ]);
      setCategories(cats); setSources(srcs); setLessons(lsns); setItems(itms);
      setDataLoading(false);
    }
    load();
  }, []);

  const go = (s, navUpdate = {}) => { setNav(p => ({ ...p, ...navUpdate })); setScreen(s); };
  const login = async () => { try { await signInWithPopup(auth, provider); } catch (e) { console.error(e); } };
  const logout = async () => { await signOut(auth); setProgressRaw({}); setStudyDaysRaw([]); };

  const reviewItems = [];
  Object.entries(progress).forEach(([itemId, prog]) => {
    if (prog.nextReview && prog.nextReview <= today()) {
      const item = items.find(i => i.ItemID === itemId);
      if (item) {
        const lesson = lessons.find(l => l.LessonID === item.LessonID && l.SourceID === item.SourceID);
        reviewItems.push({ ...item, lessonTitle: lesson?.Title || "", prog, itemId });
      }
    }
  });

  if (authLoading) return <Center>로딩 중...</Center>;
  if (!user) return <LoginScreen login={login} />;
  if (dataLoading) return <Center>데이터 불러오는 중...</Center>;

  const shared = { user, logout, go, nav, categories, sources, lessons, items, progress, setProgress, studyDays, setStudyDays, reviewItems };

  return (
    <>
      {screen === "home" && <HomeScreen {...shared} />}
      {screen === "calendar" && <CalendarScreen {...shared} />}
      {screen === "source" && <SourceScreen {...shared} />}
      {screen === "lesson" && <LessonScreen {...shared} />}
      {screen === "study" && <StudyScreen {...shared} />}
      {screen === "review" && <ReviewScreen {...shared} />}
    </>
  );
}

function Center({ children }) {
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, color: C.sub, background: C.bg }}>
      {children}
    </div>
  );
}

function LoginScreen({ login }) {
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#FFD966", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <img src={duckImg} width={120} height={120} alt="오리" style={{ marginBottom: 12, borderRadius: "50%" }} />
      <div style={{ fontSize: 28, fontWeight: 800, color: "#333", marginBottom: 8 }}>꽥</div>
      <div style={{ fontSize: 14, color: "#555", marginBottom: 48, textAlign: "center" }}>구글 계정으로 로그인하고 나만의 학습을 시작하세요</div>
      <button onClick={login} style={{ ...S.btn, background: "#fff", color: "#333", padding: "14px 28px", fontSize: 15, display: "flex", alignItems: "center", gap: 10, borderRadius: 14 }}>
        <img src="https://www.google.com/favicon.ico" width={18} height={18} alt="Google" />
        Google로 로그인
      </button>
    </div>
  );
}

function HomeScreen({ user, logout, go, categories, sources, studyDays, reviewItems }) {
  const [showMenu, setShowMenu] = useState(false);
  const getCatSources = (catId) => sources.filter(s => s.CategoryID === catId);
  return (
    <div style={S.page}>
      <div style={S.pageInner}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>HOME</div>
          <div style={{ position: "relative" }}>
            <img src={user.photoURL || "https://cdn-icons-png.flaticon.com/512/1077/1077012.png"} width={38} height={38}
              style={{ borderRadius: "50%", cursor: "pointer", border: `2px solid ${C.border}` }}
              onClick={() => setShowMenu(p => !p)} alt="프로필" />
            {showMenu && (
              <div style={{ position: "absolute", right: 0, top: 46, background: "#fff", borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", padding: 6, minWidth: 150, zIndex: 100 }}>
                <div onClick={() => setShowMenu(false)} style={{ padding: "10px 14px", cursor: "pointer", borderRadius: 8, fontSize: 13, fontWeight: 600, color: C.text }}>✏️ 닉네임 설정</div>
                <div onClick={logout} style={{ padding: "10px 14px", cursor: "pointer", borderRadius: 8, fontSize: 13, fontWeight: 600, color: C.danger }}>🚪 로그아웃</div>
                <div style={{ padding: "10px 14px", cursor: "pointer", borderRadius: 8, fontSize: 13, fontWeight: 600, color: C.danger }}>❌ 탈퇴</div>
              </div>
            )}
          </div>
        </div>

        <div onClick={() => go("calendar")} style={{ ...S.card, background: "#FFD966", cursor: "pointer", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(0,0,0,0.55)", marginBottom: 6 }}>🔥 학습 일수</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: "#333", lineHeight: 1 }}>{studyDays.length}<span style={{ fontSize: 16, fontWeight: 600 }}> 일</span></div>
            <div style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", marginTop: 4 }}>탭해서 달력 보기</div>
          </div>
          <div style={{ fontSize: 44, opacity: 0.25 }}>📅</div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={S.label}>복습 ({reviewItems.length})</div>
          {reviewItems.length === 0 ? (
            <div style={{ ...S.card, color: C.sub, fontSize: 14 }}>✅ 오늘 복습할 내용이 없어요!</div>
          ) : (
            <div style={{ ...S.card, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }} onClick={() => go("review")}>
              <div style={{ flex: 1 }}>
                <div style={S.listTitle}>🔁 에빙하우스 복습</div>
                <div style={S.listSub}>{reviewItems.length}개 문장이 복습 시기입니다</div>
              </div>
              <div style={{ color: C.sub, fontSize: 18 }}>›</div>
            </div>
          )}
        </div>

        <div style={S.label}>카테고리</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {categories.map(cat => (
            <div key={cat.CategoryID} onClick={() => go("source", { catId: cat.CategoryID })} style={{ ...S.card, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
              <div style={{ flex: 1 }}>
                <div style={S.listTitle}>{cat.Name}</div>
                <div style={S.listSub}>{getCatSources(cat.CategoryID).length}개 교재</div>
              </div>
              <div style={{ color: C.sub, fontSize: 18 }}>›</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CalendarScreen({ go, studyDays }) {
  const [month, setMonth] = useState(new Date());
  const studySet = new Set(studyDays);
  const y = month.getFullYear(), m = month.getMonth();
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return (
    <div style={S.page}>
      <div style={S.pageInner}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => go("home")} style={{ ...S.btn, background: C.pill, color: C.primary, padding: "8px 14px" }}>← 홈</button>
          <div style={{ fontWeight: 700, fontSize: 16 }}>학습 달력</div>
        </div>
        <div style={S.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <button onClick={() => setMonth(new Date(y, m - 1))} style={{ ...S.btn, background: "none", color: C.primary, padding: "4px 10px", fontSize: 18 }}>‹</button>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{y}년 {m + 1}월</div>
            <button onClick={() => setMonth(new Date(y, m + 1))} style={{ ...S.btn, background: "none", color: C.primary, padding: "4px 10px", fontSize: 18 }}>›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, textAlign: "center" }}>
            {["일","월","화","수","목","금","토"].map(d => (
              <div key={d} style={{ fontSize: 11, fontWeight: 700, color: C.sub, padding: "4px 0" }}>{d}</div>
            ))}
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const dateStr = `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
              const studied = studySet.has(dateStr);
              const isToday = dateStr === today();
              return (
                <div key={i} style={{ aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, background: studied ? C.primary : isToday ? C.pill : "transparent", color: studied ? "#fff" : isToday ? C.primary : C.text, fontWeight: studied || isToday ? 700 : 400, fontSize: 13 }}>
                  {d}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 16, textAlign: "center", color: C.sub, fontSize: 13 }}>총 <b style={{ color: C.primary }}>{studyDays.length}일</b> 학습</div>
        </div>
      </div>
    </div>
  );
}

function SourceScreen({ go, nav, categories, sources, lessons }) {
  const cat = categories.find(c => c.CategoryID === nav.catId);
  const catSources = sources.filter(s => s.CategoryID === nav.catId);
  return (
    <div style={S.page}>
      <div style={S.pageInner}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => go("home")} style={{ ...S.btn, background: C.pill, color: C.primary, padding: "8px 14px" }}>← 홈</button>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{cat?.Name}</div>
        </div>
        <div style={S.label}>교재 선택</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {catSources.map(src => {
            const srcLessons = lessons.filter(l => l.SourceID === src.SourceID);
            return (
              <div key={src.SourceID} onClick={() => go("lesson", { sourceId: src.SourceID })} style={{ ...S.card, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                <div style={{ flex: 1 }}>
                  <div style={S.listTitle}>{src.Name}</div>
                  <div style={S.listSub}>{src.Type} · {srcLessons.length}개 레슨</div>
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

function LessonScreen({ go, nav, sources, lessons, items, progress }) {
  const src = sources.find(s => s.SourceID === nav.sourceId);
  const srcLessons = lessons.filter(l => l.SourceID === nav.sourceId).sort((a, b) => Number(a.Order) - Number(b.Order));
  return (
    <div style={S.page}>
      <div style={S.pageInner}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => go("source")} style={{ ...S.btn, background: C.pill, color: C.primary, padding: "8px 14px" }}>← 뒤로</button>
          <div style={{ fontWeight: 700, fontSize: 15, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{src?.Name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {srcLessons.map(lesson => {
            const lessonItems = items.filter(i => i.LessonID === lesson.LessonID && i.SourceID === lesson.SourceID);
            const studied = lessonItems.filter(i => progress[i.ItemID]?.history?.length > 0).length;
            return (
              <div key={lesson.LessonID + lesson.SourceID} onClick={() => go("study", { lessonId: lesson.LessonID, sourceId: lesson.SourceID })} style={{ ...S.card, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                <div style={{ flex: 1 }}>
                  <div style={S.listTitle}>{lesson.Title}</div>
                  <div style={S.listSub}>{lessonItems.length}문장 · {studied > 0 ? `${studied}개 학습됨` : "미학습"}</div>
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

function StudyScreen({ go, nav, lessons, items, progress, setProgress, setStudyDays }) {
  const lesson = lessons.find(l => l.LessonID === nav.lessonId && l.SourceID === nav.sourceId);
  const lessonItems = items.filter(i => i.LessonID === nav.lessonId && i.SourceID === nav.sourceId);
  const saveKey = `quak_quiz_${nav.lessonId}_${nav.sourceId}`;

  const [phase, setPhase] = useState("preview");
  const [previewIdx, setPreviewIdx] = useState(0);
  const [quizIdx, setQuizIdx] = useState(0);
  const [showResume, setShowResume] = useState(false);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [listening, setListening] = useState(false);
  const [done, setDone] = useState(false);
  const recRef = useRef(null);

  useEffect(() => {
    const saved = parseInt(localStorage.getItem(saveKey) || "0");
    if (saved > 0) setShowResume(true);
  }, [saveKey]);

  const extractYouTubeId = (url) => {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=)([^&\n?#]+)/);
    return match ? match[1] : null;
  };
  const ytId = extractYouTubeId(lesson?.VideoURL);

  const startMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Chrome을 사용해주세요."); return; }
    const r = new SR();
    r.lang = "en-US"; r.continuous = false; r.interimResults = false;
    r.onresult = e => { setAnswer(e.results[0][0].transcript); setListening(false); };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    r.start(); recRef.current = r; setListening(true);
  };

  const checkAnswer = () => {
    const expected = lessonItems[quizIdx].English.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const given = answer.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const isCorrect = expected === given;
    setCorrect(isCorrect); setSubmitted(true); speak(lessonItems[quizIdx].English);
  };

  const recordResult = (ox) => {
    const itemId = lessonItems[quizIdx].ItemID;
    setProgress(prev => {
      const prog = prev[itemId] || { level: 0, history: [] };
      const newLevel = ox === "o" ? Math.min(prog.level + 1, 5) : 0;
      const nextReviewDate = new Date();
      nextReviewDate.setDate(nextReviewDate.getDate() + getNextReview(newLevel));
      return { ...prev, [itemId]: { level: newLevel, nextReview: nextReviewDate.toISOString().split("T")[0], history: [...(prog.history || []), { date: today(), result: ox }] } };
    });
    setStudyDays(prev => prev.includes(today()) ? prev : [...prev, today()]);
    if (quizIdx + 1 >= lessonItems.length) {
      localStorage.removeItem(saveKey);
      setDone(true);
    } else {
      const nextIdx = quizIdx + 1;
      localStorage.setItem(saveKey, String(nextIdx));
      setQuizIdx(nextIdx); setAnswer(""); setSubmitted(false); setCorrect(false);
      setTimeout(() => speak(lessonItems[nextIdx]?.English || ""), 400);
    }
  };

  const handleQuit = () => {
    setStudyDays(prev => prev.includes(today()) ? prev : [...prev, today()]);
    go("lesson");
  };

  if (!lesson) return <Center>레슨을 찾을 수 없어요</Center>;

  // 이어서 학습 팝업
  if (showResume) {
    return (
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 200 }}>
        <div style={{ background: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 360, textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📚</div>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8, color: C.text }}>이어서 학습할까요?</div>
          <div style={{ fontSize: 14, color: C.sub, marginBottom: 24 }}>이전에 학습하던 내용이 있어요!</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => {
              localStorage.removeItem(saveKey);
              setShowResume(false);
            }} style={{ ...S.btn, flex: 1, background: C.border, color: C.text }}>처음부터</button>
            <button onClick={() => {
              const saved = parseInt(localStorage.getItem(saveKey) || "0");
              setQuizIdx(saved);
              setPhase("quiz");
              setShowResume(false);
            }} style={{ ...S.btn, flex: 1, background: C.primary, color: "#fff" }}>이어서 하기</button>
          </div>
        </div>
      </div>
    );
  }

  if (done) return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <img src={duck2Img} width={120} height={120} alt="완료" style={{ marginBottom: 24, objectFit: "contain" }} />
      <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>레슨 완료!</div>
      <div style={{ color: C.sub, fontSize: 14, marginBottom: 32 }}>{lessonItems.length}문장 학습했어요</div>
      <button onClick={() => go("lesson")} style={{ ...S.btn, background: C.primary, color: "#fff", width: "100%", maxWidth: 320, padding: 16, fontSize: 15 }}>← 레슨 목록으로</button>
    </div>
  );

  // PREVIEW
  if (phase === "preview") {
    const item = lessonItems[previewIdx];
    return (
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px 16px", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <button onClick={() => go("lesson")} style={{ ...S.btn, background: C.pill, color: C.primary, padding: "8px 14px" }}>← 뒤로</button>
            <div style={{ fontWeight: 600, fontSize: 13, color: C.sub, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lesson.Title}</div>
            <button onClick={handleQuit} style={{ ...S.btn, background: "#FEE2E2", color: C.danger, padding: "5px 12px", fontSize: 12 }}>그만하기</button>
          </div>

          {ytId && previewIdx === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
              <div style={{ borderRadius: 14, overflow: "hidden" }}>
                <iframe width="100%" height="220" src={`https://www.youtube.com/embed/${ytId}`} title="YouTube" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ display: "block" }} />
              </div>
              <button onClick={() => setPreviewIdx(1)} style={{ ...S.btn, background: C.primary, color: "#fff", width: "100%" }}>학습 시작 →</button>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 12, color: C.sub, textAlign: "center", marginBottom: 12 }}>
                미리보기 {ytId ? previewIdx : previewIdx + 1} / {lessonItems.length}
              </div>
              {/* 카드 */}
              <div style={{ ...S.card, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.text, lineHeight: 1.6, marginBottom: 12 }}>{item.English}</div>
                <div style={{ color: C.sub, fontSize: 15, marginBottom: 20 }}>{item.Korean}</div>
                <button onClick={() => speak(item.English)} style={{ ...S.btn, background: C.pill, color: C.primary, fontSize: 13 }}>🔊 듣기</button>
              </div>
              {/* 버튼 */}
              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={() => setPreviewIdx(p => Math.max(0, p - 1))} disabled={previewIdx === 0} style={{ ...S.btn, flex: 1, background: C.border, color: C.text, opacity: previewIdx === 0 ? 0.4 : 1 }}>← 이전</button>
                {previewIdx < lessonItems.length - 1 ? (
                  <button onClick={() => setPreviewIdx(p => p + 1)} style={{ ...S.btn, flex: 1, background: C.primary, color: "#fff" }}>다음 →</button>
                ) : (
                  <button onClick={() => { setPhase("quiz"); setTimeout(() => speak(lessonItems[0].English), 300); }} style={{ ...S.btn, flex: 1, background: C.success, color: "#fff" }}>퀴즈 시작!</button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // QUIZ
  const item = lessonItems[quizIdx];
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px 16px", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {/* Progress bar */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>문제 {quizIdx + 1}/{lessonItems.length}</div>
            <button onClick={handleQuit} style={{ ...S.btn, background: "#FEE2E2", color: C.danger, padding: "5px 12px", fontSize: 12 }}>그만하기</button>
          </div>
          <div style={{ height: 6, background: C.border, borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.round((quizIdx / lessonItems.length) * 100)}%`, background: C.primary, borderRadius: 99, transition: "width 0.3s" }} />
          </div>
          <div style={{ fontSize: 11, color: C.sub, textAlign: "right", marginTop: 3 }}>{Math.round((quizIdx / lessonItems.length) * 100)}%</div>
        </div>

        {!submitted ? (
          <>
            {/* 문제 카드 */}
            <div style={{ ...S.card, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", marginBottom: 16 }}>
              <div style={{ color: C.sub, fontSize: 11, marginBottom: 10, fontWeight: 600 }}>다음을 영어로 말해보세요</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.text, lineHeight: 1.5, marginBottom: 16 }}>{item.Korean}</div>
              <button onClick={() => speak(item.English)} style={{ ...S.btn, background: C.pill, color: C.primary, fontSize: 13 }}>🔊 정답 듣기</button>
            </div>
            {/* 입력 */}
            <div style={{ position: "relative", marginBottom: 12 }}>
              <input value={answer} onChange={e => setAnswer(e.target.value)} onKeyDown={e => e.key === "Enter" && answer.trim() && checkAnswer()} placeholder="영어로 입력하거나 마이크를 누르세요..." style={{ ...S.input, paddingRight: 50 }} />
              <button onClick={listening ? () => { recRef.current?.stop(); setListening(false); } : startMic} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", fontSize: 20, cursor: "pointer", color: listening ? C.danger : C.primary }}>
                {listening ? "⏹" : "🎤"}
              </button>
            </div>
            {listening && <div style={{ textAlign: "center", color: C.primary, fontSize: 13, marginBottom: 8, fontWeight: 600 }}>🎤 듣고 있어요...</div>}
            <button onClick={checkAnswer} disabled={!answer.trim()} style={{ ...S.btn, width: "100%", background: C.primary, color: "#fff", opacity: !answer.trim() ? 0.4 : 1 }}>제출</button>
          </>
        ) : (
          <>
            {/* 정답 카드 */}
            <div style={{ ...S.card, flex: 1, border: `2px solid ${correct ? C.success : C.danger}`, marginBottom: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
              <div style={{ fontSize: 56, marginBottom: 20, filter: correct ? "invert(59%) sepia(52%) saturate(400%) hue-rotate(95deg) brightness(95%) contrast(90%)" : "none" }}>{correct ? "⭕" : "❌"}</div>
              <div style={{ fontWeight: 700, color: C.text, fontSize: 16, lineHeight: 1.5, marginBottom: 8 }}>{item.English}</div>
              {answer && <div style={{ color: C.sub, fontSize: 12 }}>내 답: {answer}</div>}
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => recordResult("x")} style={{ ...S.btn, flex: 1, background: "#FEE2E2", color: C.danger, fontSize: 14 }}>다시 학습하기</button>
              <button onClick={() => recordResult("o")} style={{ ...S.btn, flex: 1, background: "#DCFCE7", color: C.success, fontSize: 14 }}>다음</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReviewScreen({ go, reviewItems, setProgress, setStudyDays }) {
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  if (idx >= reviewItems.length) return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
      <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 16 }}>복습 완료!</div>
      <button onClick={() => go("home")} style={{ ...S.btn, background: C.primary, color: "#fff", width: "100%", maxWidth: 320, padding: 16 }}>홈으로</button>
    </div>
  );

  const item = reviewItems[idx];

  const startMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR(); r.lang = "en-US"; r.continuous = false; r.interimResults = false;
    r.onresult = e => { setAnswer(e.results[0][0].transcript); setListening(false); };
    r.onerror = () => setListening(false); r.onend = () => setListening(false);
    r.start(); recRef.current = r; setListening(true);
  };

  const checkAnswer = () => {
    const expected = item.English.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const given = answer.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const isCorrect = expected === given;
    setCorrect(isCorrect); setSubmitted(true); speak(item.English);
  };

  const recordResult = (ox) => {
    setProgress(prev => {
      const prog = prev[item.itemId] || { level: 0, history: [] };
      const newLevel = ox === "o" ? Math.min(prog.level + 1, 5) : 0;
      const nextReviewDate = new Date();
      nextReviewDate.setDate(nextReviewDate.getDate() + getNextReview(newLevel));
      return { ...prev, [item.itemId]: { level: newLevel, nextReview: nextReviewDate.toISOString().split("T")[0], history: [...(prog.history || []), { date: today(), result: ox }] } };
    });
    setStudyDays(prev => prev.includes(today()) ? prev : [...prev, today()]);
    setIdx(p => p + 1); setAnswer(""); setSubmitted(false); setCorrect(false);
  };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px 16px", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <button onClick={() => go("home")} style={{ ...S.btn, background: C.pill, color: C.primary, padding: "8px 14px" }}>← 홈</button>
          <div style={{ fontWeight: 600, fontSize: 13, color: C.sub }}>{idx + 1}/{reviewItems.length} 복습</div>
        </div>
        <div style={{ ...S.card, marginBottom: 12, background: "#FEF9C3", border: `1px solid ${C.warn}`, padding: "10px 16px" }}>
          <div style={{ fontSize: 11, color: C.warn, fontWeight: 700, marginBottom: 2 }}>🔁 에빙하우스 복습</div>
          <div style={{ fontSize: 12, color: C.sub }}>{item.lessonTitle}</div>
        </div>

        {!submitted ? (
          <>
            <div style={{ ...S.card, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", marginBottom: 16 }}>
              <div style={{ color: C.sub, fontSize: 11, marginBottom: 10, fontWeight: 600 }}>영어로 말해보세요</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.text, lineHeight: 1.5, marginBottom: 16 }}>{item.Korean}</div>
              <button onClick={() => speak(item.English)} style={{ ...S.btn, background: C.pill, color: C.primary, fontSize: 13 }}>🔊 정답 듣기</button>
            </div>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <input value={answer} onChange={e => setAnswer(e.target.value)} onKeyDown={e => e.key === "Enter" && answer.trim() && checkAnswer()} placeholder="영어로 입력하거나 마이크를..." style={{ ...S.input, paddingRight: 50 }} />
              <button onClick={listening ? () => { recRef.current?.stop(); setListening(false); } : startMic} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", fontSize: 20, cursor: "pointer", color: listening ? C.danger : C.primary }}>
                {listening ? "⏹" : "🎤"}
              </button>
            </div>
            <button onClick={checkAnswer} disabled={!answer.trim()} style={{ ...S.btn, width: "100%", background: C.primary, color: "#fff", opacity: !answer.trim() ? 0.4 : 1 }}>제출</button>
          </>
        ) : (
          <>
            <div style={{ ...S.card, flex: 1, border: `2px solid ${correct ? C.success : C.danger}`, marginBottom: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
              <div style={{ fontSize: 56, marginBottom: 20, filter: correct ? "invert(59%) sepia(52%) saturate(400%) hue-rotate(95deg) brightness(95%) contrast(90%)" : "none" }}>{correct ? "⭕" : "❌"}</div>
              <div style={{ fontWeight: 700, color: C.text, fontSize: 16, lineHeight: 1.5 }}>{item.English}</div>
              {answer && <div style={{ color: C.sub, fontSize: 12, marginTop: 8 }}>내 답: {answer}</div>}
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => recordResult("x")} style={{ ...S.btn, flex: 1, background: "#FEE2E2", color: C.danger, fontSize: 14 }}>다시 학습하기</button>
              <button onClick={() => recordResult("o")} style={{ ...S.btn, flex: 1, background: "#DCFCE7", color: C.success, fontSize: 14 }}>다음</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
