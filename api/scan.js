const { scanChunk } = require("../lib/scanner");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "허용되지 않는 요청입니다." });
  }
  try {
    const result = await scanChunk(req.body || {});
    return res.status(200).json(result);
  } catch (error) {
    return res.status(400).json({ success: false, error: error?.message || "게시글 수집 중 오류가 발생했습니다." });
  }
};
