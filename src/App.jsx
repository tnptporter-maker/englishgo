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

const stopSpeak = () => {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
};

const speak = (text) => {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  setTimeout(() => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US"; u.rate = 0.9;
    window.speechSynthesis.speak(u);
  }, 300);
};

// 1번: 유튜브 SVG 아이콘
const YoutubeSVG = () => (
  <svg width="26" height="18" viewBox="0 0 26 18" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="26" height="18" rx="4" fill="#FF0000"/>
    <polygon points="10,4 10,14 19,9" fill="white"/>
  </svg>
);

// 2번: 따라읽기 사람 SVG - 살색 얼굴
const SpeakSVG = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="14" cy="9" rx="5" ry="5.5" fill="#FBBF91" stroke="#D4956A" strokeWidth="1"/>
    <path d="M7 24c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5" fill="#FBBF91" stroke="#D4956A" strokeWidth="1"/>
    <path d="M3 13 Q1 13 2 15.5 Q3 18 4.5 16" stroke="#9CA3AF" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <path d="M3 10 Q0 10 1 15 Q2 19 5 17" stroke="#9CA3AF" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
  </svg>
);

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
        diaries: data.diaries || [],
        stepDone: data.stepDone || {},
      };
    }
    return { progress: {}, studyDays: [], quizProgress: {}, favorites: {}, diaries: [], stepDone: {} };
  } catch (e) {
    console.error("Firestore load error:", e);
    return { progress: {}, studyDays: [], quizProgress: {}, favorites: {}, diaries: [], stepDone: {} };
  }
}

async function fetchSheet(sheetName) {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
    const res = await fetch(url);
    const text = await res.text();
    const rows = text.trim().split(/\r?\n(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(row => {
      const cells = [];
      let current = "", inQuotes = false;
      for (let i = 0; i < row.length; i++) {
        if (row[i] === '"') { inQuotes = !inQuotes; }
        else if (row[i] === ',' && !inQuotes) { cells.push(current.trim()); current = ""; }
        else { current += row[i]; }
      }
      }
      cells.push(current.trim());
      return cells;
    });
    const headers = rows[0];
    return rows.slice(1).filter(r => r.some(c => c)).map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (row[i] || "").replace(/\\n/g, "\n"); });
      return obj;
    });
  } catch (e) {
    console.error("Sheet fetch error:", e);
    return [];
  }
}

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
  return sentence.split(" ");
}

const C = {
  bg: "#F7F8FC", card: "#FFFFFF", primary: "#2D6BE4",
  success: "#16A34A", danger: "#DC2626", warn: "#D97706",
  // 정답/오답 배경·텍스트 (차분한 톤)
  successBg: "#FFD966", successBorder: "#FFD966", successText: "#7A5800",
  dangerBg: "#F0F0F0", dangerBorder: "#F0F0F0", dangerText: "#555555",
  // 완료 뱃지 - 노란색 계열
  doneBg: "#FEF9C3", doneBorder: "#FDE047", doneText: "#854D0E",
  text: "#111827", sub: "#6B7280", border: "#E5E7EB", pill: "#EEF2FF",
  yellow: "#FFD966", yellowLight: "#FFFBEB", yellowDark: "#92400E",
};

const S = {
  card: { background: C.card, borderRadius: 16, padding: "16px 20px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" },
  btn: { borderRadius: 10, padding: "11px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", border: "none", transition: "opacity .15s" },
  input: { width: "100%", borderRadius: 10, border: `1.5px solid ${C.border}`, padding: "11px 14px", fontSize: 14, outline: "none", boxSizing: "border-box", background: "#fff", color: "#111827" },
  label: { fontSize: 14, fontWeight: 700, color: C.sub, marginBottom: 8, letterSpacing: 0.3 },
  listTitle: { fontWeight: 700, color: C.text, fontSize: 16, textAlign: "left" },
  listSub: { fontSize: 13, color: C.sub, marginTop: 3, textAlign: "left" },
  page: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column", fontFamily: "'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif", overflowY: "auto", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", touchAction: "pan-y" },
  pageInner: { flex: 1, display: "flex", flexDirection: "column", padding: "20px 16px 24px", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" },
  quitBtn: { borderRadius: 10, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none", background: "#FEE2E2", color: "#EF4444", flexShrink: 0 },
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
  // 8번: 다이어리
  const [diaries, setDiariesRaw] = useState([]);
  // 7번: 각 스텝 완료 상태 { "lessonId_sourceId": { video: true, read: true, build: true, quiz: true } }
  const [stepDone, setStepDoneRaw] = useState({});

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

  // 8번: 다이어리 저장
  const setDiaries = useCallback((updater) => {
    setDiariesRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (user?.uid) saveToFirestore(user.uid, { diaries: next });
      return next;
    });
  }, [user, saveToFirestore]);

  // 7번: 스텝 완료 저장
  const setStepDone = useCallback((updater) => {
    setStepDoneRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (user?.uid) saveToFirestore(user.uid, { stepDone: next });
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
        setDiariesRaw(data.diaries || []);
        setStepDoneRaw(data.stepDone || {});
        setFsLoading(false);
      } else {
        setProgressRaw({});
        setStudyDaysRaw([]);
        setQuizProgressRaw({});
        setFavoritesRaw({});
        setDiariesRaw([]);
        setStepDoneRaw({});
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
      stopSpeak();
      const history = screenHistory.current;
      if (history.length > 1) {
        history.pop();
        setScreen(history[history.length - 1]);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const go = (s, navUpdate = null) => {
    stopSpeak();
    screenHistory.current.push(s);
    window.history.pushState(null, "", window.location.pathname);
    if (navUpdate !== null) {
      if (navUpdate !== null) setNav(p => ({ ...p, ...navUpdate }));
    }
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

  const shared = { user, logout, go, nav, categories, sources, lessons, items, progress, setProgress, studyDays, setStudyDays, reviewItems, quizProgress, setQuizProgress, favorites, setFavorites, diaries, setDiaries, stepDone, setStepDone };

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
      {screen === "stepDiary" && <StepDiaryScreen {...shared} />}
      {screen === "review" && <ReviewScreen {...shared} />}
      {screen === "scriptLesson" && <ScriptLessonListScreen {...shared} />}
      {screen === "scriptItem" && <ScriptLessonScreen {...shared} />}
      {screen === "favoriteList" && <FavoriteListScreen {...shared} />}
      {screen === "favoriteQuiz" && <FavoriteQuizScreen {...shared} />}
      {screen === "diaryList" && <DiaryListScreen {...shared} />}
      {screen === "diaryDetail" && <DiaryDetailScreen {...shared} />}
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

function HomeScreen({ user, logout, go, categories, sources, lessons, items, progress, studyDays, reviewItems, quizProgress, favorites, diaries }) {
  const [showMenu, setShowMenu] = useState(false);
  const getCatSources = (catId) => sources.filter(s => s.CategoryID === catId);
  const favCount = Object.keys(favorites).length;

  // 8번: 다이어리 최신순 정렬
  const sortedDiaries = [...diaries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

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

        <div onClick={() => go("calendar")} style={{ ...S.card, background: "#FFD966", cursor: "pointer", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ flex: 1, textAlign: "center" }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: "#333" }}>🔥 학습 일수 &nbsp; {studyDays.length}일</span>
          </div>
          <div style={{ fontSize: 28, opacity: 0.4 }}>🗓️</div>
        </div>

        <TodayLesson go={go} lessons={lessons} sources={sources} items={items} progress={progress} quizProgress={quizProgress} />

        <div style={{ marginBottom: 16 }}>
          <div style={S.label}>복습</div>
          {reviewItems.length === 0 ? (
            <div style={{ ...S.card, color: C.sub, fontSize: 14 }}>✅ 오늘 복습할 내용이 없어요!</div>
          ) : (
            <div style={{ ...S.card, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }} onClick={() => go("review")}>
              <div style={{ flex: 1 }}>
                <div style={S.listTitle}>오늘의 복습</div>
                <div style={S.listSub}>복습할 문장 {reviewItems.length}개</div>
              </div>
              <div style={{ color: C.sub, fontSize: 18 }}>›</div>
            </div>
          )}
        </div>

        <div style={S.label}>카테고리</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
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

        {/* 8번: 다이어리 섹션 */}
        {favCount > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={S.label}>저장한 문장</div>
            <div style={{ ...S.card, cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }} onClick={() => go("favoriteList")}>
              <div style={{ flex: 1 }}>
                <div style={S.listTitle}>⭐ 저장한 문장</div>
                <div style={S.listSub}>저장한 문장 {favCount}개</div>
              </div>
              <div style={{ color: C.sub, fontSize: 18 }}>›</div>
            </div>
          </div>
        )}

        <div style={S.label}>Diary</div>
        <div style={{ ...S.card, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }} onClick={() => go("diaryList")}>
          <div style={{ flex: 1 }}>
            <div style={S.listTitle}>내 다이어리</div>
            <div style={S.listSub}>{diaries.length}개 기록</div>
          </div>
          <div style={{ color: C.sub, fontSize: 18 }}>›</div>
        </div>
        
      </div>
    </div>
  );
}

// 4번: 오늘의 레슨 - quizProgress 뿐 아니라 stepDone도 고려해서 다음 레슨 판단
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

  // 가장 최근에 학습한 레슨 (history 날짜 기준)
  const lastStudiedLesson = (() => {
    let lastDate = "";
    let lastLesson = null;
    Object.entries(progress).forEach(([itemId, prog]) => {
      const history = prog.history || [];
      if (history.length > 0) {
        const lastHistory = history[history.length - 1];
        if (lastHistory.date > lastDate) {
          lastDate = lastHistory.date;
          const item = items.find(i => i.ItemID === itemId);
          if (item) {
            const lesson = lessons.find(l => l.LessonID === item.LessonID && l.SourceID === item.SourceID);
            if (lesson) lastLesson = lesson;
          }
        }
      }
    });
    return lastLesson;
  })();

  const nextLesson = (() => {
    if (inProgressLesson) return inProgressLesson.lesson;
    if (!lastStudiedLesson) return lessons[0] || null;
    const lastKey = `${lastStudiedLesson.LessonID}_${lastStudiedLesson.SourceID}`;
    const lastSaved = quizProgress[lastKey];
    if (lastSaved === "done") {
      const srcLessons = lessons
        .filter(l => l.SourceID === lastStudiedLesson.SourceID)
        .sort((a, b) => Number(a.Order) - Number(b.Order));
      const idx = srcLessons.findIndex(l => l.LessonID === lastStudiedLesson.LessonID);
      return srcLessons[idx + 1] || lessons.find(l => l.SourceID !== lastStudiedLesson.SourceID) || srcLessons[0];
    }
    return lastStudiedLesson;
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
      }} style={{ ...S.card, cursor: "pointer", display: "flex", alignItems: "center", gap: 12, borderLeft: `4px solid ${C.yellow}`, background: C.yellowLight }}>
        <div style={{ flex: 1 }}>
          <div style={S.listTitle}>{nextLesson.Title}</div>
          <div style={S.listSub}>{src?.Name} · {lessonItems.length}문장 {inProgressLesson ? "· 이어서 학습" : ""}</div>
        </div>
        <div style={{ ...S.btn, background: C.yellow, color: C.yellowDark, padding: "8px 16px", fontSize: 13 }}>시작 →</div>
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
          <button onClick={() => go("home")} style={{ ...S.btn, background: C.yellowLight, color: C.text, padding: "8px 14px" }}>← 홈</button>
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
          <button onClick={() => go("home")} style={{ ...S.btn, background: C.yellowLight, color: C.text, padding: "8px 14px" }}>← 홈</button>
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
          <button onClick={() => go("source")} style={{ ...S.btn, background: C.yellowLight, color: C.text, padding: "8px 14px", flexShrink: 0 }}>← 뒤로</button>
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

// ─── LessonStepsScreen ────────────────────────────────────────────────────────
// 2번: 이어하기/처음부터 팝업 + 7번: 각 스텝 완료 표시 + 6번: Speaking Test 명칭
function LessonStepsScreen({ go, nav, lessons, sources, items, progress, quizProgress, stepDone, setStepDone }) {
  const lesson = lessons.find(l => l.LessonID === nav.lessonId && l.SourceID === nav.sourceId);
  const lessonItems = items.filter(i => i.LessonID === nav.lessonId && i.SourceID === nav.sourceId);
  const src = sources.find(s => s.SourceID === nav.sourceId);
  const saveKey = `${nav.lessonId}_${nav.sourceId}`;
  const lessonStepDone = stepDone[saveKey] || {};

  // 2번: 이어하기 팝업
  const [showResumePopup, setShowResumePopup] = useState(false);
  useEffect(() => {
    const saved = quizProgress[saveKey];
    if (saved && saved !== "done") {
      setShowResumePopup(true);
    }
  }, []);

  const extractYouTubeId = (url) => {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=)([^&\n?#]+)/);
    return match ? match[1] : null;
  };
  const ytId = extractYouTubeId(lesson?.VideoURL);
  const studiedCount = lessonItems.filter(i => progress[i.ItemID]?.history?.length > 0).length;
  const quizDone = quizProgress[saveKey] === "done";

  const steps = [
    ytId ? { id: "video", label: "영상 보기", sub: "유튜브 강의", done: false } : null,
    { id: "read", label: "따라읽기", sub: `${lessonItems.length}문장 × 2회`, done: lessonStepDone.read },
    { id: "build", label: "문장 만들기", sub: "단어 조각으로 문장 만들기", done: lessonStepDone.build },
    { id: "quiz", label: "Speaking Test", sub: "직접 말해보기", done: quizDone },
    { id: "diary", label: "Diary", sub: "학습 내용으로 글쓰기 연습", done: lessonStepDone.diary },
  ].filter(Boolean);

  const backScreen = nav.fromHome ? "home" : "lesson";

  // 2번: 이어하기 팝업에서 이어하기 선택 시
  const handleResume = () => {
    setShowResumePopup(false);
    const saved = quizProgress[saveKey];
    if (saved === "preview") {
      go("stepRead", { ...nav, fromLesson: true });
    } else if (saved === "build") {
      go("stepBuild", { ...nav, fromLesson: true });
    } else if (!isNaN(Number(saved))) {
      go("stepQuiz", { ...nav, fromLesson: true });
    }
  };

  // 2번: 처음부터 시작 시 quizProgress 리셋
  const handleRestart = () => {
    setShowResumePopup(false);
  };

  return (
    <div style={S.page}>
      <div style={S.pageInner}>
        {/* 5번: 레슨명 뒤로버튼 옆 배치 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <button onClick={() => go(backScreen)} style={{ ...S.btn, background: C.yellowLight, color: C.text, padding: "8px 14px", flexShrink: 0 }}>← 뒤로</button>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lesson?.Title}</div>
        </div>
        <div style={{ ...S.card, marginBottom: 20, borderLeft: `4px solid ${C.yellow}`, background: C.yellowLight }}>
          <div style={{ fontSize: 13, color: C.sub }}>{src?.Name} · {lessonItems.length}문장 {studiedCount > 0 ? `· ${studiedCount}개 학습됨` : ""}</div>
        </div>
        <div style={S.label}>학습 단계</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {steps.map((step) => (
            <div key={step.id}
              onClick={() => {
                const screenMap = { video: "stepVideo", read: "stepRead", build: "stepBuild", quiz: "stepQuiz", diary: "stepDiary" };
                go(screenMap[step.id], { ...nav, fromLesson: true });
              }}
              style={{ ...S.card, display: "flex", alignItems: "center", gap: 14, cursor: "pointer", border: step.done ? `2px solid ${C.doneBorder}` : "none" }}>
              <div style={{ flex: 1 }}>
                <div style={{ ...S.listTitle, display: "flex", alignItems: "center", gap: 8 }}>
                  {step.label}
                  {step.done && <span style={{ fontSize: 11, background: C.doneBg, color: C.doneText, borderRadius: 99, padding: "2px 8px", fontWeight: 700 }}>완료</span>}
                </div>
                <div style={S.listSub}>{step.sub}</div>
              </div>
              <div style={{ color: C.sub, fontSize: 18 }}>›</div>
            </div>
          ))}
        </div>
      </div>

      {/* 2번: 이어하기 팝업 */}
      {showResumePopup && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 24 }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 28, maxWidth: 340, width: "100%" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 8, textAlign: "center" }}>이어서 학습할까요?</div>
            <div style={{ fontSize: 14, color: C.sub, textAlign: "center", marginBottom: 24 }}>이전에 학습하던 내용이 있어요</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleRestart} style={{ ...S.btn, flex: 1, background: C.border, color: C.text, fontSize: 13 }}>처음부터</button>
              <button onClick={handleResume} style={{ ...S.btn, flex: 1, background: C.primary, color: "#fff", fontSize: 13 }}>이어하기 →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── StepVideoScreen ──────────────────────────────────────────────────────────
function StepVideoScreen({ go, nav, lessons, setStepDone }) {
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
          <button onClick={() => go("lessonSteps")} style={{ ...S.btn, background: C.yellowLight, color: C.text, padding: "8px 14px", flexShrink: 0 }}>← 뒤로</button>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lesson?.Title}</div>
          <button onClick={() => go("lessonSteps")} style={S.quitBtn}>그만하기</button>
        </div>
        {ytId ? (
          <>
            <div style={{ borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
              <iframe width="100%" height="240" src={`https://www.youtube.com/embed/${ytId}`} title="YouTube" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ display: "block" }} />
            </div>
            <button onClick={() => {
              // 7번: 영상 완료 표시
              const saveKey = `${nav.lessonId}_${nav.sourceId}`;
              setStepDone(prev => ({ ...prev, [saveKey]: { ...(prev[saveKey] || {}), video: true } }));
              go("stepRead", nav);
            }} style={{ ...S.btn, background: C.primary, color: "#fff", width: "100%", padding: 14, fontSize: 15 }}>
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

// ─── StepReadScreen: 따라읽기 ─────────────────────────────────────────────────
function StepReadScreen({ go, nav, lessons, items, setStudyDays, setStepDone, setQuizProgress }) {
  const lessonItems = items.filter(i => i.LessonID === nav.lessonId && i.SourceID === nav.sourceId);
  const saveKey = `${nav.lessonId}_${nav.sourceId}`;
  const [idx, setIdx] = useState(0);
  const [round, setRound] = useState(1);
  const [isListening, setIsListening] = useState(false);
  const [spokenThisCard, setSpokenThisCard] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const recRef = useRef(null);
  const restartTimerRef = useRef(null);
  const item = lessonItems[idx];

  // 진입 시 quizProgress에 "preview" 저장
  useEffect(() => {
    setQuizProgress(prev => {
      if (!prev[saveKey] || prev[saveKey] === null) {
        return { ...prev, [saveKey]: "preview" };
      }
      return prev;
    });
  }, [saveKey]);

  useEffect(() => {
    setSpokenThisCard(false);
    setFeedback(null);
    setIsListening(false);
    recRef.current?.stop();
    stopSpeak();
    // 4번: 자동 TTS 제거 (아무것도 안 함)
    return () => { stopSpeak(); recRef.current?.stop(); };
  }, [idx, round]);

  useEffect(() => { return () => { stopSpeak(); recRef.current?.stop(); clearTimeout(restartTimerRef.current); }; }, []);

  // 3번: 음성 끊겨도 자동 재시작 (continuous 유지)
  const startRepeat = () => {
    stopSpeak();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Chrome을 사용해주세요."); return; }

    const startRec = () => {
      const r = new SR();
      r.lang = "en-US";
      r.continuous = true;
      r.interimResults = true;
      r.onresult = e => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) {
            const said = e.results[i][0].transcript.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
            if (!said || said.length < 2) continue;
            const expected = item.English.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
            const words = expected.split(" ");
            const matchRatio = words.filter(w => said.includes(w)).length / words.length;
            // 8번: 80% 이상 매칭 시 인정
            setFeedback(matchRatio >= 0.8 ? "good" : "try");
            if (matchRatio >= 0.8) setSpokenThisCard(true);
          }
        }
      };
      // 3번: 끊겨도 자동 재시작
      r.onend = () => {
        if (recRef.current === r) {
          restartTimerRef.current = setTimeout(() => {
            if (recRef.current === r) {
              try { r.start(); } catch(e) {}
            }
          }, 200);
        }
      };
      r.onerror = (e) => {
        if (e.error === "aborted" || e.error === "not-allowed") {
          setIsListening(false);
          recRef.current = null;
        }
      };
      r.start();
      recRef.current = r;
      setIsListening(true);
    };
    setTimeout(startRec, 300);
  };

  const stopRepeat = () => {
    clearTimeout(restartTimerRef.current);
    const r = recRef.current;
    recRef.current = null;
    r?.stop();
    setIsListening(false);
  };

  const handleNext = () => {
    if (idx < lessonItems.length - 1) {
      setIdx(p => p + 1);
    } else if (round === 1) {
      setRound(2); setIdx(0);
    } else {
      // 7번: 따라읽기 완료 표시
      const saveKey = `${nav.lessonId}_${nav.sourceId}`;
      setStepDone(prev => ({ ...prev, [saveKey]: { ...(prev[saveKey] || {}), read: true } }));
      setStudyDays(prev => prev.includes(today()) ? prev : [...prev, today()]);
      go("stepBuild", nav);
    }
  };

  const lesson = lessons.find(l => l.LessonID === nav.lessonId && l.SourceID === nav.sourceId);

  const totalItems = lessonItems.length * 2;
  const currentNum = round === 1 ? idx + 1 : lessonItems.length + idx + 1;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px 16px", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <button onClick={() => go("lessonSteps")} style={{ ...S.btn, background: C.yellowLight, color: C.text, padding: "8px 14px", flexShrink: 0 }}>← 뒤로</button>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lesson?.Title}</div>
          <div style={{ fontSize: 12, color: C.sub, flexShrink: 0 }}>{currentNum}/{totalItems}</div>
          <button onClick={() => { stopSpeak(); stopRepeat(); go("lessonSteps"); }} style={S.quitBtn}>그만하기</button>
        </div>
        <div style={{ height: 6, background: C.border, borderRadius: 99, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ height: "100%", width: `${Math.round((currentNum / totalItems) * 100)}%`, background: C.primary, borderRadius: 99, transition: "width 0.3s" }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <div style={{ flex: 1, padding: "6px 0", borderRadius: 8, background: round >= 1 ? C.primary : C.border, color: round >= 1 ? "#fff" : C.sub, fontSize: 12, fontWeight: 700, textAlign: "center" }}>1회차</div>
          <div style={{ flex: 1, padding: "6px 0", borderRadius: 8, background: round >= 2 ? C.primary : C.border, color: round >= 2 ? "#fff" : C.sub, fontSize: 12, fontWeight: 700, textAlign: "center" }}>2회차</div>
        </div>
        <div style={{ ...S.card, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", marginBottom: 16, padding: "24px 20px" }}>
          <div style={{ color: C.sub, fontSize: 18, lineHeight: 1.6, marginBottom: 20 }}>{item?.Korean}</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text, lineHeight: 1.6, marginBottom: 20 }}>{item?.English}</div>
          <div style={{ display: "flex", gap: 10, width: "100%", marginBottom: 12 }}>
            <button onClick={() => { stopRepeat(); speak(item?.English); }}
              style={{ ...S.btn, flex: 1, background: C.yellowLight, color: C.yellowDark, fontSize: 13 }}>🔊 듣기</button>
            {!isListening ? (
              <button onClick={startRepeat} style={{ ...S.btn, flex: 1, background: "#FEF3C7", color: "#92400E", fontSize: 13 }}>🎤 Speaking</button>
            ) : (
              <button onClick={stopRepeat} style={{ ...S.btn, flex: 1, background: "#FEE2E2", color: C.danger, fontSize: 13 }}>⏹ 완료</button>
            )}
          </div>
          {feedback && (
            <div style={{ fontSize: 16, fontWeight: 700, color: feedback === "good" ? C.successText : C.yellowDark }}>
              {feedback === "good" ? "잘 했어요!" : "다시 해봐요!"}
            </div>
          )}
          {spokenThisCard && <div style={{ marginTop: 6, fontSize: 12, color: C.sub }}>Speaking 완료 ✓</div>}
        </div>
        <button onClick={handleNext} disabled={!spokenThisCard}
          style={{ ...S.btn, width: "100%", background: spokenThisCard ? C.primary : C.border, color: spokenThisCard ? "#fff" : C.sub, padding: 14, fontSize: 15, opacity: spokenThisCard ? 1 : 0.5 }}>
          {!spokenThisCard ? "🎤 Speaking 후 다음으로" : idx < lessonItems.length - 1 ? "다음 문장 →" : round === 1 ? "2회차 시작 →" : "완료 → 영작하기"}
        </button>
      </div>
    </div>
  );
}

// ─── StepBuildScreen: 영작하기 ────────────────────────────────────────────────
function StepBuildScreen({ go, nav, items, lessons, setStudyDays, setStepDone, setQuizProgress }) {
  const lessonItems = items.filter(i => i.LessonID === nav.lessonId && i.SourceID === nav.sourceId);
  const lesson = lessons.find(l => l.LessonID === nav.lessonId && l.SourceID === nav.sourceId);
  const saveKey = `${nav.lessonId}_${nav.sourceId}`;
  const [idx, setIdx] = useState(0);
  const [chunks, setChunks] = useState(null);
  const [shuffledChunks, setShuffledChunks] = useState([]);
  const [selected, setSelected] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(false);
  const item = lessonItems[idx];

  useEffect(() => { return () => stopSpeak(); }, []);

  // 7번: 영작하기 진입 시 quizProgress에 "build" 저장 (이어하기 감지)
  useEffect(() => {
    setQuizProgress(prev => ({ ...prev, [saveKey]: prev[saveKey] === "done" ? "done" : "build" }));
  }, [saveKey]);

  useEffect(() => {
    if (!item) return;
    setChunks(null); setSelected([]); setSubmitted(false); setCorrect(false);
    splitIntoChunks(item.English).then(result => {
      setChunks(result);
      const indices = result.map((_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      setShuffledChunks(indices);
    });
  }, [idx, item?.English]);

  const handleSelect = (si) => {
    if (submitted) return;
    setSelected(p => p.includes(si) ? p.filter(x => x !== si) : [...p, si]);
  };

  const handleSubmit = () => {
    const built = selected.map(si => chunks[shuffledChunks[si]]).join(" ");
    const expected = item.English.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const given = built.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    setCorrect(expected === given); setSubmitted(true);
  };

  const handleNext = () => {
    if (idx < lessonItems.length - 1) { setIdx(p => p + 1); }
    else {
      setStepDone(prev => ({ ...prev, [saveKey]: { ...(prev[saveKey] || {}), build: true } }));
      setStudyDays(prev => prev.includes(today()) ? prev : [...prev, today()]);
      go("stepQuiz", nav);
    }
  };

  const resultBg = "#fff";
  const resultBorder = submitted ? (correct ? C.successBorder : C.dangerBorder) : C.border;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 24px", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <button onClick={() => go("lessonSteps")} style={{ ...S.btn, background: C.yellowLight, color: C.text, padding: "8px 14px", flexShrink: 0 }}>← 뒤로</button>
          <div style={{ fontWeight: 700, fontSize: 14, flex: 1, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lesson?.Title}</div>
          <div style={{ fontSize: 12, color: C.sub, flexShrink: 0 }}>{idx + 1}/{lessonItems.length}</div>
          <button onClick={() => go("lessonSteps")} style={S.quitBtn}>그만하기</button>
        </div>
        <div style={{ height: 6, background: C.border, borderRadius: 99, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ height: "100%", width: `${Math.round((idx / lessonItems.length) * 100)}%`, background: C.yellow, borderRadius: 99, transition: "width 0.3s" }} />
        </div>
        <div style={{ ...S.card, marginBottom: 12, padding: "16px", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: C.sub, fontWeight: 600, marginBottom: 6 }}>다음을 영어로 만드세요</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text, lineHeight: 1.5 }}>{item?.Korean}</div>
        </div>
        <div style={{ ...S.card, minHeight: 56, marginBottom: 12, padding: "12px 16px", background: resultBg, border: `2px ${submitted ? "solid" : "dashed"} ${resultBorder}`, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {selected.length === 0 ? (
            <div style={{ color: C.sub, fontSize: 13, width: "100%", textAlign: "center" }}>단어를 선택하세요</div>
          ) : (
            selected.map((si, i) => (
              <span key={i} onClick={() => !submitted && handleSelect(si)}
                style={{ background: submitted ? (correct ? C.successBg : C.dangerBg) : C.yellow, color: submitted ? (correct ? C.successText : C.dangerText) : C.yellowDark, borderRadius: 8, padding: "5px 10px", fontSize: 14, fontWeight: 600, cursor: submitted ? "default" : "pointer", border: submitted ? `1px solid ${correct ? C.successBorder : C.dangerBorder}` : "none" }}>
                {chunks?.[shuffledChunks[si]]}
              </span>
            ))
          )}
        </div>
        {/* 정답/오답 인라인 */}
        {submitted && (
          <div style={{ ...S.card, marginBottom: 12, padding: "20px 16px 16px", textAlign: "center", background: correct ? C.successBg : C.dangerBg, border: "none" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: correct ? C.successText : C.dangerText, marginBottom: 8 }}>{correct ? "정답이에요!" : "틀렸어요"}</div>
            <div style={{ fontSize: 14, color: C.text, fontWeight: 600, marginBottom: 8 }}>{item?.English}</div>
            <button onClick={() => speak(item?.English)} style={{ ...S.btn, background: C.yellowLight, color: C.yellowDark, fontSize: 12, padding: "5px 12px" }}>🔊 듣기</button>
          </div>
        )}
        {chunks === null ? (
          <div style={{ ...S.card, padding: "24px 16px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", color: C.sub, fontSize: 13 }}>🤔 단어 분석 중...</div>
        ) : (
          <div style={{ ...S.card, padding: "14px 16px", marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: C.sub, fontWeight: 600, marginBottom: 10 }}>단어 선택</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {shuffledChunks.map((chunkIdx, si) => {
                const isSelected = selected.includes(si);
                return (
                  <button key={si} onClick={() => handleSelect(si)} disabled={submitted}
                    style={{ ...S.btn, padding: "8px 14px", fontSize: 14, background: isSelected ? "#E5E7EB" : C.card, color: isSelected ? C.text : C.text, border: `1.5px solid ${isSelected ? "#9CA3AF" : C.border}`, opacity: submitted ? 0.5 : 1, fontWeight: 600 }}>
                    {chunks[chunkIdx]}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, paddingBottom: 8 }}>
          {!submitted ? (
            <>
              <button onClick={() => setSelected([])} style={{ ...S.btn, flex: 1, background: C.border, color: C.text }}>초기화</button>
              <button onClick={handleSubmit} disabled={selected.length === 0}
                style={{ ...S.btn, flex: 2, background: selected.length > 0 ? C.yellow : C.border, color: selected.length > 0 ? C.yellowDark : C.sub }}>확인</button>
            </>
          ) : (
            <button onClick={handleNext} style={{ ...S.btn, flex: 1, background: C.primary, color: "#fff", padding: 14, fontSize: 15 }}>
              {idx < lessonItems.length - 1 ? "다음 →" : "완료 → Speaking Test"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── StepQuizScreen (=Speaking Test) ─────────────────────────────────────────
// 6번: 명칭 변경, 3번: 마이크 자동 재시작
function StepQuizScreen({ go, nav, items, lessons, progress, setProgress, setStudyDays, quizProgress, setQuizProgress }) {
  const lessonItems = items.filter(i => i.LessonID === nav.lessonId && i.SourceID === nav.sourceId);
  const lesson = lessons.find(l => l.LessonID === nav.lessonId && l.SourceID === nav.sourceId);
  const saveKey = `${nav.lessonId}_${nav.sourceId}`;
  const [quizIdx, setQuizIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [listening, setListening] = useState(false);
  const [done, setDone] = useState(false);
  const recRef = useRef(null);
  const restartTimerRef = useRef(null);

  useEffect(() => { return () => { stopSpeak(); recRef.current?.stop(); clearTimeout(restartTimerRef.current); }; }, []);

  // 3번: 음성 끊겨도 자동 재시작
  const startMic = () => {
    stopSpeak();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Chrome을 사용해주세요."); return; }

    const startRec = () => {
      const r = new SR();
      r.lang = "en-US"; r.continuous = true; r.interimResults = false;
      r.onresult = e => {
        const result = e.results[e.results.length - 1];
        if (!result || !result[0]) return;
        const said = result[0].transcript;
        if (!said.trim()) return;
        setAnswer(said);
      };
      r.onend = () => {
        if (recRef.current === r) {
          restartTimerRef.current = setTimeout(() => {
            if (recRef.current === r) {
              try { r.start(); } catch(e) {}
            }
          }, 200);
        }
      };
      r.onerror = (e) => {
        if (e.error === "aborted" || e.error === "not-allowed") {
          setListening(false);
          recRef.current = null;
        }
      };
      r.start();
      recRef.current = r;
      setListening(true);
    };
    startRec();
  };

  const stopMic = () => {
    clearTimeout(restartTimerRef.current);
    const r = recRef.current;
    recRef.current = null;
    r?.stop();
    setListening(false);
  };

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
      setQuizProgress(prev => ({ ...prev, [saveKey]: "done" })); setDone(true);
    } else {
      const nextIdx = quizIdx + 1;
      setQuizProgress(prev => ({ ...prev, [saveKey]: String(nextIdx) }));
      setQuizIdx(nextIdx); setAnswer(""); setSubmitted(false); setCorrect(false);
    }
  };

  if (done) return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <img src={duck2Img} width={120} height={120} alt="완료" style={{ marginBottom: 24, objectFit: "contain" }} />
      <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>Speaking Test 완료!</div>
      <div style={{ color: C.sub, fontSize: 14, marginBottom: 32 }}>{lessonItems.length}문장 모두 완료했어요 🎉</div>
      <button onClick={() => go("stepDiary", nav)} style={{ ...S.btn, background: "#7C3AED", color: "#fff", width: "100%", maxWidth: 320, padding: 16, fontSize: 15, marginBottom: 12 }}>📓 Diary 쓰기 →</button>
      <button onClick={() => go("lessonSteps")} style={{ ...S.btn, background: C.yellowLight, color: C.yellowDark, width: "100%", maxWidth: 320, padding: 14, fontSize: 14 }}>← 레슨으로</button>
    </div>
  );

  const item = lessonItems[quizIdx];
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", padding: "20px 16px 24px", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <button onClick={() => go("lessonSteps")} style={{ ...S.btn, background: C.yellowLight, color: C.text, padding: "8px 14px", flexShrink: 0 }}>← 뒤로</button>
          <div style={{ fontSize: 14, color: C.text, fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lesson?.Title}</div>
          <button onClick={() => { stopSpeak(); stopMic(); go("lessonSteps"); }} style={S.quitBtn}>그만하기</button>
        </div>
        <div style={{ height: 6, background: C.border, borderRadius: 99, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ height: "100%", width: `${Math.round((quizIdx / lessonItems.length) * 100)}%`, background: C.primary, borderRadius: 99, transition: "width 0.3s" }} />
        </div>

        {/* 7번: 문제 카드 */}
        <div style={{ ...S.card, marginBottom: 12, padding: "16px", textAlign: "center" }}>
          <div style={{ color: C.sub, fontSize: 11, marginBottom: 6, fontWeight: 600 }}>다음을 영어로 작성하세요</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.text, lineHeight: 1.5 }}>{item.Korean}</div>
          <button onClick={() => speak(item.English)} style={{ ...S.btn, background: C.yellowLight, color: C.yellowDark, fontSize: 12, padding: "6px 14px", marginTop: 10 }}>🔊 정답 듣기</button>
        </div>

        {/* 7번: 마이크 버튼을 문제카드 바로 아래로, 크게 */}
        <div style={{ marginBottom: 12 }}>
          {!listening ? (
            <button onClick={startMic} style={{ ...S.btn, width: "100%", background: "#FEF3C7", color: "#92400E", fontSize: 16, padding: "14px", fontWeight: 800 }}>🎤 Speaking</button>
          ) : (
            <button onClick={stopMic} style={{ ...S.btn, width: "100%", background: "#FEE2E2", color: C.danger, fontSize: 16, padding: "14px", fontWeight: 800 }}>⏹ 녹음 완료</button>
          )}
        </div>
        {/* 11번: "듣고 있어요" 텍스트 제거 */}

        {/* 7번: 입력창 사이즈 줄임 */}
        <textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="영어로 입력하세요..."
          style={{ ...S.input, resize: "none", fontSize: 15, padding: "12px 14px", lineHeight: 1.6, minHeight: 72, marginBottom: 10 }} />

        {/* 9번: 정답/오답 인라인 표시 (전체화면 X) */}
        {submitted && (
          <div style={{ ...S.card, padding: "16px", marginBottom: 10, textAlign: "center", background: correct ? C.successBg : C.dangerBg, border: "none" }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: correct ? C.successText : C.dangerText, marginBottom: 8 }}>{correct ? "정답이에요!" : "틀렸어요"}</div>
            <div style={{ fontWeight: 600, color: C.text, fontSize: 14, lineHeight: 1.5, marginBottom: 6 }}>{item.English}</div>
            {answer && <div style={{ color: C.sub, fontSize: 12 }}>내 답: {answer}</div>}
            <button onClick={() => speak(item.English)} style={{ ...S.btn, background: C.yellowLight, color: C.yellowDark, fontSize: 12, padding: "5px 12px", marginTop: 10 }}>🔊 정답 듣기</button>
          </div>
        )}

        {!submitted ? (
          <button onClick={checkAnswer} disabled={!answer.trim()} style={{ ...S.btn, width: "100%", background: C.primary, color: "#fff", padding: 13, opacity: !answer.trim() ? 0.4 : 1 }}>제출</button>
        ) : (
          /* 10번: ✗✓ 제거 */
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => recordResult("x")} style={{ ...S.btn, flex: 1, background: C.dangerBg, color: C.dangerText, fontSize: 14, border: "none", padding: "12px" }}>다시 학습</button>
            <button onClick={() => recordResult("o")} style={{ ...S.btn, flex: 1, background: C.successBg, color: C.successText, fontSize: 14, border: "none", padding: "12px" }}>다음</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── StepDiaryScreen: Diary 작성 ──────────────────────────────────────────────
function StepDiaryScreen({ go, nav, lessons, sources, diaries, setDiaries, setStepDone }) {
  const lesson = lessons.find(l => l.LessonID === nav.lessonId && l.SourceID === nav.sourceId);
  const src = sources.find(s => s.SourceID === nav.sourceId);
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(false);

  // 9번: 구글시트 Lesson의 DiaryPrompt 컬럼 활용
  const diaryPrompt = (lesson?.DiaryPrompt || "").replace(/\\n/g, "\n");

  const handleSave = () => {
    if (!content.trim()) return;
    const newDiary = {
      id: `${nav.lessonId}_${nav.sourceId}_${Date.now()}`,
      lessonId: nav.lessonId,
      sourceId: nav.sourceId,
      lessonTitle: lesson?.Title || "",
      sourceName: src?.Name || "",
      content: content.trim(),
      date: today(),
      createdAt: new Date().toISOString(),
    };
    const saveKey = `${nav.lessonId}_${nav.sourceId}`;
    setStepDone(prev => ({ ...prev, [saveKey]: { ...(prev[saveKey] || {}), diary: true } }));
    setDiaries(prev => [newDiary, ...prev]);
    setSaved(true);
  };

  // 3번: 예쁜 공책 SVG
  const NotebookSVG = () => (
    <svg width="90" height="90" viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 노트 본체 */}
      <rect x="18" y="10" width="50" height="62" rx="5" fill="#4CAF82" stroke="#3A9A6E" strokeWidth="1.5"/>
      {/* 노트 오른쪽 탭들 */}
      <rect x="62" y="18" width="8" height="10" rx="2" fill="#FFD966"/>
      <rect x="62" y="32" width="8" height="10" rx="2" fill="#FF8FAB"/>
      <rect x="62" y="46" width="8" height="10" rx="2" fill="#82C4FF"/>
      {/* 스프링 링들 */}
      {[18,26,34,42,50,58,66].map((y, i) => (
        <ellipse key={i} cx="21" cy={y} rx="4" ry="3" fill="none" stroke="#B0B0B0" strokeWidth="1.8"/>
      ))}
      {/* 노트 내지 흰 영역 */}
      <rect x="26" y="18" width="34" height="20" rx="3" fill="white" opacity="0.9"/>
      {/* 내지 줄 */}
      <line x1="29" y1="24" x2="57" y2="24" stroke="#D0D0D0" strokeWidth="1.2"/>
      <line x1="29" y1="29" x2="57" y2="29" stroke="#D0D0D0" strokeWidth="1.2"/>
      <line x1="29" y1="34" x2="50" y2="34" stroke="#D0D0D0" strokeWidth="1.2"/>
      {/* 오렌지 띠 */}
      <rect x="38" y="10" width="6" height="62" rx="0" fill="#FF7043" opacity="0.7"/>
      {/* 연필 */}
      <rect x="52" y="52" width="9" height="32" rx="2" fill="#F9E04B" stroke="#E0C030" strokeWidth="1" transform="rotate(-35 52 52)"/>
      <polygon points="52,77 56,77 54,84" fill="#FBBF91" transform="rotate(-35 52 52)"/>
      <rect x="52" y="52" width="9" height="5" rx="1" fill="#E8A0A0" stroke="#C07070" strokeWidth="0.8" transform="rotate(-35 52 52)"/>
      <rect x="53" y="57" width="7" height="3" rx="0" fill="#C0C0C0" transform="rotate(-35 52 52)"/>
      {/* 장식 요소 */}
      <text x="68" y="20" fontSize="10" fill="#555" fontWeight="700">+</text>
      <rect x="14" y="62" width="6" height="6" rx="1" fill="#A78BFA" transform="rotate(20 14 62)"/>
      <circle cx="72" cy="55" r="3.5" fill="#FFD966" opacity="0.8"/>
    </svg>
  );

  if (saved) return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <NotebookSVG />
      <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 8, marginTop: 16 }}>저장됐어요!</div>
      <div style={{ color: C.sub, fontSize: 14, marginBottom: 32, textAlign: "center" }}>오늘의 학습 기록이 다이어리에 남았어요</div>
      <button onClick={() => go("lessonSteps")} style={{ ...S.btn, background: C.primary, color: "#fff", width: "100%", maxWidth: 320, padding: 16, fontSize: 15 }}>← 레슨으로</button>
    </div>
  );

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 24px", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <button onClick={() => go("lessonSteps")} style={{ ...S.btn, background: C.yellowLight, color: C.text, padding: "8px 14px", flexShrink: 0 }}>← 뒤로</button>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lesson?.Title}</div>
          <button onClick={() => go("lessonSteps")} style={S.quitBtn}>건너뛰기</button>
        </div>

        <div style={{ ...S.card, marginBottom: 16, borderLeft: `4px solid ${C.yellow}`, background: C.yellowLight }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 2 }}>{lesson?.Title}</div>
          <div style={{ fontSize: 12, color: C.sub }}>{src?.Name}</div>
        </div>

        {/* 9번: DiaryPrompt가 있으면 표시, 없으면 기본 안내 */}
        <div style={{ ...S.card, marginBottom: 16, padding: "14px 16px", background: C.yellowLight, border: `1px solid ${C.doneBorder}` }}>
          <div style={{ fontSize: 13, color: C.yellowDark, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {diaryPrompt || "오늘 배운 표현을 활용해서 자유롭게 글을 써보세요. 짧아도 괜찮아요! ✍️"}
          </div>
        </div>

        <div style={{ ...S.card, marginBottom: 16, padding: "14px 16px" }}>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="여기에 써보세요..."
            style={{ ...S.input, resize: "none", fontSize: 15, padding: "12px", lineHeight: 1.7, minHeight: 160 }}
          />
          <div style={{ fontSize: 11, color: C.sub, marginTop: 6, textAlign: "right" }}>{content.length}자</div>
        </div>

        <button onClick={handleSave} disabled={!content.trim()}
          style={{ ...S.btn, width: "100%", background: content.trim() ? C.yellow : C.border, color: content.trim() ? C.yellowDark : C.sub, padding: 14, fontSize: 15, opacity: content.trim() ? 1 : 0.5, fontWeight: 800 }}>
          저장하기
        </button>
      </div>
    </div>
  );
}

function StudyScreen({ go, nav }) {
  useEffect(() => { go("lessonSteps", nav); }, []);
  return <Center>이동 중...</Center>;
}

// ─── ReviewScreen ─────────────────────────────────────────────────────────────
function ReviewScreen({ go, reviewItems, setProgress, setStudyDays }) {
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const restartTimerRef = useRef(null);

  useEffect(() => { return () => { stopSpeak(); recRef.current?.stop(); clearTimeout(restartTimerRef.current); }; }, []);

  if (idx >= reviewItems.length) return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
      <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>복습 완료!</div>
      <div style={{ color: C.sub, fontSize: 14, marginBottom: 32 }}>{reviewItems.length}개 문장을 모두 복습했어요</div>
      <button onClick={() => go("home")} style={{ ...S.btn, background: C.primary, color: "#fff", width: "100%", maxWidth: 320, padding: 16 }}>홈으로</button>
    </div>
  );

  const item = reviewItems[idx];

  // 3번: 자동 재시작 마이크
  const startMic = () => {
    stopSpeak();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const startRec = () => {
      const r = new SR(); r.lang = "en-US"; r.continuous = true; r.interimResults = false;
      r.onresult = e => {
        const result = e.results[e.results.length - 1];
        if (!result || !result[0]) return;
        const said = result[0].transcript;
        if (!said.trim()) return;
        setAnswer(said);
      };
      r.onend = () => {
        if (recRef.current === r) {
          restartTimerRef.current = setTimeout(() => {
            if (recRef.current === r) { try { r.start(); } catch(e) {} }
          }, 200);
        }
      };
      r.onerror = (e) => {
        if (e.error === "aborted" || e.error === "not-allowed") { setListening(false); recRef.current = null; }
      };
      r.start(); recRef.current = r; setListening(true);
    };
    startRec();
  };

  const stopMic = () => {
    clearTimeout(restartTimerRef.current);
    const r = recRef.current; recRef.current = null;
    r?.stop(); setListening(false);
  };

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
  const handleQuit = () => { stopSpeak(); stopMic(); setStudyDays(prev => prev.includes(today()) ? prev : [...prev, today()]); go("home"); };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px 16px", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button onClick={() => go("home")} style={{ ...S.btn, background: C.yellowLight, color: C.text, padding: "8px 14px" }}>← 홈</button>
          <div style={{ fontWeight: 600, fontSize: 13, color: C.sub }}>{idx + 1} / {reviewItems.length}</div>
          <button onClick={handleQuit} style={S.quitBtn}>그만하기</button>
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ height: 6, background: C.border, borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.round((idx / reviewItems.length) * 100)}%`, background: C.warn, borderRadius: 99, transition: "width 0.3s" }} />
          </div>
          <div style={{ fontSize: 11, color: C.sub, textAlign: "right", marginTop: 3 }}>{Math.round((idx / reviewItems.length) * 100)}% 완료</div>
        </div>
        <div style={{ ...S.card, marginBottom: 12, background: "#FFFBEB", border: `1px solid #FDE68A`, padding: "8px 14px" }}>
          <div style={{ fontSize: 11, color: C.warn, fontWeight: 700 }}>오늘의 복습</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{item.lessonTitle}</div>
        </div>
        {!submitted ? (
          <>
            <div style={{ ...S.card, marginBottom: 12, padding: "14px 16px", textAlign: "center" }}>
              <div style={{ color: C.sub, fontSize: 11, marginBottom: 6, fontWeight: 600 }}>영어로 작성하세요</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: C.text, lineHeight: 1.5 }}>{item.Korean}</div>
              <button onClick={() => speak(item.English)} style={{ ...S.btn, background: C.yellowLight, color: C.yellowDark, fontSize: 12, padding: "6px 14px", marginTop: 10 }}>🔊 정답 듣기</button>
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
            {listening && <div style={{ textAlign: "center", color: C.primary, fontSize: 13, marginBottom: 8, fontWeight: 600 }}>🎤 녹음 중...</div>}
            <button onClick={checkAnswer} disabled={!answer.trim()} style={{ ...S.btn, width: "100%", background: C.primary, color: "#fff", opacity: !answer.trim() ? 0.4 : 1 }}>제출</button>
          </>
        ) : (
          <>
            {/* 9번: 인라인 정답 표시, 10번: ✗✓ 제거 */}
            <div style={{ ...S.card, padding: "16px", marginBottom: 12, textAlign: "center", background: correct ? C.successBg : C.dangerBg, border: "none" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: correct ? C.successText : C.dangerText, marginBottom: 8 }}>{correct ? "정답이에요!" : "틀렸어요"}</div>
              <div style={{ fontWeight: 600, color: C.text, fontSize: 14, lineHeight: 1.5, marginBottom: 6 }}>{item.English}</div>
              {answer && <div style={{ color: C.sub, fontSize: 12, marginTop: 4 }}>내 답: {answer}</div>}
              <button onClick={() => speak(item.English)} style={{ ...S.btn, background: C.yellowLight, color: C.yellowDark, fontSize: 12, padding: "5px 12px", marginTop: 10 }}>🔊 정답 듣기</button>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => recordResult("x")} style={{ ...S.btn, flex: 1, background: C.dangerBg, color: C.dangerText, fontSize: 14, border: "none", padding: "12px" }}>다시 학습</button>
              <button onClick={() => recordResult("o")} style={{ ...S.btn, flex: 1, background: C.successBg, color: C.successText, fontSize: 14, border: "none", padding: "12px" }}>다음</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── ScriptLessonListScreen ───────────────────────────────────────────────────
function ScriptLessonListScreen({ go, nav, sources, lessons, items }) {
  const src = sources.find(s => s.SourceID === nav.sourceId);
  const srcLessons = lessons.filter(l => l.SourceID === nav.sourceId).sort((a, b) => Number(a.Order) - Number(b.Order));
  return (
    <div style={S.page}>
      <div style={S.pageInner}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => go("source")} style={{ ...S.btn, background: C.yellowLight, color: C.text, padding: "8px 14px", flexShrink: 0 }}>← 뒤로</button>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{src?.Name}</div>
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

// ─── ScriptLessonScreen ───────────────────────────────────────────────────────
function ScriptLessonScreen({ go, nav, lessons, items, favorites, setFavorites }) {
  const srcLessons = lessons.filter(l => l.SourceID === nav.sourceId).sort((a, b) => Number(a.Order) - Number(b.Order));
  const lesson = srcLessons.find(l => l.LessonID === nav.lessonId);
  const lessonItems = items.filter(i => i.LessonID === nav.lessonId && i.SourceID === nav.sourceId);
  const toggleFav = (itemId) => {
    setFavorites(prev => { const next = { ...prev }; if (next[itemId]) { delete next[itemId]; } else { next[itemId] = true; } return next; });
  };
  return (
    <div style={S.page}>
      <div style={S.pageInner}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => go("scriptLesson", { sourceId: nav.sourceId })} style={{ ...S.btn, background: C.yellowLight, color: C.text, padding: "8px 14px", flexShrink: 0 }}>← 뒤로</button>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lesson?.Title}</div>
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
              <button onClick={() => speak(item.English)} style={{ ...S.btn, background: C.yellowLight, color: C.yellowDark, fontSize: 12, padding: "5px 12px", marginTop: 10 }}>🔊 듣기</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── FavoriteListScreen ───────────────────────────────────────────────────────
function FavoriteListScreen({ go, items, lessons, favorites, setFavorites }) {
  const favItems = items.filter(i => favorites[i.ItemID]).map(i => {
    const lesson = lessons.find(l => l.LessonID === i.LessonID && l.SourceID === i.SourceID);
    return { ...i, lessonTitle: lesson?.Title || "" };
  });
  const toggleFav = (itemId) => {
    setFavorites(prev => { const next = { ...prev }; if (next[itemId]) { delete next[itemId]; } else { next[itemId] = true; } return next; });
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
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => go("home")} style={{ ...S.btn, background: C.yellowLight, color: C.text, padding: "8px 14px", flexShrink: 0 }}>← 홈</button>
          <div style={{ fontWeight: 700, fontSize: 16, flex: 1, color: C.text }}>⭐ 저장한 문장</div>
          <button onClick={() => go("favoriteQuiz")} style={{ ...S.btn, background: "#F59E0B", color: "#fff", padding: "8px 14px", fontSize: 13, flexShrink: 0 }}>랜덤 QUIZ</button>
        </div>
        <div style={{ fontSize: 13, color: C.sub, marginBottom: 12 }}>저장한 문장 {favItems.length}개</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {favItems.map((item) => (
            <div key={item.ItemID} style={{ ...S.card, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: C.sub }}>{item.lessonTitle}</div>
                <button onClick={() => toggleFav(item.ItemID)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", padding: "0 4px", color: "#F59E0B" }}>★</button>
              </div>
              <div style={{ fontSize: 14, color: C.sub, lineHeight: 1.6, marginBottom: 8 }}>{item.Korean}</div>
              <div style={{ fontSize: 15, color: C.text, fontWeight: 600, lineHeight: 1.6 }}>{item.English}</div>
              <button onClick={() => speak(item.English)} style={{ ...S.btn, background: C.yellowLight, color: C.yellowDark, fontSize: 12, padding: "5px 12px", marginTop: 10 }}>🔊 듣기</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── FavoriteQuizScreen ───────────────────────────────────────────────────────
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
  const restartTimerRef = useRef(null);

  useEffect(() => { return () => { stopSpeak(); recRef.current?.stop(); clearTimeout(restartTimerRef.current); }; }, []);

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

  // 3번: 자동 재시작 마이크
  const startMic = () => {
    stopSpeak();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const startRec = () => {
      const r = new SR(); r.lang = "en-US"; r.continuous = true; r.interimResults = false;
      r.onresult = e => {
        const result = e.results[e.results.length - 1];
        if (!result || !result[0]) return;
        const said = result[0].transcript;
        if (!said.trim()) return;
        setAnswer(said);
      };
      r.onend = () => {
        if (recRef.current === r) {
          restartTimerRef.current = setTimeout(() => {
            if (recRef.current === r) { try { r.start(); } catch(e) {} }
          }, 200);
        }
      };
      r.onerror = (e) => {
        if (e.error === "aborted" || e.error === "not-allowed") { setListening(false); recRef.current = null; }
      };
      r.start(); recRef.current = r; setListening(true);
    };
    startRec();
  };

  const stopMic = () => {
    clearTimeout(restartTimerRef.current);
    const r = recRef.current; recRef.current = null;
    r?.stop(); setListening(false);
  };

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
  const handleQuit = () => { stopSpeak(); stopMic(); setStudyDays(prev => prev.includes(today()) ? prev : [...prev, today()]); go("favoriteList"); };

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px 16px", maxWidth: 480, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <button onClick={() => go("favoriteList")} style={{ ...S.btn, background: C.yellowLight, color: C.text, padding: "8px 14px", flexShrink: 0 }}>← 목록</button>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>⭐ 랜덤 QUIZ</div>
          <div style={{ fontWeight: 600, fontSize: 13, color: C.sub, flexShrink: 0 }}>{idx + 1}/{shuffled.length}</div>
          <button onClick={handleQuit} style={S.quitBtn}>그만하기</button>
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
              <button onClick={() => speak(item.English)} style={{ ...S.btn, background: C.yellowLight, color: C.yellowDark, fontSize: 12, padding: "6px 14px", marginTop: 10 }}>🔊 정답 듣기</button>
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
            {listening && <div style={{ textAlign: "center", color: C.primary, fontSize: 13, marginBottom: 8, fontWeight: 600 }}>🎤 녹음 중...</div>}
            <button onClick={checkAnswer} disabled={!answer.trim()} style={{ ...S.btn, width: "100%", background: C.primary, color: "#fff", opacity: !answer.trim() ? 0.4 : 1 }}>제출</button>
          </>
        ) : (
          <>
            <div style={{ ...S.card, padding: "16px", marginBottom: 12, textAlign: "center", background: correct ? C.successBg : C.dangerBg, border: "none" }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: correct ? C.successText : C.dangerText, marginBottom: 8 }}>{correct ? "정답이에요!" : "틀렸어요"}</div>
              <div style={{ fontWeight: 600, color: C.text, fontSize: 14, lineHeight: 1.5, marginBottom: 6 }}>{item.English}</div>
              {answer && <div style={{ color: C.sub, fontSize: 12 }}>내 답: {answer}</div>}
              <button onClick={() => speak(item.English)} style={{ ...S.btn, background: C.yellowLight, color: C.yellowDark, fontSize: 12, padding: "5px 12px", marginTop: 10 }}>🔊 정답 듣기</button>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => next("x")} style={{ ...S.btn, flex: 1, background: C.dangerBg, color: C.dangerText, fontSize: 14, border: "none", padding: "12px" }}>다시 학습</button>
              <button onClick={() => next("o")} style={{ ...S.btn, flex: 1, background: C.successBg, color: C.successText, fontSize: 14, border: "none", padding: "12px" }}>다음</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── DiaryListScreen ──────────────────────────────────────────────────────────
// 8번: 다이어리 목록 (홈 화면에서 진입)
function DiaryListScreen({ go, diaries, setDiaries }) {
  // 9번: 최신순 정렬
  const sorted = [...diaries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (sorted.length === 0) return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>📓</div>
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>아직 일기가 없어요</div>
      <div style={{ color: C.sub, fontSize: 14, marginBottom: 32, textAlign: "center" }}>레슨을 마친 후 Diary를 작성해보세요</div>
      <button onClick={() => go("home")} style={{ ...S.btn, background: C.primary, color: "#fff", padding: "12px 28px" }}>홈으로</button>
    </div>
  );

  return (
    <div style={S.page}>
      <div style={S.pageInner}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => go("home")} style={{ ...S.btn, background: C.yellowLight, color: C.text, padding: "8px 14px", flexShrink: 0 }}>← 홈</button>
          <div style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>📓 내 다이어리</div>
          <div style={{ fontSize: 13, color: C.sub }}>{sorted.length}개</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map(diary => (
            <div key={diary.id} onClick={() => go("diaryDetail", { diaryId: diary.id })}
              style={{ ...S.card, cursor: "pointer", borderLeft: `3px solid ${C.yellow}`, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                <button onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm("이 다이어리를 삭제할까요?")) {
                    setDiaries(prev => prev.filter(d => d.id !== diary.id));
                  }
                }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.sub, padding: "2px 4px" }}>🗑️</button>
              </div>
              <div style={{ fontSize: 11, color: C.sub, marginBottom: 4 }}>{diary.date} · {diary.sourceName}</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{diary.lessonTitle}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── DiaryDetailScreen ────────────────────────────────────────────────────────
function DiaryDetailScreen({ go, nav, diaries }) {
  const diary = diaries.find(d => d.id === nav.diaryId);
  if (!diary) return <Center>일기를 찾을 수 없어요</Center>;

  return (
    <div style={S.page}>
      <div style={S.pageInner}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => go("diaryList")} style={{ ...S.btn, background: C.yellowLight, color: C.text, padding: "8px 14px", flexShrink: 0 }}>← 뒤로</button>
          <div style={{ fontWeight: 700, fontSize: 15, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{diary.lessonTitle}</div>
        </div>
        <div style={{ ...S.card, marginBottom: 16, borderLeft: `4px solid ${C.yellow}`, background: C.yellowLight }}>
          <div style={{ fontSize: 12, color: C.sub, marginBottom: 4 }}>{diary.date} · {diary.sourceName}</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{diary.lessonTitle}</div>
        </div>
        <div style={{ ...S.card, padding: "20px" }}>
          <div style={{ fontSize: 16, color: C.text, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{diary.content}</div>
        </div>
      </div>
    </div>
  );
}
