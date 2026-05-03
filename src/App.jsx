 return (
    <>
      <div style={{ ...S.card, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", textAlign: "center", marginBottom: 16, paddingTop: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.sub, marginBottom: 36 }}>🎤 Speaking 3회 실시</div>
        <div style={{ color: C.sub, fontSize: 20, lineHeight: 1.6, marginBottom: 24 }}>{item.Korean}</div>
        <div style={{ display: "flex", gap: 10, width: "100%", marginBottom: 12 }}>
          <button onClick={() => speak(item.English)} style={{ ...S.btn, flex: 1, background: C.pill, color: C.primary, fontSize: 13 }}>🔊 듣기</button>
          <button onClick={startRepeat} disabled={isListening} style={{ ...S.btn, flex: 1, background: isListening ? "#FEF3C7" : "#FEF3C7", color: "#92400E", fontSize: 13, opacity: isListening ? 0.6 : 1 }}>
            🎤 Speaking
          </button>
          {isListening && (
            <button onClick={() => { recRef.current?.stop(); setIsListening(false); }} style={{ ...S.btn, background: "#FEE2E2", color: C.danger, fontSize: 13, padding: "11px 16px" }}>
              ⏹ 완료