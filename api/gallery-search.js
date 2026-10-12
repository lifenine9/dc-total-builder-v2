const dc = require("../lib/dcinside");

function parseResponse(text) {
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
  const id = pick(["id", "gall_id", "gallery_id", "gallid", "galleryId", "value", "code", "url_id", "urlId", "name"]);
  if (!id) return null;
  const name = pick(["ko_name", "name_ko", "title", "gall_name", "gallery_name", "display_name", "displayName", "text", "keyword", "nickname", "name"]) || id;
  const rawType = pick(["gall_type", "gallery_type", "type", "gallType", "galleryType"]).toUpperCase();
  let type = "major";
  if (["M", "MINOR", "MGALLERY"].includes(rawType) || item.is_minor === true || item.isMinor === true) type = "minor";
  if (["MI", "MINI", "MINIGALLERY"].includes(rawType) || item.is_mini === true || item.isMini === true) type = "mini";
  const suffix = type === "minor" ? " 마이너 갤러리" : type === "mini" ? " 미니 갤러리" : " 갤러리";
  return { id, type, name: /갤러리$/.test(name) ? name : name + suffix };
}
function collectCandidates(data) {
  const out = [], seenNodes = new WeakSet();
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
  return out.filter(item => { const key = `${item.type}:${item.id}`; if (seen.has(key)) return false; seen.add(key); return true; });
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ success: false, error: "허용되지 않는 요청입니다." });
  }
  try {
    const keyword = String(req.query?.q || "").trim();
    if (!keyword) return res.status(200).json({ success: true, results: [] });
    const callback = `__dcAuto_${Date.now()}`;
    const url = `https://search.dcinside.com/autocomplete?callback=${encodeURIComponent(callback)}&k=${encodeURIComponent(keyword)}`;
    const text = await dc.fetchRaw(url, dc.LIST_HEADERS);
    return res.status(200).json({ success: true, results: collectCandidates(parseResponse(text)) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error?.message || "갤러리 검색에 실패했습니다." });
  }
};
