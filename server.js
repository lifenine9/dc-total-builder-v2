const http = require("http");
const fs = require("fs");
const path = require("path");
const dc = require("./lib/dcinside");
const { scanChunk } = require("./lib/scanner");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("요청 데이터가 너무 큽니다."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error("JSON 형식이 올바르지 않습니다.")); }
    });
    req.on("error", reject);
  });
}

function parseGallerySearchResponse(text) {
  const match = String(text).match(/^\s*[^\(]+\((.*)\)\s*;?\s*$/s);
  if (!match) throw new Error("갤러리 검색 응답 형식을 확인할 수 없습니다.");
  return JSON.parse(match[1]);
}

function normalizeGallery(item) {
  if (!item || typeof item !== "object") return null;
  const pick = names => {
    for (const name of names) {
      const value = item[name];
      if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
    return "";
  };
  const id = pick(["id","gall_id","gallery_id","gallid","galleryId","value","code","url_id","urlId","name"]);
  if (!id) return null;
  const name = pick(["ko_name","name_ko","title","gall_name","gallery_name","display_name","displayName","text","keyword","nickname","name"]) || id;
  const rawType = pick(["gall_type","gallery_type","type","gallType","galleryType"]).toUpperCase();
  let type = "major";
  if (["M","MINOR","MGALLERY"].includes(rawType) || item.is_minor === true || item.isMinor === true) type = "minor";
  if (["MI","MINI","MINIGALLERY"].includes(rawType) || item.is_mini === true || item.isMini === true) type = "mini";
  const suffix = type === "minor" ? " 마이너 갤러리" : type === "mini" ? " 미니 갤러리" : " 갤러리";
  return { id, type, name: /갤러리$/.test(name) ? name : name + suffix };
}

function collectCandidates(data) {
  const out = [];
  const seenNodes = new WeakSet();
  function walk(value, depth = 0) {
    if (!value || depth > 8) return;
    if (Array.isArray(value)) return value.forEach(v => walk(v, depth + 1));
    if (typeof value !== "object" || seenNodes.has(value)) return;
    seenNodes.add(value);
    const normalized = normalizeGallery(value);
    if (normalized) out.push(normalized);
    Object.values(value).forEach(v => walk(v, depth + 1));
  }
  walk(data);
  const seen = new Set();
  return out.filter(item => {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function gallerySearch(keyword) {
  const callback = `__dcAuto_${Date.now()}`;
  const url = `https://search.dcinside.com/autocomplete?callback=${encodeURIComponent(callback)}&k=${encodeURIComponent(keyword)}`;
  const text = await dc.fetchRaw(url, dc.LIST_HEADERS);
  return collectCandidates(parseGallerySearchResponse(text));
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === "/" ? path.join(PUBLIC, "index.html") : path.join(PUBLIC, pathname.replace(/^\//, ""));
  if (!filePath.startsWith(PUBLIC)) return sendJson(res, 403, { error: "Forbidden" });
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return sendJson(res, 404, { error: "Not found" });
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/api/gallery-search") {
      const keyword = String(url.searchParams.get("q") || "").trim();
      if (!keyword) return sendJson(res, 200, { success: true, results: [] });
      const results = await gallerySearch(keyword);
      return sendJson(res, 200, { success: true, results });
    }
    if (req.method === "POST" && url.pathname === "/api/scan") {
      const body = await readBody(req);
      try {
        const result = await scanChunk(body);
        return sendJson(res, 200, result);
      } catch (error) {
        return sendJson(res, 400, { success: false, error: error?.message || "게시글 수집 중 오류가 발생했습니다." });
      }
    }
    if (req.method === "GET") return serveStatic(req, res, url.pathname);
    return sendJson(res, 405, { success: false, error: "허용되지 않는 요청입니다." });
  } catch (error) {
    if (!res.headersSent) sendJson(res, 500, { success: false, error: error?.message || "서버 오류" });
    else if (!res.writableEnded) res.end();
  }
});

server.listen(PORT, () => console.log(`총공 수집기: http://localhost:${PORT}`));
