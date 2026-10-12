const $ = id => document.getElementById(id);
const galleryInput = $("galleryInput"), galleryClear = $("galleryClear"), suggestions = $("suggestions"), selectedGallery = $("selectedGallery");
const startDate = $("startDate"), endDate = $("endDate"), headMode = $("headMode"), customHeads = $("customHeads"), scanButton = $("scanButton");
const progress = $("progress"), progressTitle = $("progressTitle"), progressText = $("progressText"), progressPage = $("progressPage"), errorBox = $("error");
const result = $("result"), resultTitle = $("resultTitle"), summary = $("summary"), groupFilter = $("groupFilter"), groupsEl = $("groups");
const defaultModeButton = $("defaultModeButton"), customModeButton = $("customModeButton");
const customConditionPanel = $("customConditionPanel"), conditionList = $("conditionList"), addConditionButton = $("addConditionButton");
const modeDescription = $("modeDescription"), trimOption = $("trimOption"), caseOption = $("caseOption");
const brandTitle = $("brandTitle"), brandDescription = $("brandDescription"), headFilterPanel = $("headFilterPanel");
let selected = null, searchTimer = null, currentGroups = [], activeFilter = "all";
let collectMode = "default", trimCondition = true, ignoreEnglishCase = true;

const today = new Date();
const iso = d => { const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${day}`; };
endDate.value = iso(today);
const prior = new Date(today); prior.setDate(prior.getDate()-7); startDate.value = iso(prior);

function typeName(type){ return type === "minor" ? "마이너" : type === "mini" ? "미니" : "일반"; }
function getConditionInputs(){ return [...conditionList.querySelectorAll(".custom-condition")]; }
function getConditions(){
  return getConditionInputs().map(input=>input.value).filter(value=>trimCondition ? value.trim().length>0 : value.length>0);
}
function refreshConditionRows(){
  const rows=[...conditionList.querySelectorAll(".condition-row")];
  rows.forEach((row,index)=>{
    row.querySelector(".condition-number").textContent=`조건 ${index+1}`;
    row.querySelector(".remove-condition").disabled=rows.length===1;
    row.querySelector(".remove-condition").setAttribute("aria-label",`조건 ${index+1} 삭제`);
  });
}
function updateReady(){
  const conditionReady = collectMode !== "custom" || getConditions().length > 0;
  scanButton.disabled = !selected || !startDate.value || !endDate.value || !conditionReady;
  galleryClear.classList.toggle("hidden", !galleryInput.value);
}
function setCollectMode(mode){
  collectMode = mode;
  const isCustom = mode === "custom";
  defaultModeButton.classList.toggle("active", !isCustom);
  customModeButton.classList.toggle("active", isCustom);
  defaultModeButton.setAttribute("aria-pressed", String(!isCustom));
  customModeButton.setAttribute("aria-pressed", String(isCustom));
  customConditionPanel.classList.toggle("hidden", !isCustom);
  headFilterPanel.classList.toggle("hidden", isCustom);
  brandTitle.textContent = isCustom ? "디시 글 종합기" : "총공 글 종합기";
  brandDescription.textContent = isCustom
    ? "갤러리와 기간을 지정하고, 입력한 조건에 따라 디시 게시글을 종합합니다."
    : "기간과 갤러리를 지정해 총공 게시글을 종합합니다.";
  document.title = brandTitle.textContent;
  modeDescription.textContent = isCustom
    ? "제목 전체에서 입력한 여러 조건을 찾습니다.  조건 하나에만 해당하면 해당 조건에, 여러 조건이 겹치면 기타에 모읍니다."
    : "제목의 대괄호 안에 있는 내용을 기준으로 자동 분류합니다.";
  scanButton.textContent = isCustom ? "사용자 설정 종합 시작" : "총공 종합 시작";
  updateReady();
}
function toggleOption(button, currentValue, setter){
  const next = !currentValue;
  setter(next);
  button.classList.toggle("active", next);
  button.setAttribute("aria-pressed", String(next));
  updateReady();
}
function showMessage(text){ suggestions.innerHTML = `<div class="note">${text}</div>`; suggestions.classList.remove("hidden"); }
function renderSuggestions(items){
  suggestions.innerHTML = "";
  if(!items.length) return showMessage("검색 결과가 없습니다.");
  for(const item of items){
    const b=document.createElement("button"); b.className="suggestion"; b.type="button";
    const n=document.createElement("span"); n.className="suggestion-name"; n.textContent=item.name;
    const t=document.createElement("span"); t.className="suggestion-type"; t.textContent=typeName(item.type);
    b.append(n,t); b.onclick=()=>chooseGallery(item); suggestions.appendChild(b);
  }
  suggestions.classList.remove("hidden");
}
function chooseGallery(item){ selected=item; galleryInput.value=item.name; selectedGallery.textContent=`선택됨 · ${item.name} (${item.id})`; selectedGallery.classList.remove("hidden"); suggestions.classList.add("hidden"); updateReady(); }
function clearGallery(){ selected=null; galleryInput.value=""; selectedGallery.classList.add("hidden"); suggestions.classList.add("hidden"); updateReady(); }
galleryClear.onclick=clearGallery;
galleryInput.addEventListener("input",()=>{
  selected=null; selectedGallery.classList.add("hidden"); updateReady();
  const q=galleryInput.value.trim(); clearTimeout(searchTimer); if(!q){ suggestions.classList.add("hidden"); return; }
  showMessage("검색 중...");
  searchTimer=setTimeout(async()=>{
    try{ const r=await fetch(`/api/gallery-search?q=${encodeURIComponent(q)}`); const data=await r.json(); renderSuggestions(data.results||[]); }
    catch{ showMessage("갤러리 검색에 실패했습니다."); }
  },350);
});
document.addEventListener("click",e=>{ if(!e.target.closest(".search-wrap")) suggestions.classList.add("hidden"); });
headMode.onchange=()=>customHeads.classList.toggle("hidden",headMode.value!=="custom");
defaultModeButton.onclick=()=>setCollectMode("default");
customModeButton.onclick=()=>setCollectMode("custom");
conditionList.addEventListener("input", updateReady);
conditionList.addEventListener("click",e=>{
  const remove=e.target.closest(".remove-condition");
  if(!remove || conditionList.querySelectorAll(".condition-row").length<=1) return;
  remove.closest(".condition-row").remove(); refreshConditionRows(); updateReady();
});
addConditionButton.onclick=()=>{
  const row=document.createElement("div"); row.className="condition-row";
  const number=document.createElement("span"); number.className="condition-number";
  const input=document.createElement("input"); input.className="custom-condition"; input.type="text"; input.maxLength=120; input.placeholder="조건을 입력하세요"; input.autocomplete="off";
  const remove=document.createElement("button"); remove.className="remove-condition"; remove.type="button"; remove.textContent="×"; remove.setAttribute("aria-label","조건 삭제");
  row.append(number,input,remove); conditionList.appendChild(row); refreshConditionRows(); input.focus(); updateReady();
};
trimOption.onclick=()=>toggleOption(trimOption, trimCondition, value=>{ trimCondition=value; });
caseOption.onclick=()=>toggleOption(caseOption, ignoreEnglishCase, value=>{ ignoreEnglishCase=value; });
[startDate,endDate].forEach(el=>el.addEventListener("change",updateReady));

function showError(message){ errorBox.textContent=message; errorBox.classList.remove("hidden"); }
function clearError(){ errorBox.classList.add("hidden"); errorBox.textContent=""; }
function escapeHtml(s){ const d=document.createElement("div"); d.textContent=s; return d.innerHTML; }

function updateProgress(msg){
  const pageText = msg.page ? `${msg.page}p` : "";
  progressPage.textContent = pageText;
  progressTitle.textContent = selected ? `${selected.name} 수집 중` : "총공 게시글 수집 중";
  progressText.textContent = msg.message || "게시글을 확인하고 있습니다...";
}

async function scan(){
  clearError(); result.classList.add("hidden"); progress.classList.remove("hidden");
  if(collectMode === "custom" && getConditions().length===0){
    showError("직접 수집할 조건을 하나 이상 입력해 주세요.");
    progress.classList.add("hidden"); updateReady(); return;
  }
  progressTitle.textContent = `${selected.name} 수집 준비 중`;
  progressText.textContent = `${startDate.value} ~ ${endDate.value} 범위의 게시글을 확인합니다.`;
  progressPage.textContent = "";
  scanButton.disabled=true; scanButton.textContent="수집 중..."; groupsEl.innerHTML=""; groupFilter.innerHTML=""; groupFilter.classList.add("hidden");
  const heads=headMode.value==="custom" ? customHeads.value.split(",").map(v=>v.trim()).filter(Boolean) : [];
  const payload={
    galleryId:selected.id,galleryType:selected.type,startDate:startDate.value,endDate:endDate.value,
    headMode:collectMode === "custom" ? "all" : headMode.value,customHeads:collectMode === "custom" ? [] : heads,
    collectMode,customConditions:getConditions(),trimCondition,ignoreEnglishCase
  };
  let state=null, allItems=[], final=null, totalPages=0, requestCount=0;
  try{
    // Each request scans a batch of pages. Keep accumulating in memory and show no partial result.
    // The next request resumes from the exact page/counters returned by the previous request.
    while(true){
      requestCount++;
      const response=await fetch("/api/scan",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...payload,state})
      });
      const data=await response.json();
      if(!response.ok || !data.success) throw new Error(data.error||"검사를 진행하지 못했습니다.");
      allItems.push(...(data.items||[]));
      totalPages += Number(data.processedPages||0);
      state=data.state;
      updateProgress({
        page:data.page,
        message:data.done
          ? `전체 ${totalPages.toLocaleString("ko-KR")}페이지 확인 완료 · 결과를 정리하고 있습니다.`
          : `${data.message} (누적 ${totalPages.toLocaleString("ko-KR")}페이지 · ${requestCount}회차)`
      });
      if(data.done){ final=data; break; }
    }
    const grouped=new Map();
    for(const item of allItems){
      if(!grouped.has(item.group)) grouped.set(item.group,[]);
      grouped.get(item.group).push(item.post);
    }
    let groups=[...grouped.entries()].map(([name,posts])=>({name,posts}));
    groups.forEach(group=>group.posts.sort((a,b)=>new Date(b.dateValue||b.date)-new Date(a.dateValue||a.date)));
    if(collectMode==="custom"){
      const conditions=getConditions().map(v=>trimCondition?v.trim():v);
      const order=new Map(conditions.map((name,index)=>[name.toLocaleLowerCase("ko-KR"),index]));
      groups.sort((a,b)=>{
        if(a.name==="기타") return b.name==="기타"?0:1;
        if(b.name==="기타") return -1;
        return (order.get(a.name.toLocaleLowerCase("ko-KR"))??9999)-(order.get(b.name.toLocaleLowerCase("ko-KR"))??9999);
      });
    }else{
      groups.sort((a,b)=>{
        const ad=a.posts[0]?.dateValue?new Date(a.posts[0].dateValue).getTime():0;
        const bd=b.posts[0]?.dateValue?new Date(b.posts[0].dateValue).getTime():0;
        return bd-ad||a.name.localeCompare(b.name,"ko");
      });
    }
    renderResult({groups,matched:final.matched,groupCount:groups.length,checked:final.checked,diagnostics:final.state?.diagnostics,stopReason:final.stopReason});
  }catch(e){ showError(e.message||"검사 중 오류가 발생했습니다."); }
  finally{
    progress.classList.add("hidden"); scanButton.disabled=false;
    scanButton.textContent=collectMode === "custom" ? "사용자 설정 종합 시작" : "총공 종합 시작";
    updateReady();
  }
}

function buildFilter(groups){
  groupFilter.innerHTML="";
  if(!groups.length){ groupFilter.classList.add("hidden"); return; }
  const label=document.createElement("span");
  label.className="filter-label";
  label.textContent="갤러리 보기";
  groupFilter.appendChild(label);

  const all=document.createElement("button");
  all.type="button"; all.className="filter-chip active"; all.dataset.filter="all";
  all.textContent=`전체 ${groups.reduce((sum,g)=>sum+g.posts.length,0)}개`;
  groupFilter.appendChild(all);

  groups.forEach((group,index)=>{
    const button=document.createElement("button");
    button.type="button";
    button.className="filter-chip";
    button.dataset.filter=String(index);
    button.textContent=`${group.name} ${group.posts.length}개`;
    button.title=group.name;
    groupFilter.appendChild(button);
  });
  groupFilter.classList.remove("hidden");
}

function setFilter(filter){
  activeFilter=filter;
  groupFilter.querySelectorAll(".filter-chip").forEach(button=>button.classList.toggle("active",button.dataset.filter===filter));
  groupsEl.querySelectorAll(".group").forEach((box,index)=>{
    box.classList.toggle("filtered-out",filter!=="all" && String(index)!==filter);
  });
}

groupFilter.addEventListener("click",e=>{
  const button=e.target.closest(".filter-chip");
  if(!button) return;
  setFilter(button.dataset.filter);
});

function renderResult(data){
  result.classList.remove("hidden");
  resultTitle.textContent=`${selected.name} · ${startDate.value} ~ ${endDate.value}`;
  summary.innerHTML=`<b>${data.matched.toLocaleString("ko-KR")}</b>개 <i></i> <b>${data.groupCount.toLocaleString("ko-KR")}</b>종류`;
  groupsEl.innerHTML="";
  currentGroups=data.groups||[];
  activeFilter="all";
  buildFilter(currentGroups);

  if(!currentGroups.length){
    groupsEl.innerHTML='<div class="empty">조건에 맞는 총공 게시글을 찾지 못했습니다.</div>';
    return;
  }

  currentGroups.forEach((group,index)=>{
    const box=document.createElement("section");
    box.className="group";
    box.dataset.index=String(index);

    const head=document.createElement("button");
    head.type="button";
    head.className="group-title";
    head.setAttribute("aria-expanded","true");
    head.setAttribute("aria-controls",`group-posts-${index}`);

    const left=document.createElement("span");
    left.className="group-name-wrap";
    const order=document.createElement("span");
    order.className="group-order";
    order.textContent=String(index+1).padStart(2,"0");
    const name=document.createElement("strong");
    name.textContent=group.name;
    left.append(order,name);

    const right=document.createElement("span");
    right.className="group-title-right";
    const count=document.createElement("span");
    count.className="group-count";
    count.textContent=`${group.posts.length.toLocaleString("ko-KR")}개`;
    const toggle=document.createElement("span");
    toggle.className="group-toggle";
    toggle.textContent="⌃";
    right.append(count,toggle);
    head.append(left,right);
    head.onclick=()=>toggleGroup(box,head);
    box.appendChild(head);

    const postList=document.createElement("div");
    postList.id=`group-posts-${index}`;
    postList.className="group-posts";
    postList.setAttribute("aria-label",`${group.name} 게시글`);

    for(const post of group.posts){
      const row=document.createElement("div");
      row.className="post";

      const a=document.createElement("a");
      a.href=post.link;
      a.target="_blank";
      a.rel="noopener noreferrer";
      a.textContent=post.title;
      a.title=post.title;

      const meta=document.createElement("div");
      meta.className="post-meta";
      const date=document.createElement("span");
      date.className="post-date";
      date.textContent=post.date||"";
      meta.appendChild(date);
      if(post.head){
        const h=document.createElement("span");
        h.className="post-head";
        h.textContent=post.head;
        meta.appendChild(h);
      }

      row.append(a,meta);
      postList.appendChild(row);
    }

    box.appendChild(postList);
    groupsEl.appendChild(box);
  });
  result.scrollIntoView({behavior:"smooth",block:"start"});
}

function toggleGroup(box,head){
  const collapsed=box.classList.toggle("collapsed");
  head.setAttribute("aria-expanded",String(!collapsed));
}

scanButton.onclick=scan; setCollectMode("default"); updateReady();
