import { URL } from "node:url";
import { connect, isReady, users, quotes, toId, mapQuote } from "./db.js";
import { createApp, readJson, sendEmpty, sendJson, serveStatic } from "./http.js";
import { getUserFromRequest, hashPassword, signToken, verifyPassword } from "./middleware/auth.js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
function usernameQuery(username) { return new RegExp("^" + username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i"); }
function requireUser(req, res) { const user = getUserFromRequest(req); if (!user) { sendJson(res, 401, { error: "No autenticado" }); return null; } return user; }

const server = createApp(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname, searchParams } = url;
  const method = req.method || "GET";
  if (pathname === "/health") return sendJson(res, 200, { ok: true, db: isReady() });
  if (pathname.startsWith("/api/") && !isReady()) return sendJson(res, 503, { error: "Base no lista" });
  if (!pathname.startsWith("/api/")) return serveStatic(req, res);

  if (method === "POST" && pathname === "/api/auth/register") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!USERNAME_RE.test(username)) return sendJson(res, 400, { error: "Usuario: 3-20 caracteres, letras, numeros y _" });
    if (password.length < 6) return sendJson(res, 400, { error: "La contrasena debe tener al menos 6 caracteres" });
    if (await users().findOne({ username: usernameQuery(username) })) return sendJson(res, 409, { error: "Ese usuario ya existe" });
    const result = await users().insertOne({ username, passwordHash: hashPassword(password), createdAt: new Date() });
    const user = { id: String(result.insertedId), username };
    return sendJson(res, 201, { user, token: signToken(user) });
  }
  if (method === "POST" && pathname === "/api/auth/login") {
    const body = await readJson(req);
    const username = String(body.username || "").trim();
    const row = await users().findOne({ username: usernameQuery(username) });
    if (!row || !verifyPassword(String(body.password || ""), row.passwordHash)) return sendJson(res, 401, { error: "Usuario o contrasena incorrectos" });
    const user = { id: String(row._id), username: row.username };
    return sendJson(res, 200, { user, token: signToken(user) });
  }
  if (method === "GET" && pathname === "/api/auth/me") {
    const user = requireUser(req, res);
    if (!user) return;
    const row = await users().findOne({ _id: toId(user.id) });
    if (!row) return sendJson(res, 401, { error: "Usuario no encontrado" });
    return sendJson(res, 200, { user: { id: String(row._id), username: row.username } });
  }

  const user = requireUser(req, res);
  if (!user) return;
  const userId = user.id;

  if (method === "GET" && pathname === "/api/quotes/random") {
    const rows = await quotes().aggregate([{ $match: { userId } }, { $sample: { size: 1 } }]).toArray();
    return sendJson(res, 200, { quote: rows[0] ? mapQuote(rows[0]) : null });
  }
  if (method === "GET" && pathname === "/api/quotes") {
    const q = String(searchParams.get("q") || "").trim();
    const liked = searchParams.get("liked") === "1";
    const query = { userId };
    if (liked) query.liked = true;
    if (q) {
      const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      query.$or = [{ text: rx }, { author: rx }];
    }
    const rows = await quotes().find(query).sort({ createdAt: -1 }).limit(200).toArray();
    return sendJson(res, 200, { quotes: rows.map(mapQuote) });
  }
  if (method === "POST" && pathname === "/api/quotes") {
    const body = await readJson(req);
    const text = String(body.text || "").trim();
    if (!text) return sendJson(res, 400, { error: "La frase es obligatoria" });
    const result = await quotes().insertOne({ userId, text: text.slice(0, 280), author: String(body.author || "").slice(0, 60), liked: false, createdAt: new Date() });
    return sendJson(res, 201, { quote: mapQuote(await quotes().findOne({ _id: result.insertedId })) });
  }
  const match = pathname.match(/^\/api\/quotes\/([a-fA-F0-9]{24})(?:\/like)?$/);
  if (match) {
    const id = toId(match[1]);
    const quote = await quotes().findOne({ _id: id, userId });
    if (!quote) return sendJson(res, 404, { error: "Frase no encontrada" });
    if (method === "POST" && pathname.endsWith("/like")) {
      await quotes().updateOne({ _id: id, userId }, { $set: { liked: !quote.liked } });
      return sendJson(res, 200, { quote: mapQuote(await quotes().findOne({ _id: id })) });
    }
    if (method === "DELETE") {
      await quotes().deleteOne({ _id: id, userId });
      return sendEmpty(res, 204);
    }
  }
  sendJson(res, 404, { error: "Ruta no encontrada" });
});

server.listen(PORT, HOST, () => console.log(`Frases en http://${HOST}:${PORT}`));
async function bootDb() { for (;;) { try { await connect(); return; } catch (err) { console.error("Mongo no disponible:", err.message); await new Promise((resolve) => setTimeout(resolve, 5000)); } } }
bootDb();
