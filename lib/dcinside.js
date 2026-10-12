const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://gall.dcinside.com";
const TIMEOUT = 15000;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;
const LIST_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
  Referer: "https://gall.dcinside.com/"
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchRaw(url, headers = LIST_HEADERS) {
  let last;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await axios.get(url, {
        timeout: TIMEOUT,
        responseType: "text",
        headers,
        maxRedirects: 5,
        validateStatus: status => status >= 200 && status < 400
      });
      return response.data;
    } catch (error) {
      last = error;
      if (attempt < RETRY_ATTEMPTS - 1) await sleep(RETRY_DELAY * 2 ** attempt);
    }
  }
  throw last || new Error("DCInside 요청에 실패했습니다.");
}

function galleryListPath(galleryType) {
  if (galleryType === "minor") return "/mgallery/board/lists/";
  if (galleryType === "mini") return "/mini/board/lists/";
  return "/board/lists/";
}

function parseListDate(raw, referenceDate = new Date()) {
  const value = String(raw || "").replace(/\s+/g, " ").trim();
  if (!value) return null;

  const now = new Date(referenceDate);
  const kstYear = now.getUTCFullYear();
  const kstMonth = now.getUTCMonth() + 1;
  const kstDay = now.getUTCDate();

  // DC 목록은 오늘 글을 HH:MM, 이전 글을 MM.DD 또는 YYYY.MM.DD로 표시할 수 있습니다.
  let m = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    return `${kstYear}-${String(kstMonth).padStart(2, "0")}-${String(kstDay).padStart(2, "0")}T${m[1].padStart(2, "0")}:${m[2]}:${m[3] || "00"}+09:00`;
  }

  m = value.match(/^(\d{1,2})\.(\d{1,2})$/);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    let year = kstYear;
    // 현재 월보다 큰 월이면 작년 날짜로 보는 것이 자연스럽습니다.
    if (month > kstMonth) year -= 1;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00+09:00`;
  }

  m = value.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}T${String(m[4] || 12).padStart(2, "0")}:${m[5] || "00"}:${m[6] || "00"}+09:00`;
  }

  return null;
}

async function getPostList({ page, galleryId, boardType = "all", galleryType = "minor" } = {}) {
  if (!galleryId || !Number.isInteger(Number(page)) || Number(page) <= 0) return [];

  const params = new URLSearchParams({ id: galleryId, page: String(Number(page)) });
  if (boardType === "recommend") params.set("recommend", "1");
  const url = `${BASE_URL}${galleryListPath(galleryType)}?${params.toString()}`;

  const diagnostics = {
    page: Number(page), url, htmlLength: 0, rowsFound: 0, rowsAfterNoticeFilter: 0,
    titleFound: 0, linkFound: 0, numberFound: 0, dateFound: 0, dateParsed: 0,
    samples: [], responseTitle: "", responseSnippet: ""
  };

  try {
    const html = await fetchRaw(url);
    diagnostics.htmlLength = html.length;
    const $ = cheerio.load(html);
    diagnostics.responseTitle = $("title").first().text().replace(/\s+/g, " ").trim();
    diagnostics.responseSnippet = String(html).replace(/\s+/g, " ").slice(0, 500);

    const rows = $("table.gall_list tr.ub-content");
    diagnostics.rowsFound = rows.length;
    const posts = [];

    rows.each((_, el) => {
      const $el = $(el);
      const rowType = String($el.attr("data-type") || "").trim();
      const numberText = $el.find(".gall_num").text().replace(/\s+/g, " ").trim();
      const subject = $el.find(".gall_subject").text().replace(/\s+/g, " ").trim();
      const linkEl = $el.find('.gall_tit a[href*="/board/view/"]').first();
      const href = linkEl.attr("href") || "";

      if (!href || ["공지", "설문", "AD"].includes(numberText) || ["공지", "설문", "AD"].includes(subject) || ["icon_notice", "icon_survey", "icon_ad"].includes(rowType)) return;
      diagnostics.rowsAfterNoticeFilter++;

      const noFromData = String($el.attr("data-no") || "").trim();
      let id = noFromData;
      try {
        const u = new URL(href, BASE_URL);
        id = u.searchParams.get("no") || id;
      } catch (_) {}
      if (!/^\d+$/.test(id)) return;
      diagnostics.linkFound++;
      diagnostics.numberFound++;

      const titleNode = linkEl.clone();
      titleNode.find(".blind, .icon_img, .sp_img, .reply_numbox, .reply_num").remove();
      const title = titleNode.text().replace(/\s+/g, " ").trim();
      if (!title) return;
      diagnostics.titleFound++;

      const rawDate = $el.find(".gall_date").text().replace(/\s+/g, " ").trim();
      if (rawDate) diagnostics.dateFound++;
      const dateValue = parseListDate(rawDate);
      if (dateValue) diagnostics.dateParsed++;

      const absoluteHref = new URL(href, BASE_URL).href;
      const dateDisplay = dateValue ? new Date(dateValue).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false
      }).replace(/\. /g, ".") : rawDate;

      if (diagnostics.samples.length < 10) diagnostics.samples.push({ id, subject, title, rawDate, dateValue, href: absoluteHref });
      posts.push({ id, subject, title, link: absoluteHref, dateValue, dateDisplay });
    });

    posts.diagnostics = diagnostics;
    return posts;
  } catch (error) {
    diagnostics.error = error?.message || String(error);
    console.error(`갤러리 ${page}페이지 수집 오류: ${diagnostics.error}`);
    const posts = [];
    posts.diagnostics = diagnostics;
    return posts;
  }
}

module.exports = { getPostList, fetchRaw, sleep, LIST_HEADERS };
