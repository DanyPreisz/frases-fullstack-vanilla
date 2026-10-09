import { api, setSession, clearSession, getToken } from "./api.js";
const authView = document.querySelector("#auth-view");
const appView = document.querySelector("#app-view");
const authForm = document.querySelector("#auth-form");
const authError = document.querySelector("#auth-error");
const authSubmit = document.querySelector("#auth-submit");
const listEl = document.querySelector("#list");
const randomEl = document.querySelector("#random");
const form = document.querySelector("#quote-form");
const formError = document.querySelector("#form-error");
const likedBtn = document.querySelector("#liked-only");
let mode = "login";
let query = "";
let liked = false;
let timer;
const showError = (el, message) => { el.hidden = !message; el.textContent = message || ""; };

function setMode(next) {
  mode = next;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  authSubmit.textContent = mode === "login" ? "Entrar" : "Crear cuenta";
}
function showRandom(quote) {
  randomEl.hidden = !quote;
  randomEl.innerHTML = "";
  if (!quote) return;
  const text = document.createElement("p");
  text.textContent = quote.text;
  const author = document.createElement("small");
  author.textContent = quote.author || "Anonimo";
  randomEl.append(text, author);
}
async function refresh() {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (liked) params.set("liked", "1");
  const data = await api(`/api/quotes?${params}`);
  listEl.innerHTML = "";
  if (!data.quotes.length) {
    const empty = document.createElement("li");
    empty.textContent = "No hay frases.";
    listEl.append(empty);
    return;
  }
  data.quotes.forEach((quote) => {
    const li = document.createElement("li");
    li.className = "item";
    const text = document.createElement("p");
    text.textContent = quote.text;
    const author = document.createElement("small");
    author.textContent = quote.author || "Anonimo";
    const like = document.createElement("button");
    like.type = "button";
    like.className = `ghost${quote.liked ? " on" : ""}`;
    like.textContent = quote.liked ? "Favorita" : "Marcar";
    like.addEventListener("click", async () => { await api(`/api/quotes/${quote.id}/like`, { method: "POST" }); await refresh(); });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "ghost";
    del.textContent = "Borrar";
    del.addEventListener("click", async () => { await api(`/api/quotes/${quote.id}`, { method: "DELETE" }); await refresh(); });
    li.append(text, author, like, del);
    listEl.append(li);
  });
}
async function boot() {
  if (!getToken()) return;
  try {
    const { user } = await api("/api/auth/me");
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    document.querySelector("#user-name").textContent = user.username;
    await refresh();
  } catch { clearSession(); }
}
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(authError, "");
  const fd = new FormData(authForm);
  try {
    const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", { method: "POST", body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }) });
    setSession(data.token);
    authForm.reset();
    await boot();
  } catch (err) { showError(authError, err.message); }
});
document.querySelector("#logout").addEventListener("click", () => { clearSession(); appView.classList.add("hidden"); authView.classList.remove("hidden"); });
document.querySelector("#search").addEventListener("input", (event) => { clearTimeout(timer); timer = setTimeout(async () => { query = event.target.value.trim(); await refresh(); }, 200); });
likedBtn.addEventListener("click", async () => { liked = !liked; likedBtn.classList.toggle("on", liked); await refresh(); });
document.querySelector("#random-btn").addEventListener("click", async () => { const data = await api("/api/quotes/random"); showRandom(data.quote); });
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(formError, "");
  try {
    await api("/api/quotes", { method: "POST", body: JSON.stringify({ text: document.querySelector("#text").value.trim(), author: document.querySelector("#author").value.trim() }) });
    form.reset();
    await refresh();
  } catch (err) { showError(formError, err.message); }
});
boot();
