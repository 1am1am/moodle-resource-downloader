// bookmarklet.js - Moodle Course Downloader with Folder Structure (Native File System Access)
(function () {
  const oldModal = document.getElementById("moodle-dl-modal");
  if (oldModal) oldModal.remove();

  function sanitize(name) {
    if (!name) return "unnamed";
    return name
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
      .replace(/[\t\n\r]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^\.+|\.+$/g, "")
      .trim()
      .substring(0, 100);
  }

  function getCleanText(el) {
    if (!el) return "";
    const clone = el.cloneNode(true);
    clone.querySelectorAll(".accesshide, .sr-only, img, svg, .activityiconcontainer").forEach((e) => e.remove());
    return clone.textContent.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function cleanSectionTitle(title) {
    if (!title) return "Tài liệu chung";
    return title
      .replace(/(Collapse|Expand)\s*all/gi, "")
      .replace(/(Thu gọn|Mở rộng)\s*tất cả/gi, "")
      .replace(/\s+/g, " ")
      .trim() || "Tài liệu chung";
  }

  function fixDuplicateExtension(name) {
    if (!name) return "file";
    return name.replace(/(\.[a-zA-Z0-9]{2,5})\1+$/i, "$1");
  }

  function detectFileType(title, url) {
    const str = (title + " " + url).toLowerCase();
    if (str.includes(".pdf") || str.includes("pdf")) return "PDF";
    if (str.includes(".doc") || str.includes(".docx")) return "DOC";
    if (str.includes(".ppt") || str.includes(".pptx")) return "PPT";
    if (str.includes(".zip") || str.includes(".rar") || str.includes(".7z")) return "ZIP";
    if (str.includes(".txt")) return "TXT";
    return "TỆP";
  }

  // Scan Course Title
  let courseName = "";
  const titleSelectors = [
    ".page-header-headings h1",
    "header .page-header-headings h1",
    ".page-title",
    "div[role='main'] h1",
    "h1"
  ];
  for (const sel of titleSelectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim()) {
      courseName = el.innerText.trim();
      break;
    }
  }
  if (!courseName) courseName = document.title.split("|")[0].split("-")[0].trim() || "Moodle Course";

  // Scan Resource Links
  const resourceLinks = Array.from(
    document.querySelectorAll('a[href*="/mod/resource/view.php"], a[href*="/mod/folder/view.php"], a[href*="/pluginfile.php/"]')
  ).filter((a) => !a.closest(".courseindex, #nav-drawer, .drawer, nav, aside"));

  const items = [];
  const seen = new Set();

  resourceLinks.forEach((link, idx) => {
    const rawUrl = link.href.split("#")[0];
    if (seen.has(rawUrl)) return;
    seen.add(rawUrl);

    let title = getCleanText(link);
    if (!title || title.length < 2) {
      title = link.getAttribute("aria-label") || getCleanText(link.closest(".activityinstance, .activity-item")) || `Tai_lieu_${idx + 1}`;
    }
    title = title.replace(/^(File|Tập tin|Tệp|Tài liệu|Folder|Thư mục|PDF document|Document)\s*/i, "");
    title = fixDuplicateExtension(title);

    let sectionName = "Tài liệu chung";
    const secEl = link.closest("[data-sectionid], .course-section, li.section.main, li.section, div.section");
    if (secEl) {
      const secTitle = secEl.querySelector(".sectionname, .section-title, h3, h4, [data-for='section_title']");
      if (secTitle) {
        const t = getCleanText(secTitle);
        if (t) sectionName = cleanSectionTitle(t);
      }
    }

    items.push({
      id: `bm_item_${idx}`,
      title: title,
      url: rawUrl,
      section: sectionName,
      type: detectFileType(title, rawUrl)
    });
  });

  if (items.length === 0) {
    alert("Không tìm thấy tệp tài liệu nào trên trang này. Hãy chắc chắn bạn đang mở trang chi tiết một khóa học trên Moodle.");
    return;
  }

  // Deep resolve file URL
  async function resolveDirectFile(url, fallbackTitle) {
    try {
      let targetUrl = url;
      if (targetUrl.includes("/mod/resource/view.php") && !targetUrl.includes("redirect=1")) {
        targetUrl += (targetUrl.includes("?") ? "&" : "?") + "redirect=1";
      }

      const res = await fetch(targetUrl, { credentials: "include" });

      if (res.url && res.url.includes("/pluginfile.php/")) {
        let finalUrl = res.url;
        if (!finalUrl.includes("forcedownload=1")) {
          finalUrl += (finalUrl.includes("?") ? "&" : "?") + "forcedownload=1";
        }
        return { finalUrl, res };
      }

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const embed = doc.querySelector(
          'object[data*="/pluginfile.php/"], iframe[src*="/pluginfile.php/"], embed[src*="/pluginfile.php/"], .resourcecontent a[href*="/pluginfile.php/"], div[role="main"] a[href*="/pluginfile.php/"]'
        );
        if (embed) {
          let extracted = embed.getAttribute("data") || embed.getAttribute("src") || embed.getAttribute("href");
          if (extracted) {
            if (!extracted.includes("forcedownload=1")) {
              extracted += (extracted.includes("?") ? "&" : "?") + "forcedownload=1";
            }
            const innerRes = await fetch(extracted, { credentials: "include" });
            return { finalUrl: extracted, res: innerRes };
          }
        }
        return { finalUrl: targetUrl, res: null };
      }

      return { finalUrl: targetUrl, res };
    } catch (err) {
      console.warn("Resolve error:", err);
      return { finalUrl: url, res: null };
    }
  }

  function extractFileName(res, fallbackTitle) {
    let fileName = fallbackTitle || "file";
    if (res) {
      const disposition = res.headers.get("content-disposition");
      if (disposition) {
        const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
        if (utfMatch && utfMatch[1]) fileName = decodeURIComponent(utfMatch[1]);
        else {
          const std = disposition.match(/filename=["']?([^"';]+)["']?/i);
          if (std && std[1]) fileName = std[1].trim();
        }
      } else if (res.url) {
        try {
          const p = new URL(res.url);
          const part = p.pathname.split("/").filter(Boolean).pop();
          if (part && part.includes(".")) fileName = decodeURIComponent(part);
        } catch (e) {}
      }
    }
    let ext = fileName.includes(".") ? fileName.substring(fileName.lastIndexOf(".")).toLowerCase() : ".pdf";
    let cleanName = sanitize(fallbackTitle);
    if (!cleanName.toLowerCase().endsWith(ext)) cleanName += ext;
    return fixDuplicateExtension(cleanName);
  }

  function getUniqueFileName(seenSet, name) {
    if (!seenSet.has(name)) {
      seenSet.add(name);
      return name;
    }
    const dotIdx = name.lastIndexOf(".");
    const base = dotIdx !== -1 ? name.substring(0, dotIdx) : name;
    const ext = dotIdx !== -1 ? name.substring(dotIdx) : "";
    let counter = 1;
    let uniqueName = `${base} (${counter})${ext}`;
    while (seenSet.has(uniqueName)) {
      counter++;
      uniqueName = `${base} (${counter})${ext}`;
    }
    seenSet.add(uniqueName);
    return uniqueName;
  }

  // Inject Styles
  if (!document.getElementById("moodle-dl-styles")) {
    const style = document.createElement("style");
    style.id = "moodle-dl-styles";
    style.textContent = `
      #moodle-dl-modal {
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(4px);
        z-index: 9999999; display: flex; align-items: center; justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #0f172a; box-sizing: border-box;
      }
      #moodle-dl-modal.moodle-dl-hidden { display: none !important; }
      .moodle-dl-content {
        background: #ffffff; border-radius: 12px; width: 92%; max-width: 640px;
        max-height: 88vh; display: flex; flex-direction: column;
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);
        border: 1px solid #e2e8f0; overflow: hidden;
      }
      .moodle-dl-header {
        padding: 16px 22px; border-bottom: 1px solid #e2e8f0; display: flex;
        justify-content: space-between; align-items: center; background: #f8fafc;
      }
      .moodle-dl-badge {
        display: inline-block; font-size: 11px; font-weight: 600; color: #475569;
        background: #e2e8f0; padding: 2px 8px; border-radius: 4px; margin-bottom: 4px;
      }
      .moodle-dl-title { margin: 0; font-size: 16px; font-weight: 700; color: #0f172a; }
      .moodle-dl-close {
        background: none; border: none; font-size: 22px; line-height: 1;
        color: #64748b; cursor: pointer; padding: 4px 8px; border-radius: 6px;
      }
      .moodle-dl-close:hover { background: #e2e8f0; color: #0f172a; }
      .moodle-dl-toolbar {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 22px; background: #ffffff; border-bottom: 1px solid #f1f5f9; font-size: 12px; flex-wrap: wrap; gap: 8px;
      }
      .moodle-dl-filter-group { display: flex; align-items: center; gap: 6px; }
      .moodle-dl-filter-btn {
        background: #f1f5f9; border: 1px solid #e2e8f0; color: #334155;
        font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 4px; cursor: pointer; transition: all 0.15s ease;
      }
      .moodle-dl-filter-btn:hover { background: #e2e8f0; color: #0f172a; }
      .moodle-dl-filter-btn.active { background: #0f172a; color: #ffffff; border-color: #0f172a; }
      .moodle-dl-options {
        padding: 10px 22px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
        display: flex; gap: 16px; font-size: 12px; color: #334155; flex-wrap: wrap;
      }
      .moodle-dl-label { display: flex; align-items: center; gap: 6px; cursor: pointer; margin: 0; }
      .moodle-dl-label input[type="checkbox"] { width: 14px; height: 14px; accent-color: #0f172a; cursor: pointer; margin: 0; }
      .moodle-dl-info-box {
        padding: 8px 22px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
        font-size: 12px; color: #475569; display: flex; align-items: center; gap: 6px;
      }
      .moodle-dl-list { padding: 12px 22px; overflow-y: auto; flex: 1; max-height: 380px; }
      .moodle-dl-group { margin-bottom: 10px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #ffffff; }
      .moodle-dl-gh {
        display: flex; justify-content: space-between; align-items: center;
        padding: 8px 12px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; font-size: 13px; font-weight: 600;
      }
      .moodle-dl-toggle-btn {
        background: none; border: none; cursor: pointer; color: #64748b; font-size: 11px; padding: 2px 4px; border-radius: 4px;
      }
      .moodle-dl-toggle-btn:hover { background: #e2e8f0; color: #0f172a; }
      .moodle-dl-items { padding: 4px 12px; }
      .moodle-dl-items.collapsed { display: none !important; }
      .moodle-dl-item {
        padding: 6px 0; border-bottom: 1px solid #f8fafc; font-size: 13px; color: #334155;
        display: flex; align-items: center; justify-content: space-between;
      }
      .moodle-dl-item:last-child { border-bottom: none; }
      .moodle-dl-item-left { display: flex; align-items: center; gap: 8px; overflow: hidden; flex: 1; }
      .moodle-dl-item-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 440px; }
      .moodle-dl-type-badge {
        font-size: 10px; font-weight: 700; color: #475569; background: #f1f5f9; border: 1px solid #e2e8f0;
        padding: 1px 4px; border-radius: 3px; flex-shrink: 0; text-transform: uppercase;
      }
      .moodle-dl-progress { padding: 12px 22px; background: #f8fafc; border-top: 1px solid #e2e8f0; }
      .moodle-dl-bar-bg { width: 100%; height: 6px; background: #e2e8f0; border-radius: 99px; overflow: hidden; margin-bottom: 6px; }
      .moodle-dl-bar-fill { height: 100%; width: 0%; background: #0f172a; border-radius: 99px; transition: width 0.2s; }
      .moodle-dl-bar-text { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: #475569; }
      .moodle-dl-footer {
        padding: 12px 22px; border-top: 1px solid #e2e8f0; background: #ffffff; display: flex; justify-content: flex-end;
      }
      .moodle-dl-btn {
        background: #0f172a; color: #ffffff; border: 1px solid #0f172a; border-radius: 6px;
        padding: 9px 20px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s;
      }
      .moodle-dl-btn:hover:not(:disabled) { background: #1e293b; }
      .moodle-dl-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    `;
    document.head.appendChild(style);
  }

  // Create Modal
  const modal = document.createElement("div");
  modal.id = "moodle-dl-modal";
  modal.innerHTML = `
    <div class="moodle-dl-content">
      <div class="moodle-dl-header">
        <div>
          <span class="moodle-dl-badge">Moodle Downloader</span>
          <h3 class="moodle-dl-title">${courseName}</h3>
        </div>
        <button class="moodle-dl-close" id="bm-close">&times;</button>
      </div>

      <div class="moodle-dl-toolbar">
        <span style="font-weight:600; color:#475569;">Tìm thấy ${items.length} tệp</span>
        <div class="moodle-dl-filter-group">
          <span style="font-size:11px; color:#64748b; margin-right:2px;">Lọc nhanh:</span>
          <button class="moodle-dl-filter-btn active" data-filter="all">Tất cả</button>
          <button class="moodle-dl-filter-btn" data-filter="slides">Chỉ Slide / Bài giảng</button>
          <button class="moodle-dl-filter-btn" data-filter="exercises">Chỉ Bài tập / Lab</button>
          <button class="moodle-dl-filter-btn" data-filter="none">Bỏ chọn</button>
        </div>
      </div>

      <div class="moodle-dl-options">
        <label class="moodle-dl-label" title="Gom toàn bộ vào 1 file ZIP có sẵn cấu trúc thư mục môn học và từng tuần">
          <input type="radio" name="bm-mode" id="bm-mode-zip" checked style="width:14px; height:14px; accent-color:#0f172a; cursor:pointer;">
          <strong style="color:#0f172a;">Gom theo thư mục môn & tuần (.ZIP - Dễ quản lý)</strong>
        </label>
        <label class="moodle-dl-label" title="Tải từng file rời rạc trực tiếp về thư mục Downloads">
          <input type="radio" name="bm-mode" id="bm-mode-direct" style="width:14px; height:14px; accent-color:#0f172a; cursor:pointer;">
          <span>Tải file lẻ trực tiếp</span>
        </label>
        <label class="moodle-dl-label" style="margin-left:auto;">
          <input type="checkbox" id="bm-opt-index" style="width:14px; height:14px; accent-color:#0f172a; cursor:pointer;">
          <span>Đánh số thứ tự (01_, 02_...)</span>
        </label>
      </div>

      <div class="moodle-dl-info-box">
        <span>Khuyên dùng chế độ <strong>Gom theo thư mục môn & tuần (.ZIP)</strong> để tự động chia sẵn các folder tuần trên máy tính.</span>
      </div>

      <div class="moodle-dl-list" id="bm-list"></div>
      
      <div class="moodle-dl-progress moodle-dl-hidden" id="bm-pbox" style="display:none;">
        <div class="moodle-dl-bar-bg"><div class="moodle-dl-bar-fill" id="bm-pfill"></div></div>
        <div class="moodle-dl-bar-text"><span id="bm-pstatus">Đang chuẩn bị...</span><span id="bm-ppct">0%</span></div>
      </div>

      <div class="moodle-dl-footer">
        <button class="moodle-dl-btn" id="bm-start">Tải tài liệu đã chọn (${items.length})</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Group by section
  const listEl = document.getElementById("bm-list");
  const groups = {};
  items.forEach((it) => {
    if (!groups[it.section]) groups[it.section] = [];
    groups[it.section].push(it);
  });

  for (const [sec, secItems] of Object.entries(groups)) {
    const g = document.createElement("div");
    g.className = "moodle-dl-group";

    const gh = document.createElement("div");
    gh.className = "moodle-dl-gh";
    gh.innerHTML = `
      <label style="display:flex; align-items:center; gap:6px; cursor:pointer; margin:0;">
        <input type="checkbox" class="bm-sec-chk" data-sec="${encodeURIComponent(sec)}" checked style="width:14px; height:14px; accent-color:#0f172a; cursor:pointer;">
        <span>${sec}</span>
      </label>
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:11px; color:#64748b; font-weight:normal;">${secItems.length} tệp</span>
        <button class="moodle-dl-toggle-btn" data-sec-btn="${encodeURIComponent(sec)}">Thu gọn</button>
      </div>
    `;
    g.appendChild(gh);

    const body = document.createElement("div");
    body.className = "moodle-dl-items";
    body.setAttribute("data-sec-items", encodeURIComponent(sec));

    secItems.forEach((it) => {
      const row = document.createElement("div");
      row.className = "moodle-dl-item";
      row.innerHTML = `
        <div class="moodle-dl-item-left">
          <label style="display:flex; align-items:center; gap:6px; cursor:pointer; margin:0;">
            <input type="checkbox" class="bm-chk" data-id="${it.id}" data-title="${encodeURIComponent(it.title)}" data-sec="${encodeURIComponent(sec)}" checked style="width:14px; height:14px; accent-color:#0f172a; cursor:pointer;">
            <span class="moodle-dl-item-text" title="${it.title}">${it.title}</span>
          </label>
        </div>
        <span class="moodle-dl-type-badge">${it.type}</span>
      `;
      body.appendChild(row);
    });

    g.appendChild(body);
    listEl.appendChild(g);
  }

  function updateBtn() {
    const cnt = document.querySelectorAll(".bm-chk:checked").length;
    const b = document.getElementById("bm-start");
    const isZip = document.getElementById("bm-mode-zip")?.checked;
    b.innerText = isZip ? `Tải trọn bộ thư mục (${cnt})` : `Tải các file lẻ (${cnt})`;
    b.disabled = cnt === 0;
  }

  document.getElementById("bm-mode-zip")?.addEventListener("change", updateBtn);
  document.getElementById("bm-mode-direct")?.addEventListener("change", updateBtn);

  // Toggle Collapse
  document.querySelectorAll(".moodle-dl-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const s = e.target.getAttribute("data-sec-btn");
      const target = document.querySelector(`[data-sec-items="${s}"]`);
      if (target) {
        target.classList.toggle("collapsed");
        e.target.innerText = target.classList.contains("collapsed") ? "Mở rộng" : "Thu gọn";
      }
    });
  });

  // Master Section Checkbox
  document.querySelectorAll(".bm-sec-chk").forEach((secChk) => {
    secChk.addEventListener("change", (e) => {
      const s = e.target.getAttribute("data-sec");
      document.querySelectorAll(`.bm-chk[data-sec="${s}"]`).forEach((c) => (c.checked = e.target.checked));
      updateBtn();
    });
  });

  document.querySelectorAll(".bm-chk").forEach((c) => c.addEventListener("change", updateBtn));

  // Quick Filters
  document.querySelectorAll(".moodle-dl-filter-btn").forEach((fBtn) => {
    fBtn.addEventListener("click", (e) => {
      document.querySelectorAll(".moodle-dl-filter-btn").forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");
      const filter = e.target.getAttribute("data-filter");

      document.querySelectorAll(".bm-chk").forEach((chk) => {
        const rawTitle = decodeURIComponent(chk.getAttribute("data-title") || "").toLowerCase();
        if (filter === "all") {
          chk.checked = true;
        } else if (filter === "slides") {
          chk.checked = /slide|bai\s*giang|chap|lec|ly\s*thuyet|overview|tong\s*quan/i.test(rawTitle);
        } else if (filter === "exercises") {
          chk.checked = /bai\s*tap|lab|btvn|assign|exercise|de\s*thi|on\s*tap|thuc\s*hanh/i.test(rawTitle);
        } else if (filter === "none") {
          chk.checked = false;
        }
      });

      document.querySelectorAll(".bm-sec-chk").forEach((secChk) => {
        const s = secChk.getAttribute("data-sec");
        const all = document.querySelectorAll(`.bm-chk[data-sec="${s}"]`);
        const checked = document.querySelectorAll(`.bm-chk[data-sec="${s}"]:checked`);
        secChk.checked = all.length > 0 && all.length === checked.length;
      });

      updateBtn();
    });
  });

  updateBtn();

  document.getElementById("bm-close").onclick = () => modal.remove();
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };

  async function loadJSZip() {
    if (window.JSZip) return window.JSZip;
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://1am1am.github.io/moodle-resource-downloader/jszip.min.js";
      s.onload = () => resolve(window.JSZip);
      s.onerror = () => {
        const s2 = document.createElement("script");
        s2.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
        s2.onload = () => resolve(window.JSZip);
        s2.onerror = reject;
        document.head.appendChild(s2);
      };
      document.head.appendChild(s);
    });
  }

  // Execution: ZIP folder packaging or direct sequential download
  document.getElementById("bm-start").onclick = async () => {
    const checkedIds = new Set(Array.from(document.querySelectorAll(".bm-chk:checked")).map((c) => c.getAttribute("data-id")));
    const selected = items.filter((i) => checkedIds.has(i.id));
    if (selected.length === 0) return;

    const isZip = document.getElementById("bm-mode-zip") ? document.getElementById("bm-mode-zip").checked : true;
    const addIndex = document.getElementById("bm-opt-index") ? document.getElementById("bm-opt-index").checked : false;

    const pbox = document.getElementById("bm-pbox");
    const pfill = document.getElementById("bm-pfill");
    const pstatus = document.getElementById("bm-pstatus");
    const ppct = document.getElementById("bm-ppct");

    pbox.style.display = "block";
    document.getElementById("bm-start").disabled = true;

    const seenNamesBySection = {};

    if (isZip) {
      // MODE 1: ZIP with Course and Week folders
      pstatus.innerText = "Đang nạp công cụ tạo thư mục...";
      try {
        await loadJSZip();
      } catch (e) {
        console.warn("Could not load JSZip, falling back to direct downloads:", e);
      }

      if (window.JSZip) {
        const zip = new JSZip();
        const root = zip.folder(sanitize(courseName));

        for (let i = 0; i < selected.length; i++) {
          const it = selected[i];
          const pct = Math.round(((i + 1) / selected.length) * 85);
          pfill.style.width = `${pct}%`;
          ppct.innerText = `${pct}%`;
          pstatus.innerText = `Đang lấy (${i + 1}/${selected.length}): ${it.title}`;

          try {
            const { finalUrl, res } = await resolveDirectFile(it.url, it.title);
            let cleanName = extractFileName(res, it.title);

            const secKey = it.section || "Tài liệu chung";
            if (!seenNamesBySection[secKey]) seenNamesBySection[secKey] = new Set();
            cleanName = getUniqueFileName(seenNamesBySection[secKey], cleanName);

            if (addIndex) {
              cleanName = `${String(i + 1).padStart(2, "0")}_${cleanName}`;
            }

            if (res && res.ok) {
              const blob = await res.blob();
              const secFolder = root.folder(sanitize(secKey));
              secFolder.file(cleanName, blob);
            }
          } catch (err) {
            console.warn("Error fetching item for zip:", it, err);
          }
          await new Promise((r) => setTimeout(r, 120));
        }

        pstatus.innerText = "Đang hoàn tất đóng gói cây thư mục...";
        ppct.innerText = "90%";
        pfill.style.width = "90%";

        const zipBlob = await zip.generateAsync({ type: "blob", compression: "STORE" }, (meta) => {
          const progress = 90 + Math.round(meta.percent * 0.1);
          pfill.style.width = `${progress}%`;
          ppct.innerText = `${progress}%`;
        });

        const blobUrl = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `${sanitize(courseName)}.zip`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          a.remove();
          URL.revokeObjectURL(blobUrl);
        }, 20000);

        pstatus.innerText = `Hoàn tất! Đã gom ${selected.length} tệp vào các folder tuần/chương.`;
        ppct.innerText = "100%";
        pfill.style.width = "100%";
        document.getElementById("bm-start").disabled = false;
        return;
      }
    }

    // MODE 2: Direct sequential file download (or fallback if JSZip fails)
    for (let i = 0; i < selected.length; i++) {
      const it = selected[i];
      const pct = Math.round(((i + 1) / selected.length) * 100);
      pfill.style.width = `${pct}%`;
      ppct.innerText = `${pct}%`;
      pstatus.innerText = `Đang tải (${i + 1}/${selected.length}): ${it.title}`;

      try {
        const { finalUrl, res } = await resolveDirectFile(it.url, it.title);
        let cleanName = extractFileName(res, it.title);

        const secKey = it.section || "Chung";
        if (!seenNamesBySection[secKey]) seenNamesBySection[secKey] = new Set();
        cleanName = getUniqueFileName(seenNamesBySection[secKey], cleanName);

        if (it.section) {
          cleanName = `[${sanitize(it.section)}] ${cleanName}`;
        }

        if (addIndex) {
          cleanName = `${String(i + 1).padStart(2, "0")}_${cleanName}`;
        }

        if (res && res.ok) {
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = cleanName;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            a.remove();
            URL.revokeObjectURL(blobUrl);
          }, 15000);
        } else {
          const a = document.createElement("a");
          a.href = finalUrl;
          a.download = cleanName;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => a.remove(), 2000);
        }
      } catch (err) {
        console.warn("Download error for item:", it, err);
        const a = document.createElement("a");
        a.href = it.url + (it.url.includes("?") ? "&" : "?") + "redirect=1";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 2000);
      }

      await new Promise((r) => setTimeout(r, 650));
    }

    pstatus.innerText = `Đã hoàn tất tải ${selected.length} tệp!`;
    document.getElementById("bm-start").disabled = false;
  };
})();
