import { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import duckImg from "./assets/duck.png";
import duck2Img from "./assets/duck2.png";
import profileImg from "./assets/profile.jpg";

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
const db = getFirestore(firebaseApp);

const SHEET_ID = "1njMTapDCnpFP4mj6U0EEHPGumHfbBVWrljrX99_zUg0";
const REVIEW_INTERVALS = [1, 3, 7, 14, 30, 90];
const getNextReview = (level) => REVIEW_INTERVALS[Math.min(level, REVIEW_INTERVALS.length - 1)];
const today = () => new Date().toISOString().split("T")[0];

const userDocRef = (uid) => doc(db, "users", uid);

async function loadFromFirestore(uid) {
  try {
    const snap = await getDoc(userDocRef(uid));
    if (snap.exists()) {
      const data = snap.data();
      return {
        progress: data.progress || {},
        studyDays: data.studyDays || [],
        quizProgress: data.quizProgress || {},
        favorites: data.favorites || {},
      };
    }
    return { progress: {}, studyDays: [], quizProgress: {}, favorites: {} };
  } catch (e) {
    console.error("Firestore load error:", e);
    return { progress: {}, studyDays: [], quizProgress: {}, favorites: {} };
  }
}

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
  setTimeout(() => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US"; u.rate = 0.9;
    window.speechSynthesis.speak(u);
  }, 300);
};

// AI를 이용한 의미단위 분리 함수
async function splitIntoChunks(sentence) {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [{
          role: "user",
          content: `Split this English sentence into meaningful chunks for a word-ordering exercise. 
Rules:
- Keep phrasal verbs together (e.g., "give up", "look forward to")
- Keep common idioms together
- Keep articles with their nouns (e.g., "the store", "a book")
- Keep short preposition phrases together (e.g., "at home", "in the morning")
- Keep auxiliary+verb together (e.g., "have been", "will go", "can't do")
- Keep negations together (e.g., "don't know", "isn't it")
- Each chunk should be 1-3 words max
- Return ONLY a JSON array of strings, nothing else

Sentence: "${sentence}"

Example: "I'm going to give up on this project" → ["I'm", "going to", "give up on", "this project"]`
        }]
      })
    });
    const data = await response.json();
    const text = data.content[0].text.trim();
    const clean = text.replace(/```json|```/g, "").trim();
    const chunks = JSON.parse(clean);
    if (Array.isArray(chunks) && chunks.length > 0) return chunks;
  } catch (e) {
    console.error("Chunk split error:", e);
  }
  // 폴백: 단순 단어 분리
  return sentence.split(" ");
}

const C = {
  bg: "#F7F8FC", card: "#FFFFFF", primary: "#2D6BE4",
  success: "#22C55E", danger: "#EF4444", warn: "#F59E0B",
  text: "#111827", sub: "#6B7280", border: "#E5E7EB", pill: "#EEF2FF",
};

const S = {
  card: { background: C.card, borderRadius: 16, padding: "16px 20px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" },
  btn: { borderRadius: 10, padding: "11px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", border: "none", transition: "opacity .15s" },
  input: { width: "100%", borderRadius: 10, border: `1.5px solid ${C.border}`, padding: "11px 14px", fontSize: 14, outline: "none", boxSizing: "border-box", background: "#fff", color: "#111827" },
  label: { fontSize: 14, fontWeight: 700, color: C.sub, marginBottom: 8, letterSpacing: 0.3 },
  listTitle: { fontWeight: 700, color: C.text, fontSize: 16, textAlign: "left" },
  listSub: { fontSize: 13, color: C.sub, marginTop: 3, textAlign: "left" },
  page: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column", fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif", overflowY: "auto", userSelect: "none", WebkitUserSelect: "none" },
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
  const [fsLoading, setFsLoading] = useState(false);

  const [progress, setProgressRaw] = useState({});
  const [studyDays, setStudyDaysRaw] = useState([]);
  const [quizProgress, setQuizProgressRaw] = useState({});
  const [favorites, setFavoritesRaw] = useState({});

  const saveTimer = useRef(null);
  const pendingSave = useRef({});

  const saveToFirestore = useCallback((uid, patch) => {
    if (!uid) return;
    pendingSave.current = { ...pendingSave.current, ...patch };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const ref = userDocRef(uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          await updateDoc(ref, pendingSave.current);
        } else {
          await setDoc(ref, pendingSave.current);
        }
        pendingSave.current = {};
      } catch (e) {
        console.error("Firestore save error:", e);
      }
    }, 1000);
  }, []);

  const setProgress = useCallback((updater) => {
    setProgressRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (user?.uid) saveToFirestore(user.uid, { progress: next });
      return next;
    });
  }, [user, saveToFirestore]);

  const setStudyDays = useCallback((updater) => {
    setStudyDaysRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (user?.uid) saveToFirestore(user.uid, { studyDays: next });
      return next;
    });
  }, [user, saveToFirestore]);

  const setQuizProgress = useCallback((updater) => {
    setQuizProgressRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (user?.uid) saveToFirestore(user.uid, { quizProgress: next });
      return next;
    });
  }, [user, saveToFirestore]);

  const setFavorites = useCallback((updater) => {
    setFavoritesRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (user?.uid) saveToFirestore(user.uid, { favorites: next });
      return next;
    });
  }, [user, saveToFirestore]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        setFsLoading(true);
        const data = await loadFromFirestore(u.uid);
        setProgressRaw(data.progress);
        setStudyDaysRaw(data.studyDays);
        setQuizProgressRaw(data.quizProgress);
        setFavoritesRaw(data.favorites);
        setFsLoading(false);
      } else {
        setProgressRaw({});
        setStudyDaysRaw([]);
        setQuizProgressRaw({});
        setFavoritesRaw({});
      }
      setAuthLoading(false);
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

  const screenHistory = useRef(["home"]);
  useEffect(() => {
    const handlePopState = () => {
      const history = screenHistory.current;
      if (history.length > 1) {
        history.pop();
        setScreen(history[history.length - 1]);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const go = (s, navUpdate = {}) => {
    screenHistory.current.push(s);
    window.history.pushState(null, "", window.location.pathname);
    setNav(p => ({ ...p, ...navUpdate }));
    setScreen(s);
  };
  const login = async () => { try { await signInWithPopup(auth, provider); } catch (e) { console.error(e); } };
  const logout = async () => { await signOut(auth); };

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

  if (authLoading || fsLoading) return <Center>{authLoading ? "로딩 중..." : "학습 데이터 불러오는 중..."}</Center>;
  if (!user) return <LoginScreen login={login} />;
  if (dataLoading) return <Center>데이터 불러오는 중...</Center>;

  const shared = { user, logout, go, nav, categories, sources, lessons, items, progress, setProgress, studyDays, setStudyDays, reviewItems, quizProgress, setQuizProgress, favorites, setFavorites };

  return (
    <>
      {screen === "home" && <HomeScreen {...shared} />}
      {screen === "calendar" && <CalendarScreen {...shared} />}
      {screen === "source" && <SourceScreen {...shared} />}
      {screen === "lesson" && <LessonScreen {...shared} />}
      {screen === "lessonSteps" && <LessonStepsScreen {...shared} />}
      {screen === "study" && <StudyScreen {...shared} />}
      {screen === "stepVideo" && <StepVideoScreen {...shared} />}
      {screen === "stepRead" && <StepReadScreen {...shared} />}
      {screen === "stepBuild" && <StepBuildScreen {...shared} />}
      {screen === "stepQuiz" && <StepQuizScreen {...shared} />}
      {screen === "review" && <ReviewScreen {...shared} />}
      {screen === "scriptLesson" && <ScriptLessonListScreen {...shared} />}
      {screen === "scriptItem" && <ScriptLessonScreen {...shared} />}
      {screen === "favoriteList" && <FavoriteListScreen {...shared} />}
      {screen === "favoriteQuiz" && <FavoriteQuizScreen {...shared} />}
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
      <div style={{ fontSize: 14, color: "#555", marginBottom: 48, textAlign: "center", wordBreak: "keep-all", padding: "0 8px" }}>구글 계정으로 로그인하고<br/>나만의 학습을 시작하세요</div>
      <button onClick={login} style={{ ...S.btn, background: "#fff", color: "#333", padding: "14px 28px", fontSize: 15, display: "flex", alignItems: "center", gap: 10, borderRadius: 14 }}>
        <img src="https://www.google.com/favicon.ico" width={18} height={18} alt="Google" />
        Google 로그인
      </button>
    </div>
  );
}

function HomeScreen({ user, logout, go, categories, sources, lessons, items, progress, studyDays, reviewItems, quizProgress, favorites }) {
  const [showMenu, setShowMenu] = useState(false);
  const getCatSources = (catId) => sources.filter(s => s.CategoryID === catId);
  const favCount = Object.keys(favorites).length;

  return (
    <div style={S.page}>
      <div style={S.pageInner}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>HOME</div>
          <div style={{ position: "relative" }}>
            <img src={profileImg} width={38} height={38}
              style={{ borderRadius: "50%", cursor: "pointer", border: `2px solid ${C.border}` }}
              onClick={() => setShowMenu(p => !p)} alt="프로필" />
            {showMenu && (
              <div style={{ position: "absolute", right: 0, top: 46, background: "#fff", borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", padding: 6, minWidth: 150, zIndex: 100 }}>
                <div style={{ padding: "10px 14px", fontSize: 12, color: C.sub, borderBottom: `1px solid ${C.border}` }}>{user.email}</div>
                <div onClick={logout} style={{ padding: "10px 14px", cursor: "pointer", borderRadius: 8, fontSize: 13, fontWeight: 600, color: C.danger }}>로그아웃</div>
                <div onClick={async () => {
                  if (window.confirm("정말 탈퇴하시겠어요? 모든 학습 데이터가 삭제됩니다.")) {
                    try { await user.delete(); } catch(e) {
                      await signInWithPopup(auth, provider);
                      await user.delete();
                    }
                  }
                }} style={{ padding: "10px 14px", cursor: "pointer", borderRadius: 8, fontSize: 13, fontWeight: 600, color: C.danger }}>탈퇴</div>
              </div>
            )}
          </div>
        </div>

        {/* 학습일수 */}
        <div onClick={() => go("calendar")} style={{ ...S.card, background: "#FFD966", cursor: "pointer", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ flex: 1, textAlign: "center" }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: "#333" }}>🔥 학습 일수 &nbsp; {studyDays.length}일</span>
          </div>
          <div style={{ fontSize: 28, opacity: 0.4 }}>🗓️</div>
        </div>

        <TodayLesson go={go} lessons={lessons} sources={sources} items={items} progress={progress} quizProgress={quizProgress} />

        {/* 복습 */}
        <div style={{ marginBottom: 16 }}>
          <div style={S.label}>복습</div>
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

        {/* 저장한 문장 (6번: 이름 변경) */}
        {favCount > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={S.label}>저장한 문장</div>
            <div style={{ ...S.card, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }} onClick={() => go("favoriteList")}>
              <div style={{ flex: 1 }}>
                <div style={S.listTitle}>⭐ 저장한 문장</div>
                <div style={S.listSub}>{favCount}개 문장 저장됨</div>
              </div>
              <div style={{ color: C.sub, fontSize: 18 }}>›</div>
            </div>
          </div>
        )}

        {/* 카테고리 */}
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

// 버그1 수정: TodayLesson - quizProgress가 "done"이거나 없으면 마지막학습 레슨 기준으로
function TodayLesson({ go, lessons, sources, items, progress, quizProgress }) {
  // 진행 중인 레슨 (preview 또는 숫자 - done/null 제외)
  const inProgressLesson = (() => {
    for (const lesson of lessons) {
      const key = `${lesson.LessonID}_${lesson.SourceID}`;
      const saved = quizProgress[key];
      if (saved !== undefined && saved !== null && saved !== "done") {
        return { lesson, savedIdx: saved };
      }
    }
    return null;
  })();

  // 마지막으로 학습 완료(done)한 레슨 찾기
  const lastDoneLesson = (() => {
    let lastLesson = null;
    // quizProgress에서 "done"인 것들 중 progress history가 가장 최근인 레슨
    let lastDate = "";
    Object.entries(progress).forEach(([itemId, prog]) => {
      const history = prog.history || [];
      if (history.length > 0) {
        const lastHistory = history[history.length - 1];
        if (lastHistory.date >= lastDate) {
          lastDate = lastHistory.date;
          const item = items.find(i => i.ItemID === itemId);
          if (item) lastLesson = lessons.find(l => l.LessonID === item.LessonID && l.SourceID === item.SourceID);
        }
      }
    });
    return lastLesson;
  })();

  const nextLesson = (() => {
    // 진행 중인 게 있으면 그걸 우선
    if (inProgressLesson) return inProgressLesson.lesson;
    // 없으면 마지막 완료 레슨의 다음 레슨
    if (!lastDoneLesson) return lessons[0] || null;
    const srcLessons = lessons
      .filter(l => l.SourceID === lastDoneLesson.SourceID)
      .sort((a, b) => Number(a.Order) - Number(b.Order));
    const idx = srcLessons.findIndex(l => l.LessonID === lastDoneLesson.LessonID);
    // 다음 레슨이 있으면 그것, 없으면 다른 소스의 첫 레슨
    return srcLessons[idx + 1] || lessons.find(l => l.SourceID !== lastDoneLesson.SourceID) || srcLessons[0];
  })();

  if (!nextLesson) return null;

  const src = sources.find(s => s.SourceID === nextLesson.SourceID);
  const lessonItems = items.filter(i => i.LessonID === nextLesson.LessonID && i.SourceID === nextLesson.SourceID);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={S.label}>오늘의 레슨</div>
      <div onClick={() => {
        const src = sources.find(s => s.SourceID === nextLesson.SourceID);
        const cat = src ? src.CategoryID : null;
        go("lessonSteps", { lessonId: nextLesson.LessonID, sourceId: nextLesson.SourceID, catId: cat, fromHome: true });
      }} style={{ ...S.card, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, borderLeft: `4px solid ${C.primary}` }}>
        <div style={{ flex: 1 }}>
          <div style={S.listTitle}>{nextLesson.Title}</div>
          <div style={S.listSub}>{src?.Name} · {lessonItems.length}문장 {inProgressLesson ? "· 이어서 학습" : ""}</div>
        </div>
        <div style={{ ...S.btn, background: C.primary, color: "#fff", padding: "8px 16px", fontSize: 13 }}>시작 →</div>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
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
        <div style={{ ...S.label, color: C.primary }}>Script</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {catSources.map(src => {
            const srcLessons = lessons.filter(l => l.SourceID === src.SourceID);
            return (
              <div key={src.SourceID} onClick={() => go("scriptLesson", { sourceId: src.SourceID, catId: nav.catId })} style={{ ...S.card, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
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
          <button onClick={() => go("source")} style={{ ...S.btn, background: C.pill, color: C.primary, padding: "8px 14px", flexShrink: 0 }}>← 뒤로</button>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{src?.Name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {srcLessons.map(lesson => {
            const lessonItems = items.filter(i => i.LessonID === lesson.LessonID && i.SourceID === lesson.SourceID);
            const studied = lessonItems.filter(i => progress[i.ItemID]?.history?.length > 0).length;
            return (
              <div key={lesson.LessonID + lesson.SourceID}
                onClick={() => go("lessonSteps", { lessonId: lesson.LessonID, sourceId: lesson.SourceID })}
                style={{ ...S.card, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
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

// ─── LessonStepsScreen: 레슨 선택 후 단계 목록 ───────────────────────────────
function LessonStepsScreen({ go, nav, lessons, sources, items, progress, quizProgress, setStudyDays, setProgress, setQuizProgress }) {
  const lesson = lessons.find(l => l.LessonID === nav.lessonId && l.SourceID === nav.sourceId);
  const lessonItems = items.filter(i => i.LessonID === nav.lessonId && i.SourceID === nav.sourceId);
  const src = sources.find(s => s.SourceID === nav.sourceId);
  const saveKey = `${nav.lessonId}_${nav.sourceId}`;

  const extractYouTubeId = (url) => {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=)([^&\n?#]+)/);
    return match ? match[1] : null;
  };
  const ytId = extractYouTubeId(lesson?.VideoURL);

  const studiedCount = lessonItems.filter(i => progress[i.ItemID]?.history?.length > 0).length;
  const quizDone = quizProgress[saveKey] === "done";

  const steps = [
    ytId ? { id: "video", icon: "🎬", label: "영상 보기", sub: "유튜브 강의" } : null,
    { id: "read", icon: "🗣️", label: "따라읽기", sub: `${lessonItems.length}문장 × 2회` },
    { id: "build", icon: "🧩", label: "영작하기", sub: "단어 조각으로 문장 만들기" },
    { id: "quiz", icon: "✍️", label: "퀴즈", sub: "직접 영작 테스트", done: quizDone },
  ].filter(Boolean);

  const backScreen = nav.fromHome ? "home" : "lesson";

  return (
    <div style={S.page}>
      <div style={S.pageInner}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <button onClick={() => go(backScreen)} style={{ ...S.btn, background: C.pill, color: C.primary, padding: "8px 14px", flexShrink: 0 }}>← 뒤로</button>
        </div>

        {/* 레슨 정보 */}
        <div style={{ ...S.card, marginBottom: 20, borderLeft: `4px solid ${C.primary}` }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: C.text, marginBottom: 4 }}>{lesson?.Title}</div>
          <div style={{ fontSize: 13, color: C.sub }}>{src?.Name} · {lessonItems.length}문장 {studiedCount > 0 ? `· ${studiedCount}개 학습됨` : ""}</div>
        </div>

        <div style={S.label}>학습 단계</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {steps.map((step, i) => (
            <div key={step.id}
              onClick={() => {
                const screenMap = { video: "stepVideo", read: "stepRead", build: "stepBuild", quiz: "stepQuiz" };
                go(screenMap[step.id], { ...nav, fromLesson: true });
              }}
              style={{ ...S.card, display: "flex", alignItems: "center", gap: 14, cursor: "pointer", border: step.done ? `2px solid ${C.success}` : "none" }}>
              <div style={{ fontSize: 28, minWidth: 36, textAlign: "center" }}>{step.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ ...S.listTitle, display: "flex", alignItems: "center", gap: 8 }}>
                  {step.label}
                  {step.done && <span style={{ fontSize: 11, background: "#DCFCE7", color: C.success, borderRadius: 99, padding: "2px 8px", fontWeight: 700 }}>완료</span>}
                </div>
                <div style={S.listSub}>{step.sub}</div>
              </div>
              <div style={{ color: C.sub, fontSize: 18 }}>›</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── StepVideoScreen ─────────────────────────────────────────────────────────
function StepVideoScreen({ go, nav, lessons }) {
  const lesson = lessons.find(l => l.LessonID === nav.lessonId && l.SourceID === nav.sourceId);
  const extractYouTubeId = (url) => {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=)([^&\n?#]+)/);
    return match ? match[1] : null;
  };
  const ytId = extractYouTubeId(lesson?.VideoURL);

  return (
    <div style={S.page}>
      <div style={S.pageInner}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <button onClick={() => go("lessonSteps")} style={{ ...S.btn, background: C.pill, color: C.primary, padding: "8px 14px" }}>← 뒤로</button>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>🎬 영상 보기</div>
        </div>
        <div style={{ fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 12 }}>{lesson?.Title}</div>
        {ytId ? (
          <>
            <div style={{ borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
              <iframe width="100%" height="240" src={`https://www.youtube.com/embed/${ytId}`} title="YouTube" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ display: "block" }} />
            </div>
            <button onClick={() => go("stepRead", nav)} style={{ ...S.btn, background: C.primary, color: "#fff", width: "100%", padding: 14, fontSize: 15 }}>
              다음: 따라읽기 →
            </button>
          </>
        ) : (
          <div style={{ ...S.card, color: C.sub, textAlign: "center" }}>영상이 없는 레슨이에요</div>
        )}
      </div>
    </div>
  );
}

// ─── StepReadScreen: 따라읽기 2회 ────────────────────────────────────────────
function StepReadScreen({ go, nav, lessons, items, setStudyDays }) {
  const lesson = lessons.find(l => l.LessonID === nav.lessonId && l.SourceID === nav.sourceId);
  const lessonItems = items.filter(i => i.LessonID === nav.lessonId && i.SourceID === nav.sourceId);
  const [idx, setIdx] = useState(0);
  const [round, setRound] = useState(1); // 1회차, 2회차
  const [isListening, setIsListening] = useState(false);
  const [repeatCount, setRepeatCount] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const recRef = useRef(null);

  const item = lessonItems[idx];

  useEffect(() => {
    setRepeatCount(0);
    setFeedback(null);
    const timer = setTimeout(() => speak(item?.English), 1500);
    return () => clearTimeout(timer);
  }, [idx, round, item?.English]);

  const startRepeat = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Chrome을 사용해주세요."); return; }
    setTimeout(() => {
      const r = new SR();
      r.lang = "en-US"; r.continuous = true; r.interimResults = false;
      r.onresult = e => {
        const result = e.results[e.results.length - 1];
        if (!result || !result[0]) return;
        const said = result[0].transcript.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
        if (!said || said.length < 2) return; // 버그2,3 수정: 너무 짧거나 빈 결과 무시
        const expected = item.English.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
        const words = expected.split(" ");
        const matchRatio = words.filter(w => said.includes(w)).length / words.length;
        const isGood = matchRatio >= 0.6; // 60% 이상 맞으면 good
        setFeedback(isGood ? "good" : "try");
        setRepeatCount(p => p + 1);
      };
      r.onerror = () => setIsListening(false);
      r.start();
      recRef.current = r;
      setIsListening(true);
    }, 300);
  };

  const stopRepeat = () => {
    recRef.current?.stop();
    setIsListening(false);
  };

  const handleNext = () => {
    if (idx < lessonItems.length - 1) {
      setIdx(p => p + 1);
    } else if (round === 1) {
      // 2회차 시작
      setRound(2);
      setIdx(0);
    } else {
      // 완료
      setStudyDays(prev => prev.includes(today()) ? prev : [...prev, today()]);
      go("lessonSteps");
    }
  };

  const totalItems = lessonItems.length * 2;
  const currentNum = round === 1 ? idx + 1 : lessonItems.length + idx + 1;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px 16px", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <button onClick={() => go("lessonSteps")} style={{ ...S.btn, background: C.pill, color: C.primary, padding: "8px 14px" }}>← 뒤로</button>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🗣️ 따라읽기 {round}회차</div>
          <div style={{ fontSize: 12, color: C.sub, flexShrink: 0 }}>{currentNum}/{totalItems}</div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ height: 6, background: C.border, borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.round((currentNum / totalItems) * 100)}%`, background: C.primary, borderRadius: 99, transition: "width 0.3s" }} />
          </div>
        </div>

        {/* 라운드 표시 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <div style={{ flex: 1, padding: "6px 0", borderRadius: 8, background: round >= 1 ? C.primary : C.border, color: round >= 1 ? "#fff" : C.sub, fontSize: 12, fontWeight: 700, textAlign: "center" }}>1회차</div>
          <div style={{ flex: 1, padding: "6px 0", borderRadius: 8, background: round >= 2 ? C.primary : C.border, color: round >= 2 ? "#fff" : C.sub, fontSize: 12, fontWeight: 700, textAlign: "center" }}>2회차</div>
        </div>

        <div style={{ ...S.card, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", marginBottom: 16, padding: "24px 20px" }}>
          <div style={{ color: C.sub, fontSize: 18, lineHeight: 1.6, marginBottom: 20 }}>{item?.Korean}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text, lineHeight: 1.6, marginBottom: 20 }}>{item?.English}</div>

          <div style={{ display: "flex", gap: 10, width: "100%", marginBottom: 12 }}>
            <button onClick={() => speak(item?.English)} style={{ ...S.btn, flex: 1, background: C.pill, color: C.primary, fontSize: 13 }}>🔊 듣기</button>
            {!isListening ? (
              <button onClick={startRepeat} style={{ ...S.btn, flex: 1, background: "#FEF3C7", color: "#92400E", fontSize: 13 }}>🎤 따라하기</button>
            ) : (
              <button onClick={stopRepeat} style={{ ...S.btn, flex: 1, background: "#FEE2E2", color: C.danger, fontSize: 13 }}>⏹ 완료</button>
            )}
          </div>

          {feedback && (
            <div style={{ fontSize: 14, fontWeight: 700, color: feedback === "good" ? C.success : C.warn }}>
              {feedback === "good" ? "✅ 잘 했어요!" : "🔄 다시 해봐요!"}
            </div>
          )}
          {repeatCount > 0 && <div style={{ marginTop: 6, fontSize: 12, color: C.sub }}>따라읽기 {repeatCount}회</div>}
        </div>

        <button onClick={handleNext}
          style={{ ...S.btn, width: "100%", background: C.primary, color: "#fff", padding: 14, fontSize: 15 }}>
          {idx < lessonItems.length - 1 ? "다음 문장 →" : round === 1 ? "2회차 시작 →" : "완료 ✓"}
        </button>
      </div>
    </div>
  );
}

// ─── StepBuildScreen: 영작하기 (단어 조각 선택) ───────────────────────────────
function StepBuildScreen({ go, nav, lessons, items, setStudyDays }) {
  const lesson = lessons.find(l => l.LessonID === nav.lessonId && l.SourceID === nav.sourceId);
  const lessonItems = items.filter(i => i.LessonID === nav.lessonId && i.SourceID === nav.sourceId);
  const [idx, setIdx] = useState(0);
  const [chunks, setChunks] = useState(null); // null = 로딩중
  const [shuffledChunks, setShuffledChunks] = useState([]);
  const [selected, setSelected] = useState([]); // 선택된 청크 인덱스 순서
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(false);

  const item = lessonItems[idx];

  useEffect(() => {
    if (!item) return;
    setChunks(null);
    setSelected([]);
    setSubmitted(false);
    setCorrect(false);
    // AI로 의미단위 분리
    splitIntoChunks(item.English).then(result => {
      setChunks(result);
      // 셔플
      const indices = result.map((_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      setShuffledChunks(indices);
    });
  }, [idx, item?.English]);

  const handleSelect = (shuffleIdx) => {
    if (submitted) return;
    const chunkIdx = shuffledChunks[shuffleIdx];
    if (selected.includes(shuffleIdx)) {
      setSelected(p => p.filter(i => i !== shuffleIdx));
    } else {
      setSelected(p => [...p, shuffleIdx]);
    }
  };

  const handleSubmit = () => {
    const built = selected.map(si => chunks[shuffledChunks[si]]).join(" ");
    const expected = item.English.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const given = built.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    setCorrect(expected === given);
    setSubmitted(true);
  };

  const handleNext = () => {
    if (idx < lessonItems.length - 1) {
      setIdx(p => p + 1);
    } else {
      setStudyDays(prev => prev.includes(today()) ? prev : [...prev, today()]);
      go("lessonSteps");
    }
  };

  const builtSentence = selected.map(si => chunks?.[shuffledChunks[si]] || "").join(" ");

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px 16px", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <button onClick={() => go("lessonSteps")} style={{ ...S.btn, background: C.pill, color: C.primary, padding: "8px 14px" }}>← 뒤로</button>
          <div style={{ fontWeight: 700, fontSize: 13, flex: 1, color: C.text }}>🧩 영작하기</div>
          <div style={{ fontSize: 12, color: C.sub }}>{idx + 1}/{lessonItems.length}</div>
        </div>

        <div style={{ height: 6, background: C.border, borderRadius: 99, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ height: "100%", width: `${Math.round(((idx) / lessonItems.length) * 100)}%`, background: "#F59E0B", borderRadius: 99, transition: "width 0.3s" }} />
        </div>

        {/* 한국어 문제 */}
        <div style={{ ...S.card, marginBottom: 12, padding: "16px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.sub, fontWeight: 600, marginBottom: 6 }}>다음을 영어로 만드세요</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text, lineHeight: 1.5 }}>{item?.Korean}</div>
        </div>

        {/* 완성 중인 문장 표시 */}
        <div style={{ ...S.card, minHeight: 60, marginBottom: 12, padding: "12px 16px", background: submitted ? (correct ? "#F0FDF4" : "#FEF2F2") : "#F8FAFF", border: submitted ? `2px solid ${correct ? C.success : C.danger}` : `2px dashed ${C.border}`, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {selected.length === 0 ? (
            <div style={{ color: C.sub, fontSize: 13, width: "100%", textAlign: "center" }}>단어를 선택하세요</div>
          ) : (
            selected.map((si, i) => (
              <span key={i} onClick={() => !submitted && handleSelect(si)}
                style={{ background: submitted ? (correct ? "#DCFCE7" : "#FEE2E2") : C.primary, color: submitted ? (correct ? C.success : C.danger) : "#fff", borderRadius: 8, padding: "5px 10px", fontSize: 14, fontWeight: 600, cursor: submitted ? "default" : "pointer" }}>
                {chunks?.[shuffledChunks[si]]}
              </span>
            ))
          )}
        </div>

        {submitted && (
          <div style={{ ...S.card, marginBottom: 12, padding: "12px 16px", textAlign: "center", background: correct ? "#F0FDF4" : "#FEF2F2" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: correct ? C.success : C.danger, marginBottom: 4 }}>
              {correct ? "✅ 정답이에요!" : "❌ 다시 확인해봐요"}
            </div>
            <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{item?.English}</div>
            <button onClick={() => speak(item?.English)} style={{ ...S.btn, background: C.pill, color: C.primary, fontSize: 12, padding: "5px 12px", marginTop: 8 }}>🔊 듣기</button>
          </div>
        )}

        {/* 단어 보기 (로딩 or 청크 버튼) */}
        {chunks === null ? (
          <div style={{ ...S.card, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.sub, fontSize: 13 }}>
            🤔 단어 분석 중...
          </div>
        ) : (
          <div style={{ ...S.card, flex: 1, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: C.sub, fontWeight: 600, marginBottom: 10 }}>단어 선택</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {shuffledChunks.map((chunkIdx, si) => {
                const isSelected = selected.includes(si);
                return (
                  <button key={si} onClick={() => handleSelect(si)} disabled={submitted}
                    style={{ ...S.btn, padding: "8px 14px", fontSize: 14, background: isSelected ? "#E0E7FF" : C.card, color: isSelected ? C.primary : C.text, border: `1.5px solid ${isSelected ? C.primary : C.border}`, opacity: submitted ? 0.6 : 1, fontWeight: 600 }}>
                    {chunks[chunkIdx]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
          {!submitted ? (
            <>
              <button onClick={() => setSelected([])} style={{ ...S.btn, flex: 1, background: C.border, color: C.text }}>초기화</button>
              <button onClick={handleSubmit} disabled={selected.length === 0}
                style={{ ...S.btn, flex: 2, background: selected.length > 0 ? C.primary : C.border, color: selected.length > 0 ? "#fff" : C.sub }}>
                확인
              </button>
            </>
          ) : (
            <button onClick={handleNext} style={{ ...S.btn, flex: 1, background: C.primary, color: "#fff", padding: 14, fontSize: 15 }}>
              {idx < lessonItems.length - 1 ? "다음 →" : "완료 ✓"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── StepQuizScreen: 퀴즈 (직접 영작) ─────────────────────────────────────────
function StepQuizScreen({ go, nav, lessons, items, progress, setProgress, setStudyDays, quizProgress, setQuizProgress }) {
  const lesson = lessons.find(l => l.LessonID === nav.lessonId && l.SourceID === nav.sourceId);
  const lessonItems = items.filter(i => i.LessonID === nav.lessonId && i.SourceID === nav.sourceId);
  const saveKey = `${nav.lessonId}_${nav.sourceId}`;

  const [quizIdx, setQuizIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [listening, setListening] = useState(false);
  const [done, setDone] = useState(false);
  const recRef = useRef(null);

  const startMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Chrome을 사용해주세요."); return; }
    const r = new SR();
    r.lang = "en-US"; r.continuous = true; r.interimResults = false;
    r.onresult = e => {
      const result = e.results[e.results.length - 1];
      if (!result || !result[0]) return;
      const said = result[0].transcript;
      if (!said.trim()) return;
      setAnswer(said);
    };
    r.onerror = () => setListening(false);
    r.start(); recRef.current = r; setListening(true);
  };
  const stopMic = () => { recRef.current?.stop(); setListening(false); };

  const checkAnswer = () => {
    const expected = lessonItems[quizIdx].English.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const given = answer.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    setCorrect(expected === given); setSubmitted(true);
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
      setQuizProgress(prev => ({ ...prev, [saveKey]: "done" }));
      setDone(true);
    } else {
      const nextIdx = quizIdx + 1;
      setQuizProgress(prev => ({ ...prev, [saveKey]: String(nextIdx) }));
      setQuizIdx(nextIdx); setAnswer(""); setSubmitted(false); setCorrect(false);
    }
  };

  if (done) return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <img src={duck2Img} width={120} height={120} alt="완료" style={{ marginBottom: 24, objectFit: "contain" }} />
      <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>퀴즈 완료!</div>
      <div style={{ color: C.sub, fontSize: 14, marginBottom: 32 }}>{lessonItems.length}문장 모두 완료했어요 🎉</div>
      <button onClick={() => go("lessonSteps")} style={{ ...S.btn, background: C.primary, color: "#fff", width: "100%", maxWidth: 320, padding: 16, fontSize: 15 }}>← 레슨으로</button>
    </div>
  );

  const item = lessonItems[quizIdx];
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px 16px", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => go("lessonSteps")} style={{ ...S.btn, background: C.pill, color: C.primary, padding: "8px 14px" }}>← 뒤로</button>
              <div style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>✍️ 퀴즈 {quizIdx + 1}/{lessonItems.length}</div>
            </div>
          </div>
          <div style={{ height: 6, background: C.border, borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.round((quizIdx / lessonItems.length) * 100)}%`, background: C.primary, borderRadius: 99, transition: "width 0.3s" }} />
          </div>
        </div>

        {!submitted ? (
          <>
            <div style={{ ...S.card, marginBottom: 12, padding: "14px 16px", textAlign: "center" }}>
              <div style={{ color: C.sub, fontSize: 11, marginBottom: 6, fontWeight: 600 }}>다음을 영어로 작성하세요</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: C.text, lineHeight: 1.5 }}>{item.Korean}</div>
              <button onClick={() => speak(item.English)} style={{ ...S.btn, background: C.pill, color: C.primary, fontSize: 12, padding: "6px 14px", marginTop: 10 }}>🔊 정답 듣기</button>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", marginBottom: 12 }}>
              <textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="영어로 입력하세요..."
                style={{ ...S.input, flex: 1, resize: "none", fontSize: 16, padding: "14px", lineHeight: 1.6, minHeight: 120 }} />
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              {!listening ? (
                <button onClick={startMic} style={{ ...S.btn, flex: 1, background: "#FEF3C7", color: "#92400E", fontSize: 14 }}>🎤 마이크로 입력</button>
              ) : (
                <button onClick={stopMic} style={{ ...S.btn, flex: 1, background: "#FEE2E2", color: C.danger, fontSize: 14 }}>⏹ 녹음 완료</button>
              )}
            </div>
            {listening && <div style={{ textAlign: "center", color: C.primary, fontSize: 13, marginBottom: 8, fontWeight: 600 }}>🎤 듣고 있어요... 말한 후 ⏹ 누르세요</div>}
            <button onClick={checkAnswer} disabled={!answer.trim()} style={{ ...S.btn, width: "100%", background: C.primary, color: "#fff", opacity: !answer.trim() ? 0.4 : 1 }}>제출</button>
          </>
        ) : (
          <>
            <div style={{ ...S.card, flex: 1, border: `2px solid ${correct ? C.success : C.danger}`, marginBottom: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>{correct ? "⭕" : "❌"}</div>
              <div style={{ fontWeight: 700, color: C.text, fontSize: 16, lineHeight: 1.6, marginBottom: 8 }}>{item.English}</div>
              {answer && <div style={{ color: C.sub, fontSize: 13 }}>내 답: {answer}</div>}
              <button onClick={() => speak(item.English)} style={{ ...S.btn, background: C.pill, color: C.primary, fontSize: 13, marginTop: 12 }}>🔊 정답 듣기</button>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => recordResult("x")} style={{ ...S.btn, flex: 1, background: "#FEE2E2", color: C.danger, fontSize: 13 }}>✗ 다시 학습</button>
              <button onClick={() => recordResult("o")} style={{ ...S.btn, flex: 1, background: "#DCFCE7", color: C.success, fontSize: 14 }}>✓ 다음</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── StudyScreen (기존 호환용 - 홈의 오늘의레슨에서 직접 lessonSteps로 감) ────
function StudyScreen({ go, nav }) {
  useEffect(() => {
    go("lessonSteps", nav);
  }, []);
  return <Center>이동 중...</Center>;
}

// ─── ReviewScreen ────────────────────────────────────────────────────────────
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
      <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>복습 완료!</div>
      <div style={{ color: C.sub, fontSize: 14, marginBottom: 32 }}>{reviewItems.length}개 문장을 모두 복습했어요</div>
      <button onClick={() => go("home")} style={{ ...S.btn, background: C.primary, color: "#fff", width: "100%", maxWidth: 320, padding: 16 }}>홈으로</button>
    </div>
  );

  const item = reviewItems[idx];

  const startMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR(); r.lang = "en-US"; r.continuous = true; r.interimResults = false;
    r.onresult = e => {
      const result = e.results[e.results.length - 1];
      if (!result || !result[0]) return;
      const said = result[0].transcript;
      if (!said.trim()) return;
      setAnswer(said);
    };
    r.onerror = () => setListening(false);
    r.start(); recRef.current = r; setListening(true);
  };
  const stopMic = () => { recRef.current?.stop(); setListening(false); };

  const checkAnswer = () => {
    const expected = item.English.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const given = answer.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    setCorrect(expected === given); setSubmitted(true);
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

  const handleQuit = () => {
    setStudyDays(prev => prev.includes(today()) ? prev : [...prev, today()]);
    go("home");
  };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px 16px", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button onClick={() => go("home")} style={{ ...S.btn, background: C.pill, color: C.primary, padding: "8px 14px" }}>← 홈</button>
          <div style={{ fontWeight: 600, fontSize: 13, color: C.sub }}>{idx + 1} / {reviewItems.length}</div>
          <button onClick={handleQuit} style={{ ...S.btn, background: "#FEE2E2", color: C.danger, padding: "5px 12px", fontSize: 12 }}>그만하기</button>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ height: 6, background: C.border, borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.round((idx / reviewItems.length) * 100)}%`, background: C.warn, borderRadius: 99, transition: "width 0.3s" }} />
          </div>
          <div style={{ fontSize: 11, color: C.sub, textAlign: "right", marginTop: 3 }}>{Math.round((idx / reviewItems.length) * 100)}% 완료</div>
        </div>
        <div style={{ ...S.card, marginBottom: 12, background: "#FEF9C3", border: `1px solid ${C.warn}`, padding: "8px 14px" }}>
          <div style={{ fontSize: 11, color: C.warn, fontWeight: 700 }}>🔁 에빙하우스 복습</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{item.lessonTitle}</div>
        </div>
        {!submitted ? (
          <>
            <div style={{ ...S.card, marginBottom: 12, padding: "14px 16px", textAlign: "center" }}>
              <div style={{ color: C.sub, fontSize: 11, marginBottom: 6, fontWeight: 600 }}>영어로 작성하세요</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: C.text, lineHeight: 1.5 }}>{item.Korean}</div>
              <button onClick={() => speak(item.English)} style={{ ...S.btn, background: C.pill, color: C.primary, fontSize: 12, padding: "6px 14px", marginTop: 10 }}>🔊 정답 듣기</button>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", marginBottom: 12 }}>
              <textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="영어로 입력하세요..."
                style={{ ...S.input, flex: 1, resize: "none", fontSize: 16, padding: "14px", lineHeight: 1.6, minHeight: 120 }} />
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              {!listening ? (
                <button onClick={startMic} style={{ ...S.btn, flex: 1, background: "#FEF3C7", color: "#92400E", fontSize: 14 }}>🎤 마이크로 입력</button>
              ) : (
                <button onClick={stopMic} style={{ ...S.btn, flex: 1, background: "#FEE2E2", color: C.danger, fontSize: 14 }}>⏹ 녹음 완료</button>
              )}
            </div>
            {listening && <div style={{ textAlign: "center", color: C.primary, fontSize: 13, marginBottom: 8, fontWeight: 600 }}>🎤 듣고 있어요... 말한 후 ⏹ 누르세요</div>}
            <button onClick={checkAnswer} disabled={!answer.trim()} style={{ ...S.btn, width: "100%", background: C.primary, color: "#fff", opacity: !answer.trim() ? 0.4 : 1 }}>제출</button>
          </>
        ) : (
          <>
            <div style={{ ...S.card, flex: 1, border: `2px solid ${correct ? C.success : C.danger}`, marginBottom: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>{correct ? "⭕" : "❌"}</div>
              <div style={{ fontWeight: 700, color: C.text, fontSize: 16, lineHeight: 1.6 }}>{item.English}</div>
              {answer && <div style={{ color: C.sub, fontSize: 13, marginTop: 8 }}>내 답: {answer}</div>}
              <button onClick={() => speak(item.English)} style={{ ...S.btn, background: C.pill, color: C.primary, fontSize: 13, marginTop: 12 }}>🔊 정답 듣기</button>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => recordResult("x")} style={{ ...S.btn, flex: 1, background: "#FEE2E2", color: C.danger, fontSize: 13 }}>✗ 다시 학습</button>
              <button onClick={() => recordResult("o")} style={{ ...S.btn, flex: 1, background: "#DCFCE7", color: C.success, fontSize: 14 }}>✓ 다음</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── ScriptLessonListScreen ──────────────────────────────────────────────────
function ScriptLessonListScreen({ go, nav, sources, lessons, items }) {
  const src = sources.find(s => s.SourceID === nav.sourceId);
  const srcLessons = lessons.filter(l => l.SourceID === nav.sourceId).sort((a, b) => Number(a.Order) - Number(b.Order));
  return (
    <div style={S.page}>
      <div style={S.pageInner}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => go("source")} style={{ ...S.btn, background: C.pill, color: C.primary, padding: "8px 14px", flexShrink: 0 }}>← 뒤로</button>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{src?.Name}</div>
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

// ─── ScriptLessonScreen ──────────────────────────────────────────────────────
function ScriptLessonScreen({ go, nav, sources, lessons, items, favorites, setFavorites }) {
  const srcLessons = lessons.filter(l => l.SourceID === nav.sourceId).sort((a, b) => Number(a.Order) - Number(b.Order));
  const lesson = srcLessons.find(l => l.LessonID === nav.lessonId);
  const lessonItems = items.filter(i => i.LessonID === nav.lessonId && i.SourceID === nav.sourceId);

  const toggleFav = (itemId) => {
    setFavorites(prev => {
      const next = { ...prev };
      if (next[itemId]) { delete next[itemId]; } else { next[itemId] = true; }
      return next;
    });
  };

  return (
    <div style={S.page}>
      <div style={S.pageInner}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => go("scriptLesson", { sourceId: nav.sourceId })} style={{ ...S.btn, background: C.pill, color: C.primary, padding: "8px 14px", flexShrink: 0 }}>← 뒤로</button>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lesson?.Title}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {lessonItems.map((item) => (
            <div key={item.ItemID} style={{ ...S.card, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <button onClick={() => toggleFav(item.ItemID)}
                  style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", padding: "2px 4px", color: favorites[item.ItemID] ? "#F59E0B" : "#D1D5DB" }}>
                  {favorites[item.ItemID] ? "★" : "☆"}
                </button>
              </div>
              <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.6, marginBottom: 12 }}>{item.Korean}</div>
              <div style={{ fontSize: 15, color: C.text, fontWeight: 600, lineHeight: 1.6 }}>{item.English}</div>
              <button onClick={() => speak(item.English)} style={{ ...S.btn, background: C.pill, color: C.primary, fontSize: 12, padding: "5px 12px", marginTop: 10 }}>🔊 듣기</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── FavoriteListScreen: 저장한 문장 목록 (7번) ──────────────────────────────
function FavoriteListScreen({ go, items, lessons, favorites, setFavorites }) {
  const favItems = items.filter(i => favorites[i.ItemID]).map(i => {
    const lesson = lessons.find(l => l.LessonID === i.LessonID && l.SourceID === i.SourceID);
    return { ...i, lessonTitle: lesson?.Title || "" };
  });

  const toggleFav = (itemId) => {
    setFavorites(prev => {
      const next = { ...prev };
      if (next[itemId]) { delete next[itemId]; } else { next[itemId] = true; }
      return next;
    });
  };

  if (favItems.length === 0) return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>⭐</div>
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>저장한 문장이 없어요</div>
      <div style={{ color: C.sub, fontSize: 14, marginBottom: 32 }}>스크립트에서 ☆를 눌러 저장해보세요</div>
      <button onClick={() => go("home")} style={{ ...S.btn, background: C.primary, color: "#fff", padding: "12px 28px" }}>홈으로</button>
    </div>
  );

  return (
    <div style={S.page}>
      <div style={S.pageInner}>
        {/* 8번: 오른쪽 상단에 랜덤 QUIZ 버튼 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => go("home")} style={{ ...S.btn, background: C.pill, color: C.primary, padding: "8px 14px", flexShrink: 0 }}>← 홈</button>
          <div style={{ fontWeight: 700, fontSize: 16, flex: 1, color: C.text }}>⭐ 저장한 문장</div>
          <button onClick={() => go("favoriteQuiz")} style={{ ...S.btn, background: "#F59E0B", color: "#fff", padding: "8px 14px", fontSize: 13, flexShrink: 0 }}>랜덤 QUIZ</button>
        </div>

        <div style={{ fontSize: 13, color: C.sub, marginBottom: 12 }}>{favItems.length}개 문장 저장됨</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {favItems.map((item) => (
            <div key={item.ItemID} style={{ ...S.card, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: C.sub }}>{item.lessonTitle}</div>
                <button onClick={() => toggleFav(item.ItemID)}
                  style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: "0 4px", color: "#F59E0B" }}>★</button>
              </div>
              <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.6, marginBottom: 8 }}>{item.Korean}</div>
              <div style={{ fontSize: 15, color: C.text, fontWeight: 600, lineHeight: 1.6 }}>{item.English}</div>
              <button onClick={() => speak(item.English)} style={{ ...S.btn, background: C.pill, color: C.primary, fontSize: 12, padding: "5px 12px", marginTop: 10 }}>🔊 듣기</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── FavoriteQuizScreen: 랜덤 퀴즈 (9번) ────────────────────────────────────
function FavoriteQuizScreen({ go, items, lessons, favorites, setProgress, setStudyDays }) {
  const favItems = items.filter(i => favorites[i.ItemID]).map(i => {
    const lesson = lessons.find(l => l.LessonID === i.LessonID && l.SourceID === i.SourceID);
    return { ...i, lessonTitle: lesson?.Title || "", itemId: i.ItemID };
  });

  const [shuffled] = useState(() => [...favItems].sort(() => Math.random() - 0.5));
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  if (shuffled.length === 0) return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>⭐</div>
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>저장한 문장이 없어요</div>
      <div style={{ color: C.sub, fontSize: 14, marginBottom: 32 }}>스크립트에서 ☆를 눌러 저장해보세요</div>
      <button onClick={() => go("home")} style={{ ...S.btn, background: C.primary, color: "#fff", padding: "12px 28px" }}>홈으로</button>
    </div>
  );

  if (idx >= shuffled.length) return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
      <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>퀴즈 완료!</div>
      <div style={{ color: C.sub, fontSize: 14, marginBottom: 32 }}>{shuffled.length}개 문장 퀴즈를 완료했어요</div>
      <button onClick={() => go("favoriteList")} style={{ ...S.btn, background: C.primary, color: "#fff", width: "100%", maxWidth: 320, padding: 16 }}>← 목록으로</button>
    </div>
  );

  const item = shuffled[idx];

  const startMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR(); r.lang = "en-US"; r.continuous = true; r.interimResults = false;
    r.onresult = e => {
      const result = e.results[e.results.length - 1];
      if (!result || !result[0]) return;
      const said = result[0].transcript;
      if (!said.trim()) return;
      setAnswer(said);
    };
    r.onerror = () => setListening(false);
    r.start(); recRef.current = r; setListening(true);
  };
  const stopMic = () => { recRef.current?.stop(); setListening(false); };

  const checkAnswer = () => {
    const expected = item.English.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const given = answer.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    setCorrect(expected === given); setSubmitted(true);
  };

  const next = (ox) => {
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
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <button onClick={() => go("favoriteList")} style={{ ...S.btn, background: C.pill, color: C.primary, padding: "8px 14px", flexShrink: 0 }}>← 목록</button>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>⭐ 랜덤 QUIZ</div>
          <div style={{ fontWeight: 600, fontSize: 13, color: C.sub, flexShrink: 0, marginLeft: "auto" }}>{idx + 1}/{shuffled.length}</div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ height: 6, background: C.border, borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.round((idx / shuffled.length) * 100)}%`, background: "#F59E0B", borderRadius: 99, transition: "width 0.3s" }} />
          </div>
        </div>

        <div style={{ ...S.card, marginBottom: 10, padding: "8px 14px" }}>
          <div style={{ fontSize: 11, color: C.sub }}>{item.lessonTitle}</div>
        </div>

        {!submitted ? (
          <>
            <div style={{ ...S.card, marginBottom: 12, padding: "14px 16px", textAlign: "center" }}>
              <div style={{ color: C.sub, fontSize: 11, marginBottom: 6, fontWeight: 600 }}>영어로 작성하세요</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: C.text, lineHeight: 1.5 }}>{item.Korean}</div>
              <button onClick={() => speak(item.English)} style={{ ...S.btn, background: C.pill, color: C.primary, fontSize: 12, padding: "6px 14px", marginTop: 10 }}>🔊 정답 듣기</button>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", marginBottom: 12 }}>
              <textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="영어로 입력하세요..."
                style={{ ...S.input, flex: 1, resize: "none", fontSize: 16, padding: "14px", lineHeight: 1.6, minHeight: 120 }} />
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              {!listening ? (
                <button onClick={startMic} style={{ ...S.btn, flex: 1, background: "#FEF3C7", color: "#92400E", fontSize: 14 }}>🎤 마이크로 입력</button>
              ) : (
                <button onClick={stopMic} style={{ ...S.btn, flex: 1, background: "#FEE2E2", color: C.danger, fontSize: 14 }}>⏹ 녹음 완료</button>
              )}
            </div>
            {listening && <div style={{ textAlign: "center", color: C.primary, fontSize: 13, marginBottom: 8, fontWeight: 600 }}>🎤 듣고 있어요...</div>}
            <button onClick={checkAnswer} disabled={!answer.trim()} style={{ ...S.btn, width: "100%", background: C.primary, color: "#fff", opacity: !answer.trim() ? 0.4 : 1 }}>제출</button>
          </>
        ) : (
          <>
            <div style={{ ...S.card, flex: 1, border: `2px solid ${correct ? C.success : C.danger}`, marginBottom: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>{correct ? "⭕" : "❌"}</div>
              <div style={{ fontWeight: 700, color: C.text, fontSize: 16, lineHeight: 1.6, marginBottom: 8 }}>{item.English}</div>
              {answer && <div style={{ color: C.sub, fontSize: 13 }}>내 답: {answer}</div>}
              <button onClick={() => speak(item.English)} style={{ ...S.btn, background: C.pill, color: C.primary, fontSize: 13, marginTop: 12 }}>🔊 정답 듣기</button>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => next("x")} style={{ ...S.btn, flex: 1, background: "#FEE2E2", color: C.danger, fontSize: 13 }}>✗ 다시 학습</button>
              <button onClick={() => next("o")} style={{ ...S.btn, flex: 1, background: "#DCFCE7", color: C.success, fontSize: 14 }}>✓ 다음</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
