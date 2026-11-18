/* 부산대성 예산실적 관리: GitHub Pages 배포판 어댑터
 * 앱 본문은 claude.ai 판과 같은 코드를 쓰고, 이 파일이 window.claude.use(...)가 돌려주는 기능을 대신 제공함
 *   db        -> Firebase Firestore (공유 저장)
 *   user      -> Firebase Auth 로그인 + members 컬렉션의 역할(admin / editor / viewer)
 *   sample    -> Claude API (각 사용자가 이 브라우저에 넣은 API 키 사용, 키는 서버로 저장하지 않음)
 *   downloads -> 브라우저 파일 저장
 * firebase-config.js 의 window.BDB_FIREBASE 가 비어 있으면 저장 기능 없이 예시 화면만 동작함
 */
(function () {
  "use strict";
  window.BDB_ENV = "pages";
  const CFG = window.BDB_FIREBASE;
  const KEY_STORE = "bdb-anthropic-key";
  const MODEL = "claude-opus-5-5";
  const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.137.0/+esm";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const getKey = () => { try { return localStorage.getItem(KEY_STORE) || ""; } catch (e) { return ""; } };

  // ----- 화면 덮개(로그인, 안내) -----
  const css = `
  .bdb-ov{position:fixed;inset:0;z-index:100;background:var(--bg,#F4F6F9);display:flex;align-items:center;justify-content:center;padding:max(16px,env(safe-area-inset-left,0px))}
  .bdb-card{background:var(--surface,#fff);border:1px solid var(--line,#D6DBE3);max-width:420px;width:100%;padding:22px;display:grid;gap:12px;font-family:var(--font,sans-serif);color:var(--fg,#18202D)}
  .bdb-card h2{margin:0;font-size:18px;color:var(--navy,#1F3864)} .bdb-card p{margin:0;font-size:13px;color:var(--muted,#5B6577);line-height:1.6}
  .bdb-card input{font:inherit;font-size:14px;padding:8px 10px;border:1px solid var(--line,#D6DBE3);border-radius:3px;background:var(--surface,#fff);color:var(--fg,#18202D)}
  .bdb-card button{font:inherit;font-size:14px;padding:9px 12px;border-radius:3px;border:1px solid var(--line,#D6DBE3);background:var(--surface,#fff);color:var(--fg,#18202D);cursor:pointer}
  .bdb-card button.pri{background:var(--navy2,#2E5597);border-color:var(--navy2,#2E5597);color:var(--on-navy,#fff);font-weight:700}
  .bdb-card .err{color:var(--accent,#C00000);font-size:13px;min-height:1em}
  .bdb-user{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--muted,#5B6577)}
  .bdb-user button{font:inherit;font-size:12px;padding:2px 8px;border:1px solid var(--line,#D6DBE3);background:var(--surface,#fff);color:var(--fg,#18202D);border-radius:3px;cursor:pointer}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  function overlay(html) { let o = document.getElementById("bdbOv"); if (!o) { o = document.createElement("div"); o.id = "bdbOv"; o.className = "bdb-ov"; document.body.appendChild(o); } o.innerHTML = `<div class="bdb-card">${html}</div>`; return o; }
  function closeOverlay() { const o = document.getElementById("bdbOv"); if (o) o.remove(); }
  const onReady = fn => document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", fn) : fn();

  // ----- 다운로드 -----
  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return { status: "saved" };
    }
  };

  // ----- Claude API (sample 대체) -----
  let sdkP = null;
  const loadSdk = () => (sdkP = sdkP || import(SDK_URL).then(m => m.default || m.Anthropic));
  function makeSample() {
    if (!getKey()) return null;
    const fn = async function sample(input, opts = {}) {
      const Anthropic = await loadSdk();
      const client = new Anthropic({ apiKey: getKey(), dangerouslyAllowBrowser: true });
      const messages = typeof input === "string" ? [{ role: "user", content: input }] : input.map(m => ({ role: m.role, content: String(m.content) }));
      const stream = client.beta.messages.stream({
        model: MODEL, max_tokens: 16000,
        output_config: { effort: typeof input === "string" ? "high" : "medium" },
        betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
        messages,
      });
      let text = "";
      stream.on("text", delta => { text += delta; if (opts.onText) { try { opts.onText({ text, delta }); } catch (e) { console.error(e); } } });
      const onAbort = () => stream.abort();
      if (opts.signal) { if (opts.signal.aborted) stream.abort(); else opts.signal.addEventListener("abort", onAbort, { once: true }); }
      try {
        const msg = await stream.finalMessage();
        if (msg.stop_reason === "refusal") throw { code: "refused", message: "refusal" };
        const out = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
        if (!out.trim()) throw { code: "empty_completion", message: "empty" };
        return { text: out, truncated: msg.stop_reason === "max_tokens", modelTierApplied: "default" };
      } catch (e) {
        if (e && e.code && !(e instanceof Error)) throw e;
        const keep = text ? { text } : {};
        if ((opts.signal && opts.signal.aborted) || (Anthropic.APIUserAbortError && e instanceof Anthropic.APIUserAbortError)) throw { code: "cancelled", message: "cancelled", ...keep };
        if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw { code: "bad_key", message: "auth", ...keep };
        if (e instanceof Anthropic.RateLimitError) throw { code: "rate_limited", message: "rate", ...keep };
        if (e instanceof Anthropic.BadRequestError) throw { code: "invalid_request", message: String(e.message || ""), ...keep };
        throw { code: "upstream_error", message: String((e && e.message) || e), ...keep };
      } finally { if (opts.signal) opts.signal.removeEventListener("abort", onAbort); }
    };
    fn.json = async (input, opts) => { const r = await fn(input, opts); const t = r.text; const m = t.match(/[\[{][\s\S]*[\]}]/); return JSON.parse(m ? m[0] : t); };
    fn.limits = async () => ({ maxPromptBytes: 262144 });
    return fn;
  }

  const EXT = window.BDB_EXT = {
    offText: CFG ? "로그인 필요" : "Firebase 설정 전",
    aiMissing: "AI 분석을 쓰려면 '기준정보' 화면 아래 'AI 설정'에 Claude API 키를 넣음. 키는 이 브라우저에만 저장됨",
    aiErr(e) {
      const c = e && e.code;
      if (c === "bad_key") return "Claude API 키가 맞지 않거나 권한이 없음. 기준정보 > AI 설정에서 키를 확인함";
      if (c === "invalid_request") return "AI 요청 형식 오류: " + String(e.message || "").slice(0, 120);
      return "";
    },
    members: {}, me: null,
    rulesHtml({ admin }) {
      const key = getKey();
      const mem = Object.entries(EXT.members).sort((a, b) => a[0].localeCompare(b[0]));
      return `
      <div class="grid2">
        <div class="panel"><span class="cap">6 AI 설정 (이 브라우저 전용)</span>
          <div class="note">AI 분석은 Claude API(${MODEL})로 실행함. 키는 서버에 저장하지 않고 이 브라우저에만 보관함. 사용 요금은 키를 발급한 계정에 청구됨</div>
          <div class="toolbar"><label class="sr" for="bdbKey">Claude API 키</label><input type="password" id="bdbKey" placeholder="${key ? "저장된 키 있음 (바꾸려면 새로 입력)" : "sk-ant-로 시작하는 키"}" autocomplete="off" style="flex:1 1 240px">
          <button class="btn pri" id="bdbKeySave">키 저장</button>${key ? `<button class="btn" id="bdbKeyDel">키 삭제</button>` : ""}</div></div>
        ${admin ? `<div class="panel"><span class="cap">7 구성원 관리 (관리자)</span>
          <div class="note">등록된 이메일로 로그인한 사람만 자료를 볼 수 있음. admin: 기준정보와 구성원 관리, editor: 예산과 실적 입력, viewer: 보기만</div>
          <div class="tbl"><table><thead><tr><th>이메일</th><th>이름</th><th>역할</th><th></th></tr></thead><tbody>
          ${mem.map(([em, m]) => `<tr><td>${esc(em)}</td><td>${esc(m.name || "")}</td><td><select data-role="${esc(em)}" aria-label="${esc(em)} 역할">${["admin", "editor", "viewer"].map(r => `<option${m.role === r ? " selected" : ""}>${r}</option>`).join("")}</select></td><td>${em === (EXT.me || "") ? "" : `<button class="btn sm" data-mdel="${esc(em)}">삭제</button>`}</td></tr>`).join("")}
          </tbody></table></div>
          <form class="toolbar" id="bdbMemForm"><label class="sr" for="bdbMemEmail">이메일</label><input type="text" id="bdbMemEmail" placeholder="이메일" style="flex:1 1 180px"><label class="sr" for="bdbMemName">이름</label><input type="text" id="bdbMemName" placeholder="이름" style="width:110px"><label class="sr" for="bdbMemRole">역할</label><select id="bdbMemRole"><option>editor</option><option>viewer</option><option>admin</option></select><button class="btn pri">구성원 추가</button></form></div>` : ""}
      </div>
      ${admin ? `<div class="panel"><span class="cap">8 기준정보 가져오기 (관리자)</span>
        <div class="note">공개 저장소에는 계정 매핑과 적요 규칙을 넣지 않았음. 경영기획실이 보관한 '기준정보_초기값.json' 파일을 골라 한 번 올리면 모든 구성원에게 적용됨</div>
        <div class="toolbar"><label class="btn" for="bdbCfgFile">JSON 파일 고르기</label><input type="file" id="bdbCfgFile" accept=".json,application/json" class="sr"></div></div>` : ""}`;
    },
    bindRules(el, ctx) {
      const $ = s => el.querySelector(s);
      if ($("#bdbKeySave")) $("#bdbKeySave").onclick = () => { const v = $("#bdbKey").value.trim(); if (!/^sk-ant-/.test(v)) { ctx.toast("키 형식이 맞지 않음. sk-ant-로 시작하는 키를 넣음"); return; } try { localStorage.setItem(KEY_STORE, v); } catch (e) { ctx.toast("이 브라우저에서는 키를 저장할 수 없음"); return; } ctx.toast("키를 저장함. 화면을 다시 불러옴"); setTimeout(() => location.reload(), 600); };
      if ($("#bdbKeyDel")) $("#bdbKeyDel").onclick = () => { try { localStorage.removeItem(KEY_STORE); } catch (e) {} ctx.toast("키를 삭제함. 화면을 다시 불러옴"); setTimeout(() => location.reload(), 600); };
      const fs = window.firebase && CFG ? firebase.firestore() : null;
      if (fs && $("#bdbMemForm")) $("#bdbMemForm").onsubmit = async ev => {
        ev.preventDefault(); const em = $("#bdbMemEmail").value.trim().toLowerCase(), nm = $("#bdbMemName").value.trim(), rl = $("#bdbMemRole").value;
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { ctx.toast("이메일 형식이 맞지 않음"); return; }
        try { await fs.collection("members").doc(em).set({ name: nm, role: rl, addedBy: EXT.me, addedAt: new Date().toISOString() }); ctx.toast(`${em}을 ${rl}로 등록함`); } catch (e) { ctx.toast("등록하지 못함. 관리자 권한을 확인함"); }
      };
      if (fs) el.querySelectorAll("[data-role]").forEach(s => s.onchange = async () => { try { await fs.collection("members").doc(s.dataset.role).set({ role: s.value }, { merge: true }); ctx.toast("역할을 바꿈"); } catch (e) { ctx.toast("바꾸지 못함"); } });
      if (fs) el.querySelectorAll("[data-mdel]").forEach(b => b.onclick = async () => { const em = b.dataset.mdel; if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "한 번 더 누르면 삭제"; return; } try { await fs.collection("members").doc(em).delete(); ctx.toast(`${em}을 삭제함`); } catch (e) { ctx.toast("삭제하지 못함"); } });
      if (fs && $("#bdbCfgFile")) $("#bdbCfgFile").onchange = async e => {
        const f = e.target.files[0]; if (!f) return;
        try {
          const j = JSON.parse(await f.text());
          const ok = Array.isArray(j.acct) && Array.isArray(j.rules) && Array.isArray(j.std) && j.acct.every(a => a && typeof a.a === "string") && j.rules.every(r => r && typeof r.a === "string" && typeof r.p === "string" && typeof r.i === "string") && j.std.every(s => Array.isArray(s) && s.length === 2);
          if (!ok) { ctx.toast("기준정보 파일 형식이 아님(acct, rules, std 필요)"); return; }
          const body = { acct: j.acct, rules: j.rules, std: j.std, thr: j.thr || { amt: 500000, rate: 0.1 }, center: String(j.center || ""), updatedBy: EXT.me, updatedAt: new Date().toISOString() };
          await fs.doc("config/main").set(body); ctx.toast(`기준정보를 올림. 계정 ${body.acct.length}개, 규칙 ${body.rules.length}개, 표준 적요 ${body.std.length}줄`);
        } catch (x) { ctx.toast("파일을 읽거나 저장하지 못함"); }
      };
    },
  };

  // ----- 설정이 없을 때: 저장 기능 없이 동작 -----
  if (!CFG || !window.firebase) {
    const caps = { downloads, sample: makeSample() };
    window.claude = { use: async n => caps[n] || null };
    onReady(() => { const m = document.querySelector(".main"); if (m) { const b = document.createElement("div"); b.className = "banner"; b.innerHTML = "이 사이트는 아직 저장소(Firebase) 설정 전임. 저장소 연결 방법은 저장소의 README를 참고함. 지금은 예시 화면만 볼 수 있음"; m.prepend(b); } });
    return;
  }

  // ----- Firebase 연결 -----
  firebase.initializeApp(CFG);
  const auth = firebase.auth(), fs = firebase.firestore();
  const ERR = e => { const c = (e && e.code) || ""; return { code: c === "permission-denied" ? "invalid_argument" : c === "resource-exhausted" ? "resource_exhausted" : c === "unavailable" ? "unavailable" : c === "invalid-argument" ? "invalid_argument" : "unavailable", message: String((e && e.message) || "") }; };
  const wrapDoc = r => ({
    id: r.id, path: r.path,
    get: () => r.get().catch(e => { throw ERR(e); }),
    set: d => r.set(d).catch(e => { throw ERR(e); }),
    update: d => r.set(d, { merge: true }).catch(e => { throw ERR(e); }),
    delete: () => r.delete().catch(e => { throw ERR(e); }),
    onSnapshot: (next, err) => r.onSnapshot(next, e => err && err(ERR(e))),
    collection: p => wrapCol(r.collection(p)),
  });
  const wrapCol = c => ({
    path: c.path,
    doc: id => wrapDoc(id ? c.doc(id) : c.doc()),
    add: d => c.add(d).then(wrapDoc).catch(e => { throw ERR(e); }),
    get: () => c.get().catch(e => { throw ERR(e); }),
    onSnapshot: (next, err) => c.onSnapshot(next, e => err && err(ERR(e))),
    where: () => { throw new Error("이 배포판은 where를 쓰지 않음"); },
  });
  const db = { doc: p => wrapDoc(fs.doc(p)), collection: p => wrapCol(fs.collection(p)) };

  let resolveReady; const ready = new Promise(r => (resolveReady = r));
  let caps = null;

  function showLogin(msg) {
    const o = overlay(`<h2>부산대성 예산실적 관리</h2><p>등록된 구성원만 쓸 수 있음. Google 계정이나 이메일로 로그인함</p>
      <button class="pri" id="bdbGoogle">Google 계정으로 로그인</button>
      <input type="email" id="bdbEmail" placeholder="이메일" autocomplete="username"><input type="password" id="bdbPw" placeholder="비밀번호(6자 이상)" autocomplete="current-password">
      <div style="display:flex;gap:8px"><button id="bdbLogin" style="flex:1">이메일로 로그인</button><button id="bdbSignup" style="flex:1">처음 사용(가입)</button></div>
      <button id="bdbReset">비밀번호 재설정 메일 받기</button>
      <div class="err" id="bdbErr">${esc(msg || "")}</div>`);
    const err = t => { o.querySelector("#bdbErr").textContent = t; };
    const em = () => o.querySelector("#bdbEmail").value.trim(), pw = () => o.querySelector("#bdbPw").value;
    const authErr = e => ({ "auth/invalid-credential": "이메일 또는 비밀번호가 맞지 않음", "auth/wrong-password": "비밀번호가 맞지 않음", "auth/user-not-found": "가입하지 않은 이메일임. '처음 사용'을 누름", "auth/email-already-in-use": "이미 가입한 이메일임. 로그인을 누름", "auth/weak-password": "비밀번호를 6자 이상으로 정함", "auth/invalid-email": "이메일 형식이 맞지 않음", "auth/popup-closed-by-user": "로그인 창을 닫았음", "auth/unauthorized-domain": "이 주소가 Firebase 승인 도메인에 없음. 관리자가 README 3번을 확인함", "auth/operation-not-allowed": "이 로그인 방식이 꺼져 있음. 관리자가 Firebase에서 켬" }[e && e.code] || "로그인하지 못함. 잠시 뒤 다시 시도함");
    o.querySelector("#bdbGoogle").onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e => err(authErr(e)));
    o.querySelector("#bdbLogin").onclick = () => auth.signInWithEmailAndPassword(em(), pw()).catch(e => err(authErr(e)));
    o.querySelector("#bdbSignup").onclick = () => auth.createUserWithEmailAndPassword(em(), pw()).then(c => c.user.sendEmailVerification()).catch(e => err(authErr(e)));
    o.querySelector("#bdbReset").onclick = () => { if (!em()) { err("이메일을 먼저 넣음"); return; } auth.sendPasswordResetEmail(em()).then(() => err("재설정 메일을 보냄. 메일함을 확인함")).catch(e => err(authErr(e))); };
  }
  function showNotice(title, body, withVerify) {
    const o = overlay(`<h2>${esc(title)}</h2><p>${esc(body)}</p>${withVerify ? `<button class="pri" id="bdbRecheck">인증을 마쳤음. 다시 확인</button><button id="bdbResend">인증 메일 다시 보내기</button>` : `<button class="pri" id="bdbRecheck">다시 확인</button>`}<button id="bdbOut">다른 계정으로 로그인</button><div class="err" id="bdbErr"></div>`);
    o.querySelector("#bdbOut").onclick = () => auth.signOut();
    o.querySelector("#bdbRecheck").onclick = () => auth.currentUser && auth.currentUser.reload().then(() => auth.currentUser.getIdToken(true)).then(() => checkUser(auth.currentUser));
    if (withVerify) o.querySelector("#bdbResend").onclick = () => auth.currentUser.sendEmailVerification().then(() => { o.querySelector("#bdbErr").textContent = "인증 메일을 다시 보냄"; }).catch(() => { o.querySelector("#bdbErr").textContent = "잠시 뒤 다시 시도함"; });
  }
  async function checkUser(u) {
    if (!u) { showLogin(); return; }
    const email = (u.email || "").toLowerCase();
    if (!u.emailVerified) { showNotice("이메일 인증 필요", `${email}로 보낸 인증 메일의 링크를 누른 뒤 다시 확인을 누름`, true); return; }
    let mine;
    try { mine = await fs.collection("members").doc(email).get(); } catch (e) { mine = null; }
    if (!mine || !mine.exists) { showNotice("등록되지 않은 계정", `${email}은 아직 구성원으로 등록되지 않았음. 경영기획실(관리자)에 이 이메일 등록을 요청함`); return; }
    const role = mine.data().role || "viewer";
    EXT.me = email;
    fs.collection("members").onSnapshot(qs => { EXT.members = Object.fromEntries(qs.docs.map(d => [d.id, d.data()])); }, () => {});
    const user = {
      id: async () => email, isOwner: async () => role === "admin", canEdit: async () => role === "admin",
      can: async n => n === "data.write" ? (role === "admin" || role === "editor") : false,
      me: async () => ({ id: email, name: mine.data().name || u.displayName || email, avatarUrl: "", color: "#2E5597", email, isOwner: role === "admin", canEdit: role === "admin" }),
      profiles: async ids => Object.fromEntries([].concat(ids).map(i => [i, { id: i, name: (EXT.members[i] && EXT.members[i].name) || String(i || "").split("@")[0], avatarUrl: "", color: "#888", email: i, isMe: i === email, guest: false }])),
      name: async () => mine.data().name || "", search: async () => [],
    };
    caps = { db, user, sample: makeSample(), downloads };
    closeOverlay();
    onReady(() => { const t = document.querySelector(".tools"); if (t && !document.getElementById("bdbUser")) { const s = document.createElement("span"); s.id = "bdbUser"; s.className = "bdb-user"; s.innerHTML = `<span>${esc(mine.data().name || email)} (${esc(role)})</span><button type="button" id="bdbLogout">로그아웃</button>`; t.prepend(s); s.querySelector("#bdbLogout").onclick = () => auth.signOut().then(() => location.reload()); } });
    resolveReady();
  }
  window.claude = { use: async n => { await ready; return (caps && caps[n]) || null; } };
  onReady(() => auth.onAuthStateChanged(u => { if (caps && !u) { location.reload(); return; } if (!caps) checkUser(u); }));
})();
