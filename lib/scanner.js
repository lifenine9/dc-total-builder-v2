const dc = require("./dcinside");

function normalizeHead(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("ko-KR");
}
const IGNORED_BRACKET_GROUPS = new Set(["지각", "각개"]);
const EXCLUDED_BRACKET_GROUPS = new Set(["질문"]);
function extractBracketGroups(title) {
  return [...String(title || "").matchAll(/\[([^\]]*)\]/g)].map(m => String(m[1]).trim()).filter(Boolean);
}
function normalizeCustomCondition(value, trim, ignoreEnglishCase) {
  let normalized = String(value ?? "");
  if (trim) normalized = normalized.trim();
  if (ignoreEnglishCase) normalized = normalized.toLocaleLowerCase("en-US");
  return normalized;
}
function classifyTitle(title) {
  const groups = extractBracketGroups(title);
  const normalized = groups.map(original => ({ original, key: original.toLocaleLowerCase("ko-KR") }));
  if (normalized.some(group => EXCLUDED_BRACKET_GROUPS.has(group.key))) return { excluded: true, groups: [], reason: "question" };
  const meaningful = normalized.filter(group => !IGNORED_BRACKET_GROUPS.has(group.key));
  return { excluded: false, groups: meaningful.map(group => group.original), ignoredCount: normalized.length - meaningful.length };
}
function viewUrl(id, type, no) {
  const pathName = type === "minor" ? "mgallery/board/view" : type === "mini" ? "mini/board/view" : "board/view";
  return `https://gall.dcinside.com/${pathName}/?id=${encodeURIComponent(id)}&no=${encodeURIComponent(no)}`;
}
function startOfDay(date) { return new Date(`${date}T00:00:00+09:00`); }
function sameDayEnd(date) { return new Date(`${date}T23:59:59.999+09:00`); }
function makeDiagnostics() {
  return {
    pagesRequested: 0, pagesWithRows: 0, rowsFound: 0, rowsAfterNoticeFilter: 0,
    titleFound: 0, linkFound: 0, numberFound: 0, dateFound: 0, dateParsed: 0,
    noDate: 0, newerThanEnd: 0, olderThanStart: 0, outOfRange: 0, headFiltered: 0,
    noBracket: 0, bracketQuestionExcluded: 0, bracketIgnored: 0, bracketMulti: 0,
    customConditionFiltered: 0, extraPagesChecked: 0, firstOlderPage: null,
    stopReason: "", pageTrace: [], samples: []
  };
}
function addDiagnostics(target, source = {}) {
  const arrayFields = new Set(["pageTrace", "samples", "stopReason", "firstOlderPage"]);
  for (const [key, value] of Object.entries(source)) {
    if (!(key in target)) continue;
    if (arrayFields.has(key)) continue;
    if (typeof target[key] === "number") target[key] += Number(value || 0);
  }
  if (Array.isArray(source.pageTrace)) target.pageTrace = [...target.pageTrace, ...source.pageTrace].slice(-100);
  if (Array.isArray(source.samples)) target.samples = [...target.samples, ...source.samples].slice(0, 10);
}

/**
 * Process one serverless-safe batch. Results are returned as raw group/post rows;
 * the browser keeps them in memory and only renders them when done === true.
 */
async function scanChunk(body = {}) {
  const galleryId = String(body.galleryId || "").trim();
  const galleryType = String(body.galleryType || "major");
  const startDate = String(body.startDate || "");
  const endDate = String(body.endDate || "");
  const headMode = String(body.headMode || "all");
  const customHeads = Array.isArray(body.customHeads) ? body.customHeads.map(normalizeHead).filter(Boolean) : [];
  const collectMode = body.collectMode === "custom" ? "custom" : "default";
  const customConditionsRaw = Array.isArray(body.customConditions) ? body.customConditions.map(v => String(v ?? "")) : [String(body.customCondition ?? "")];
  const trimCondition = body.trimCondition !== false;
  const ignoreEnglishCase = body.ignoreEnglishCase !== false;
  const customConditions = [];
  const seenConditions = new Set();
  for (const original of customConditionsRaw) {
    const normalized = normalizeCustomCondition(original, trimCondition, ignoreEnglishCase);
    if (!normalized || seenConditions.has(normalized)) continue;
    seenConditions.add(normalized);
    customConditions.push({ original, display: trimCondition ? original.trim() : original, normalized });
  }

  if (collectMode === "custom" && !customConditions.length) throw new Error("직접 수집할 조건을 하나 이상 입력해 주세요.");
  if (!galleryId || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new Error("갤러리와 날짜를 확인해 주세요.");
  const from = startOfDay(startDate), to = sameDayEnd(endDate);
  if (from > to) throw new Error("시작일이 종료일보다 늦습니다.");

  const incoming = body.state && typeof body.state === "object" ? body.state : {};
  let page = Math.max(1, Number(incoming.page || 1));
  let checked = Number(incoming.checked || 0);
  let matched = Number(incoming.matched || 0);
  let emptyPages = Number(incoming.emptyPages || 0);
  let stalePagesRemaining = incoming.stalePagesRemaining === null || incoming.stalePagesRemaining === undefined ? null : Number(incoming.stalePagesRemaining);
  let firstOlderPage = incoming.firstOlderPage ?? null;
  const diagnostics = makeDiagnostics();
  if (incoming.diagnostics) {
    Object.assign(diagnostics, incoming.diagnostics);
    diagnostics.pageTrace = Array.isArray(incoming.diagnostics.pageTrace) ? incoming.diagnostics.pageTrace.slice(-100) : [];
    diagnostics.samples = Array.isArray(incoming.diagnostics.samples) ? incoming.diagnostics.samples.slice(0, 10) : [];
  }
  const items = [];
  const EXTRA_PAGES_AFTER_OLDER = 3;
  const MIN_PAGES_PER_CHUNK = 50;
  const MAX_CHUNK_MS = 235000;
  const chunkStarted = Date.now();
  let processed = 0;
  let done = false;
  let stopReason = "";
  let lastPage = page - 1;

  while (page <= 20000) {
    diagnostics.pageTrace.push(page);
    if (diagnostics.pageTrace.length > 100) diagnostics.pageTrace.shift();
    const posts = await dc.getPostList({ galleryId, galleryType, page, boardType: "all" });
    processed++;
    lastPage = page;
    diagnostics.pagesRequested++;
    const pd = posts.diagnostics || {};
    for (const key of ["rowsFound", "rowsAfterNoticeFilter", "titleFound", "linkFound", "numberFound", "dateFound", "dateParsed"]) diagnostics[key] += Number(pd[key] || 0);
    if (Number(pd.rowsFound || 0) > 0) diagnostics.pagesWithRows++;
    if (diagnostics.samples.length < 10 && Array.isArray(pd.samples)) diagnostics.samples.push(...pd.samples.slice(0, 10 - diagnostics.samples.length));

    if (!posts.length) {
      emptyPages++;
      if (emptyPages >= 2) {
        stopReason = "빈 페이지 2회 연속";
        done = true;
        break;
      }
      page++;
      if (processed >= MIN_PAGES_PER_CHUNK || Date.now() - chunkStarted >= MAX_CHUNK_MS) break;
      await dc.sleep(250);
      continue;
    }
    emptyPages = 0;
    let foundOlderThisPage = false, foundNewerThanEndThisPage = false, foundInRangeThisPage = false;

    for (const post of posts) {
      checked++;
      const when = post.dateValue ? new Date(post.dateValue) : null;
      if (!when || Number.isNaN(when.getTime())) { diagnostics.noDate++; continue; }
      if (when > to) { diagnostics.newerThanEnd++; foundNewerThanEndThisPage = true; continue; }
      if (when < from) { diagnostics.olderThanStart++; foundOlderThisPage = true; continue; }
      foundInRangeThisPage = true;

      const head = normalizeHead(post.subject);
      if (collectMode !== "custom" && headMode === "taga" && head !== "타갤") { diagnostics.headFiltered++; continue; }
      if (collectMode !== "custom" && headMode === "custom" && !customHeads.includes(head)) { diagnostics.headFiltered++; continue; }

      let targetGroups;
      if (collectMode === "custom") {
        const titleForMatch = ignoreEnglishCase ? String(post.title || "").toLocaleLowerCase("en-US") : String(post.title || "");
        const matchedConditions = customConditions.filter(condition => titleForMatch.includes(condition.normalized));
        if (!matchedConditions.length) { diagnostics.customConditionFiltered++; continue; }
        targetGroups = matchedConditions.length === 1 ? [matchedConditions[0].display] : ["기타"];
      } else {
        const classification = classifyTitle(post.title);
        if (classification.excluded) { diagnostics.bracketQuestionExcluded++; continue; }
        diagnostics.bracketIgnored += Number(classification.ignoredCount || 0);
        const names = classification.groups;
        if (!names.length) { diagnostics.noBracket++; continue; }
        targetGroups = names.length > 1 ? ["기타"] : names;
        if (names.length > 1) diagnostics.bracketMulti++;
      }
      for (const group of targetGroups) {
        items.push({ group, post: {
          id: post.id, title: post.title, link: viewUrl(galleryId, galleryType, post.id),
          date: post.dateDisplay, dateValue: post.dateValue, head: post.subject || ""
        }});
        matched++;
      }
    }
    diagnostics.outOfRange = diagnostics.newerThanEnd + diagnostics.olderThanStart;
    const staleOnlyPage = foundOlderThisPage && !foundNewerThanEndThisPage && !foundInRangeThisPage;
    if (foundOlderThisPage && firstOlderPage === null) {
      firstOlderPage = page;
      diagnostics.firstOlderPage = page;
      stalePagesRemaining = EXTRA_PAGES_AFTER_OLDER;
    }
    if (stalePagesRemaining !== null) {
      if (staleOnlyPage) { stalePagesRemaining--; diagnostics.extraPagesChecked++; }
      else stalePagesRemaining = EXTRA_PAGES_AFTER_OLDER;
    }
    if (stalePagesRemaining !== null && stalePagesRemaining <= 0) {
      stopReason = `시작일 이전 글만 있는 페이지 ${EXTRA_PAGES_AFTER_OLDER}회 연속`;
      done = true;
      break;
    }
    page++;
    if (processed >= MIN_PAGES_PER_CHUNK || Date.now() - chunkStarted >= MAX_CHUNK_MS) break;
    await dc.sleep(250);
  }

  if (!done && page > 20000) { done = true; stopReason = "최대 20,000페이지 도달"; }
  if (done) diagnostics.stopReason = stopReason;
  const state = { page: done ? lastPage + 1 : page, checked, matched, emptyPages, stalePagesRemaining, firstOlderPage, diagnostics };
  return {
    success: true, done, nextPage: state.page, processedPages: processed,
    page: lastPage, checked, matched, groupCount: new Set(items.map(item => item.group)).size,
    items, state, stopReason,
    message: done ? `수집 종료: ${stopReason}` : `${lastPage}페이지까지 확인 완료 · 다음 ${state.page}페이지부터 이어서 확인합니다.`
  };
}

module.exports = { scanChunk };
