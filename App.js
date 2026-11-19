import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView, View, Text, TextInput, Pressable, ScrollView,
  StyleSheet, Alert, StatusBar, KeyboardAvoidingView, Platform
} from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { io } from "socket.io-client";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || "http://10.0.2.2:3000";
const C = {
  bg: "#11131A", panel: "#1A1E28", panel2: "#242B37",
  line: "#303746", text: "#F4F5F7", muted: "#A2A9B7",
  mint: "#A8D5C2", gold: "#D9C49A", red: "#FF9292"
};

function Button({ title, onPress, secondary = false, disabled = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button, secondary ? styles.secondaryButton : styles.primaryButton,
        disabled && styles.disabled, pressed && !disabled && { opacity: 0.82 }
      ]}
    >
      <Text style={[styles.buttonText, secondary && { color: C.text }]}>{title}</Text>
    </Pressable>
  );
}

export default function App() {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [screen, setScreen] = useState("home");
  const [room, setRoom] = useState(null);
  const [ready, setReady] = useState(false);
  const [role, setRole] = useState(null);
  const [game, setGame] = useState(null);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState("connecting");
  const [selected, setSelected] = useState("");
  const [chat, setChat] = useState([]);
  const [message, setMessage] = useState("");
  const [investigation, setInvestigation] = useState(null);
  const [endResult, setEndResult] = useState(null);

  const socket = useMemo(() => io(SERVER_URL, {
    autoConnect: true, transports: ["websocket", "polling"], reconnection: true
  }), []);

  useEffect(() => {
    const onConnect = () => { setConnection("connected"); setError(""); };
    const onDisconnect = () => setConnection("disconnected");
    const onConnectError = () => {
      setConnection("disconnected");
      setError("تعذر الاتصال بالخادم. تأكد من عنوان الخادم.");
    };
    const onRoom = (data) => {
      setRoom(data);
      const me = data.players.find((p) => p.id === socket.id);
      if (me) setReady(Boolean(me.ready));
      if (data.phase === "lobby" && ["role", "game", "finished"].includes(screen)) {
        setScreen("lobby");
        setGame(null);
        setRole(null);
      }
    };
    const onRole = (data) => { setRole(data); setScreen("role"); };
    const onGameState = (data) => {
      setGame(data);
      // Keep the private role card visible until the player explicitly continues.
      if ((data.phase === "night" || data.phase === "day") && screen !== "role") setScreen("game");
      if (data.phase === "finished") setScreen("finished");
    };
    const onNotice = (text) => Alert.alert("تنبيه اللعبة", text);
    const onAnnouncement = (text) => Alert.alert("أحداث الجولة", text);
    const onChat = (item) => setChat((old) => [...old.slice(-49), item]);
    const onInvestigation = (result) => {
      setInvestigation(result);
      Alert.alert("نتيجة التحقيق", `${result.name}: ${result.result}`);
    };
    const onEnded = (result) => { setEndResult(result); setScreen("finished"); };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("room:update", onRoom);
    socket.on("game:your-role", onRole);
    socket.on("game:state", onGameState);
    socket.on("game:notice", onNotice);
    socket.on("game:announcement", onAnnouncement);
    socket.on("game:chatMessage", onChat);
    socket.on("game:investigation", onInvestigation);
    socket.on("game:ended", onEnded);
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("room:update", onRoom);
      socket.off("game:your-role", onRole);
      socket.off("game:state", onGameState);
      socket.off("game:notice", onNotice);
      socket.off("game:announcement", onAnnouncement);
      socket.off("game:chatMessage", onChat);
      socket.off("game:investigation", onInvestigation);
      socket.off("game:ended", onEnded);
      socket.disconnect();
    };
  }, [socket, screen]);

  function emitAck(event, payload) {
    return new Promise((resolve) => {
      socket.timeout(6000).emit(event, payload, (err, result) => {
        if (err) resolve({ ok: false, error: "انتهت مهلة الاتصال بالخادم." });
        else resolve(result || { ok: false, error: "حدث خطأ غير متوقع." });
      });
    });
  }
  async function createRoom() {
    setError("");
    if (!name.trim()) return setError("اكتب اسمك أولاً.");
    const result = await emitAck("room:create", { name: name.trim() });
    if (!result.ok) return setError(result.error);
    setCode(result.code); setScreen("lobby");
  }
  async function joinRoom() {
    setError("");
    if (!name.trim()) return setError("اكتب اسمك أولاً.");
    if (code.trim().length !== 5) return setError("رمز الغرفة يتكون من 5 أحرف.");
    const result = await emitAck("room:join", { name: name.trim(), code });
    if (!result.ok) return setError(result.error);
    setCode(result.code); setScreen("lobby");
  }
  function toggleReady() {
    const next = !ready; setReady(next); socket.emit("player:ready", next);
  }
  async function startGame() {
    const result = await emitAck("game:start");
    if (!result.ok) setError(result.error);
  }
  async function submitNightAction() {
    if (!selected) return setError("اختار لاعباً أولاً.");
    const result = await emitAck("game:nightAction", { targetId: selected });
    if (!result.ok) setError(result.error);
    else setError("تم تسجيل اختيارك بسرية.");
  }
  async function sendChat() {
    const result = await emitAck("game:chat", { message });
    if (!result.ok) setError(result.error);
    else setMessage("");
  }
  async function vote() {
    if (!selected) return setError("اختار لاعباً للتصويت.");
    const result = await emitAck("game:vote", { targetId: selected });
    if (!result.ok) setError(result.error);
    else setError("تم تسجيل صوتك.");
  }
  function leaveRoom() {
    socket.disconnect(); socket.connect();
    setRoom(null); setRole(null); setGame(null); setReady(false);
    setChat([]); setSelected(""); setError(""); setScreen("home");
  }

  const isHost = room?.hostId === socket.id;
  const aliveTargets = (game?.alivePlayers || []).filter((p) => {
    if (game.phase === "day") return p.id !== socket.id;
    if (role?.role === "الطبيب") return true;
    return p.id !== socket.id;
  });
  const myPlayer = game?.players?.find((p) => p.id === socket.id);
  const submitted = Boolean(game?.submitted);

  return (
    <SafeAreaView style={styles.safe}>
      <ExpoStatusBar style="light" />
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.logo}><Text style={styles.logoText}>M</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>SOCIAL DEDUCTION GAME</Text>
              <Text style={styles.brand}>MAFIA <Text style={styles.brandSub}>THE NIGHT</Text></Text>
            </View>
            <View style={styles.onlinePill}>
              <View style={[styles.dot, connection !== "connected" && { backgroundColor: C.red }]} />
              <Text style={styles.onlineText}>{connection === "connected" ? "متصل" : "غير متصل"}</Text>
            </View>
          </View>

          {screen === "home" && (
            <View style={styles.panel}>
              <Text style={styles.eyebrow}>مرحباً بك في المدينة</Text>
              <Text style={styles.hero}>اللعبة تبدأ{"\n"}<Text style={{ color: C.mint }}>من هنا.</Text></Text>
              <Text style={styles.muted}>غرفة خاصة لأصدقائك. بدون حساب؛ اسم مستعار ورمز غرفة.</Text>
              <Text style={styles.label}>اسم اللاعب</Text>
              <TextInput value={name} onChangeText={setName} placeholder="اكتب اسماً مستعاراً"
                placeholderTextColor="#697282" maxLength={18} style={styles.input} />
              <Button title="إنشاء غرفة خاصة" onPress={createRoom} />
              <View style={styles.joinRow}>
                <TextInput value={code} onChangeText={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
                  placeholder="رمز الغرفة" placeholderTextColor="#697282" maxLength={5}
                  autoCapitalize="characters" style={[styles.input, styles.codeInput]} />
                <View style={{ width: 110 }}><Button title="انضمام" onPress={joinRoom} secondary /></View>
              </View>
              {!!error && <Text style={styles.error}>{error}</Text>}
              <Text style={styles.footnote}>6–12 لاعباً • بطاقات سرية • دردشة كتابية</Text>
            </View>
          )}

          {screen === "lobby" && (
            <View style={styles.panel}>
              <Text style={styles.eyebrow}>غرفة خاصة</Text>
              <Text style={styles.sectionTitle}>استعدوا للّعب</Text>
              <View style={styles.codeBox}>
                <Text style={styles.mutedSmall}>رمز الدعوة</Text>
                <Text style={styles.roomCode}>{room?.code || code}</Text>
                <Text style={styles.copyText}>شارك الرمز مع أصدقائك</Text>
              </View>
              <View style={styles.listHeading}><Text style={styles.label}>اللاعبون</Text><Text style={styles.mutedSmall}>{room?.players?.length || 0} / 12</Text></View>
              <View style={styles.playerGrid}>
                {(room?.players || []).map((p) => (
                  <View key={p.id} style={styles.player}>
                    <View style={styles.avatar}><Text style={styles.avatarText}>{p.name.slice(0, 1)}</Text></View>
                    <Text numberOfLines={1} style={styles.playerName}>{p.name}{p.isHost ? " •" : ""}</Text>
                    <Text style={[styles.playerReady, p.ready && { color: C.mint }]}>{p.ready ? "جاهز" : "ينتظر"}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.muted}>6 لاعبين على الأقل، وكل لاعب يضغط جاهز قبل البداية.</Text>
              <Button title={ready ? "إلغاء الجاهزية" : "أنا جاهز"} onPress={toggleReady} secondary />
              {isHost && <Button title="ابدأ اللعبة" onPress={startGame} />}
              {!!error && <Text style={styles.error}>{error}</Text>}
              <Pressable onPress={leaveRoom} style={styles.leave}><Text style={styles.leaveText}>مغادرة الغرفة</Text></Pressable>
            </View>
          )}

          {screen === "role" && (
            <View style={styles.panel}>
              <Text style={styles.eyebrow}>بطاقتك السرية</Text>
              <Text style={styles.sectionTitle}>دورك في هذه الجولة</Text>
              <View style={styles.roleCard}>
                <Text style={styles.roleSymbol}>{role?.role === "المافيا" ? "♠" : role?.role === "الطبيب" ? "✚" : role?.role === "المحقق" ? "⌕" : "◆"}</Text>
                <Text style={styles.roleTitle}>{role?.role || "دور سري"}</Text>
                <Text style={styles.roleHint}>هذه البطاقة إلك وحدك. حتى المافيا ما تعرف أعضاء فريقها.</Text>
              </View>
              <Button title="فهمت، تابع" onPress={() => setScreen("game")} secondary />
            </View>
          )}

          {screen === "game" && game && (
            <View style={styles.panel}>
              <Text style={styles.eyebrow}>الجولة {game.round}</Text>
              <Text style={styles.sectionTitle}>{game.phase === "night" ? "🌙 مرحلة الليل" : "☀️ مرحلة النهار"}</Text>
              <Text style={styles.muted}>
                {game.phase === "night"
                  ? "الأدوار الخاصة تختار أهدافها بسرية. بقية اللاعبين ينتظرون."
                  : "ناقشوا الأحداث ثم صوّتوا لإخراج لاعب."}
              </Text>

              {game.phase === "night" && role?.role !== "مواطن" && (
                <>
                  <Text style={styles.label}>
                    {role?.role === "المافيا" ? "اختر هدفاً سرياً" :
                     role?.role === "الطبيب" ? "اختر لاعباً للحماية" : "اختر لاعباً للتحقيق"}
                  </Text>
                  {aliveTargets.map((p) => (
                    <Pressable key={p.id} onPress={() => setSelected(p.id)}
                      style={[styles.target, selected === p.id && styles.targetSelected]}>
                      <Text style={styles.playerName}>{p.name}{p.id === socket.id ? " (أنت)" : ""}</Text>
                      <Text style={styles.mutedSmall}>{selected === p.id ? "محدد" : "اختيار"}</Text>
                    </Pressable>
                  ))}
                  <Button title={submitted ? "تم إرسال اختيارك" : "تأكيد الاختيار السري"}
                    onPress={submitNightAction} disabled={submitted} />
                </>
              )}
              {game.phase === "night" && role?.role === "مواطن" && (
                <View style={styles.infoBox}><Text style={styles.muted}>أنت مواطن. انتظر انتهاء الأدوار الليلية.</Text></View>
              )}

              {game.phase === "day" && (
                <>
                  <Text style={styles.label}>محادثة النهار</Text>
                  <View style={styles.chatBox}>
                    {chat.slice(-20).map((m, i) => (
                      <Text key={`${m.playerId}-${i}`} style={styles.chatLine}>
                        <Text style={{ color: C.mint, fontWeight: "700" }}>{m.name}: </Text>{m.message}
                      </Text>
                    ))}
                    {!chat.length && <Text style={styles.mutedSmall}>ماكو رسائل بعد. ابدأوا النقاش.</Text>}
                  </View>
                  <View style={styles.joinRow}>
                    <TextInput value={message} onChangeText={setMessage} placeholder="اكتب رسالتك..."
                      placeholderTextColor="#697282" maxLength={240} style={[styles.input, styles.codeInput]} />
                    <View style={{ width: 94 }}><Button title="إرسال" onPress={sendChat} secondary /></View>
                  </View>
                  <Text style={styles.label}>التصويت</Text>
                  {aliveTargets.map((p) => (
                    <Pressable key={p.id} onPress={() => setSelected(p.id)}
                      style={[styles.target, selected === p.id && styles.targetSelected]}>
                      <Text style={styles.playerName}>{p.name}</Text>
                      <Text style={styles.mutedSmall}>{selected === p.id ? "محدد" : "تصويت"}</Text>
                    </Pressable>
                  ))}
                  <Button title={submitted ? "تم تسجيل صوتك" : "تأكيد التصويت"}
                    onPress={vote} disabled={submitted} />
                </>
              )}

              {!!investigation && <Text style={styles.infoText}>آخر نتيجة تحقيق: {investigation.name} — {investigation.result}</Text>}
              {!!error && <Text style={styles.error}>{error}</Text>}
              <Text style={styles.mutedSmall}>اللاعبون الأحياء: {game.alivePlayers?.length || 0}</Text>
            </View>
          )}

          {screen === "finished" && (
            <View style={styles.panel}>
              <Text style={styles.eyebrow}>انتهت الجولة</Text>
              <Text style={styles.hero}>الفائز:{"\n"}<Text style={{ color: C.mint }}>{endResult?.winner || game?.winner || "—"}</Text></Text>
              <Text style={styles.label}>كشف الأدوار</Text>
              {(endResult?.players || []).map((p, i) => (
                <View key={`${p.name}-${i}`} style={styles.target}>
                  <Text style={styles.playerName}>{p.name}</Text>
                  <Text style={styles.mutedSmall}>{p.role} • {p.alive ? "باقٍ" : "خرج"}</Text>
                </View>
              ))}
              <Button title="العودة للرئيسية" onPress={() => {
                socket.disconnect(); socket.connect();
                setRoom(null); setRole(null); setGame(null); setEndResult(null);
                setChat([]); setSelected(""); setReady(false); setScreen("home");
              }} />
            </View>
          )}

          <Text style={styles.footer}>MAFIA: THE NIGHT • BUILD 0.3</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  page: { flexGrow: 1, padding: 18, paddingTop: 12, justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 25 },
  logo: { width: 46, height: 46, borderRadius: 14, borderWidth: 1, borderColor: "#789C91", alignItems: "center", justifyContent: "center" },
  logoText: { color: C.mint, fontSize: 25, fontWeight: "800" },
  eyebrow: { color: C.mint, fontSize: 10, letterSpacing: 1.4, marginBottom: 5 },
  brand: { color: C.text, fontSize: 19, fontWeight: "800", letterSpacing: 1.5 },
  brandSub: { color: C.muted, fontSize: 10, fontWeight: "500" },
  onlinePill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.panel, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 },
  dot: { width: 7, height: 7, borderRadius: 5, backgroundColor: C.mint },
  onlineText: { color: C.muted, fontSize: 10 },
  panel: { backgroundColor: C.panel, borderColor: C.line, borderWidth: 1, borderRadius: 23, padding: 22 },
  hero: { color: C.text, fontSize: 31, lineHeight: 46, fontWeight: "800", marginVertical: 9 },
  sectionTitle: { color: C.text, fontSize: 27, fontWeight: "800", marginBottom: 14 },
  muted: { color: C.muted, fontSize: 13, lineHeight: 22, marginBottom: 14 },
  label: { color: "#D7DBE2", fontSize: 13, marginBottom: 8, marginTop: 8 },
  input: { width: "100%", color: C.text, backgroundColor: "#11151D", borderWidth: 1, borderColor: "#394252", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 12, fontSize: 15 },
  button: { minHeight: 48, borderRadius: 12, justifyContent: "center", alignItems: "center", paddingHorizontal: 14, marginTop: 10 },
  primaryButton: { backgroundColor: C.mint },
  secondaryButton: { backgroundColor: "#303846", borderWidth: 1, borderColor: "#465161" },
  buttonText: { color: "#14201C", fontWeight: "800", fontSize: 14 },
  disabled: { opacity: 0.45 },
  joinRow: { flexDirection: "row", gap: 9, alignItems: "center", marginTop: 9 },
  codeInput: { flex: 1, marginBottom: 0, textAlign: "center", letterSpacing: 2 },
  error: { color: C.red, fontSize: 12, lineHeight: 19, marginTop: 10 },
  footnote: { color: "#7E8795", fontSize: 11, textAlign: "center", marginTop: 20 },
  codeBox: { alignItems: "center", backgroundColor: "#11151D", borderColor: C.line, borderWidth: 1, borderRadius: 15, padding: 15, marginVertical: 12 },
  mutedSmall: { color: C.muted, fontSize: 11 },
  roomCode: { color: C.gold, fontSize: 29, fontWeight: "800", letterSpacing: 6, marginVertical: 5 },
  copyText: { color: C.mint, fontSize: 11, marginTop: 3 },
  listHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  playerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 13 },
  player: { width: "48%", minHeight: 52, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#11151D", borderColor: C.line, borderWidth: 1, borderRadius: 11, padding: 7 },
  avatar: { width: 29, height: 29, borderRadius: 9, backgroundColor: "#2B3940", alignItems: "center", justifyContent: "center" },
  avatarText: { color: C.mint, fontWeight: "800" },
  playerName: { color: C.text, fontSize: 12, flex: 1 },
  playerReady: { color: C.muted, fontSize: 9 },
  leave: { alignItems: "center", marginTop: 16, padding: 8 },
  leaveText: { color: C.red, fontSize: 12 },
  roleCard: { backgroundColor: "#203433", borderColor: "#57796E", borderWidth: 1, borderRadius: 19, alignItems: "center", padding: 26, marginVertical: 18 },
  roleSymbol: { color: C.gold, fontSize: 52 },
  roleTitle: { color: C.text, fontSize: 28, fontWeight: "800", marginVertical: 8 },
  roleHint: { color: "#C0C8C7", fontSize: 12, textAlign: "center", lineHeight: 20 },
  target: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 13, borderRadius: 11, borderWidth: 1, borderColor: C.line, backgroundColor: "#11151D", marginVertical: 4 },
  targetSelected: { borderColor: C.mint, backgroundColor: "#1B302D" },
  infoBox: { backgroundColor: "#11151D", borderRadius: 12, padding: 14, marginVertical: 10 },
  infoText: { color: C.gold, fontSize: 12, marginTop: 12 },
  chatBox: { backgroundColor: "#11151D", borderColor: C.line, borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 90, maxHeight: 220 },
  chatLine: { color: C.text, fontSize: 12, lineHeight: 21, marginBottom: 4 },
  footer: { color: "#727B89", fontSize: 10, textAlign: "center", marginTop: 25, letterSpacing: 1 }
});
