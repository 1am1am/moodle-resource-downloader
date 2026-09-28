// ==UserScript==
// @name         Moodle Course Resource Downloader (HCMUS)
// @namespace    https://github.com/1am1am/moodle-resource-downloader
// @version      1.1.0
// @description  Tự động quét và tải toàn bộ tài liệu khóa học Moodle (FIT@HCMUS, CTDA) thành file .ZIP chỉ với 1 click.
// @author       1am1am
// @match        *://courses.ctda.hcmus.edu.vn/course/view.php*
// @match        *://courses.fit.hcmus.edu.vn/course/view.php*
// @match        *://elearning.hcmus.edu.vn/course/view.php*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  if (window.__moodleDownloaderUserscriptInjected) return;
  window.__moodleDownloaderUserscriptInjected = true;

  function sanitize(name) {
    if (!name) return "unnamed";
    return name
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
      .replace(/[\t\n\r]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^\.+|\.+$/g, "")
      .trim()
      .substring(0, 120);
  }

  function getCleanText(element) {
    if (!element) return "";
    const clone = element.cloneNode(true);
    clone.querySelectorAll(".accesshide, .sr-only, img, svg, .activityiconcontainer").forEach((el) => el.remove());
    return clone.textContent.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function scanCourseData() {
    let courseName = "";
    const titleSelectors = [
      ".page-header-headings h1",
      "header .page-header-headings h1",
      ".page-title",
      "div[role='main'] h1",
      "h1"
    ];
    for (const selector of titleSelectors) {
      const el = document.querySelector(selector);
      if (el && el.innerText.trim()) {
        courseName = el.innerText.trim();
        break;
      }
    }
    if (!courseName) {
      courseName = document.title.split("|")[0].split("-")[0].trim() || "Moodle Course";
    }

    const mainContent = document.querySelector("#region-main, div[role='main'], .course-content") || document.body;
    const resourceLinks = mainContent.querySelectorAll(
      'a[href*="/mod/resource/view.php?id="], a[href*="/mod/folder/view.php?id="], a[href*="/pluginfile.php/"]'
    );

    const items = [];
    const seenUrls = new Set();

    resourceLinks.forEach((link, idx) => {
      if (link.closest(".courseindex, #nav-drawer, .drawer, nav, aside")) return;

      const rawUrl = link.href.split("#")[0];
      if (seenUrls.has(rawUrl)) return;
      seenUrls.add(rawUrl);

      let title = getCleanText(link);
      if (!title || title.length < 2) {
        title = link.getAttribute("aria-label") || getCleanText(link.closest(".activityinstance, .activity-item")) || `Tai_lieu_${idx + 1}`;
      }
      title = title.replace(/^(File|Tập tin|Tệp|Tài liệu|Folder|Thư mục|PDF document|Document)\s*/i, "");

      let sectionName = "Chung (General)";
      const sectionEl = link.closest("[data-sectionid], .course-section, li.section.main, li.section, div.section");
      if (sectionEl) {
        const secTitleEl = sectionEl.querySelector(".sectionname, .section-title, h3, h4, [data-for='section_title']");
        if (secTitleEl) {
          const secText = getCleanText(secTitleEl);
          if (secText) sectionName = secText;
        }
      }

      items.push({
        id: `moodle_item_${idx}`,
        title: title,
        url: rawUrl,
        section: sectionName,
        type: rawUrl.includes("/mod/folder/") ? "folder" : "file"
      });
    });

    return { courseName, items };
  }

  // Inject Styles
  const style = document.createElement("style");
  style.textContent = `
    #moodle-dl-float-btn {
      position: fixed;
      bottom: 28px;
      right: 28px;
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 8px;
      background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
      color: #ffffff;
      border: none;
      border-radius: 9999px;
      padding: 12px 20px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      font-weight: 600;
      box-shadow: 0 10px 25px -5px rgba(13, 148, 136, 0.4);
      cursor: pointer;
      transition: all 0.2s;
    }
    #moodle-dl-float-btn:hover {
      transform: translateY(-2px) scale(1.03);
      background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%);
    }
    #moodle-dl-modal {
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(4px);
      z-index: 1000000;
      display: flex; align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #moodle-dl-modal.moodle-dl-hidden { display: none !important; }
    .moodle-dl-modal-content {
      background: #ffffff; border-radius: 16px;
      width: 90%; max-width: 640px; max-height: 85vh;
      display: flex; flex-direction: column;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      overflow: hidden;
    }
    .moodle-dl-header {
      padding: 18px 24px; border-bottom: 1px solid #f1f5f9;
      display: flex; justify-content: space-between; align-items: flex-start;
      background: #f8fafc;
    }
    .moodle-dl-badge {
      display: inline-block; font-size: 11px; font-weight: 700;
      color: #0f766e; background: #ccfbf1;
      padding: 2px 8px; border-radius: 6px; margin-bottom: 4px;
    }
    .moodle-dl-header h3 { margin: 0; font-size: 18px; font-weight: 700; color: #0f172a; }
    .moodle-dl-btn-close {
      background: transparent; border: none; font-size: 24px; color: #94a3b8; cursor: pointer;
    }
    .moodle-dl-toolbar {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 24px; background: #ffffff; border-bottom: 1px solid #f1f5f9; font-size: 13px;
    }
    .moodle-dl-btn-link { background: none; border: none; color: #0d9488; font-weight: 600; cursor: pointer; text-decoration: underline; }
    .moodle-dl-options {
      padding: 10px 24px; background: #f8fafc; display: flex; gap: 16px; flex-wrap: wrap;
      font-size: 13px; color: #334155; border-bottom: 1px solid #e2e8f0;
    }
    .moodle-dl-highlight { color: #0f766e; background: #ccfbf1; padding: 4px 10px; border-radius: 6px; }
    .moodle-dl-checkbox-label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
    .moodle-dl-file-list { padding: 12px 24px; overflow-y: auto; flex: 1; max-height: 380px; }
    .moodle-dl-section-group { margin-bottom: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
    .moodle-dl-section-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #edf2f7; border-bottom: 1px solid #e2e8f0; }
    .moodle-dl-section-items { padding: 6px 14px; }
    .moodle-dl-item-row { padding: 6px 0; border-bottom: 1px dashed #e2e8f0; font-size: 13px; }
    .moodle-dl-item-row:last-child { border-bottom: none; }
    .moodle-dl-progress-box { padding: 14px 24px; background: #f0fdfa; border-top: 1px solid #ccfbf1; }
    .moodle-dl-progress-bar-bg { width: 100%; height: 8px; background: #ccfbf1; border-radius: 999px; overflow: hidden; margin-bottom: 8px; }
    .moodle-dl-progress-bar-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #14b8a6, #0d9488); transition: width 0.2s; }
    .moodle-dl-progress-text { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: #0f766e; }
    .moodle-dl-footer { padding: 14px 24px; border-top: 1px solid #f1f5f9; display: flex; justify-content: flex-end; }
    .moodle-dl-btn-primary {
      background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
      color: #ffffff; border: none; border-radius: 8px; padding: 10px 22px; font-size: 14px; font-weight: 600; cursor: pointer;
    }
    .moodle-dl-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  `;
  document.head.appendChild(style);

  // Floating Button & Modal
  const data = scanCourseData();
  if (data.items.length === 0) return;

  const floatBtn = document.createElement("button");
  floatBtn.id = "moodle-dl-float-btn";
  floatBtn.innerHTML = `<span>📥 Tải tài liệu (${data.items.length})</span>`;
  document.body.appendChild(floatBtn);

  const modal = document.createElement("div");
  modal.id = "moodle-dl-modal";
  modal.className = "moodle-dl-hidden";
  modal.innerHTML = `
    <div class="moodle-dl-modal-content">
      <div class="moodle-dl-header">
        <div>
          <span class="moodle-dl-badge">HCMUS MOODLE DOWNLOADER</span>
          <h3 id="moodle-dl-course-title">${data.courseName}</h3>
        </div>
        <button id="moodle-dl-close" class="moodle-dl-btn-close">&times;</button>
      </div>
      <div class="moodle-dl-toolbar">
        <span id="moodle-dl-count-badge">Tìm thấy ${data.items.length} file</span>
        <div>
          <button id="moodle-dl-select-all" class="moodle-dl-btn-link">Chọn tất cả</button>
          <span> | </span>
          <button id="moodle-dl-deselect-all" class="moodle-dl-btn-link">Bỏ chọn</button>
        </div>
      </div>
      <div class="moodle-dl-options">
        <label class="moodle-dl-checkbox-label moodle-dl-highlight">
          <input type="checkbox" id="moodle-dl-opt-zip" checked>
          <span><strong>📦 Nén thành file .ZIP</strong> (Mặc định)</span>
        </label>
        <label class="moodle-dl-checkbox-label">
          <input type="checkbox" id="moodle-dl-opt-folders" checked>
          <span>Tạo thư mục con theo tuần</span>
        </label>
      </div>
      <div id="moodle-dl-file-list" class="moodle-dl-file-list"></div>
      <div id="moodle-dl-progress-box" class="moodle-dl-progress-box moodle-dl-hidden">
        <div class="moodle-dl-progress-bar-bg">
          <div id="moodle-dl-progress-bar-fill" class="moodle-dl-progress-bar-fill"></div>
        </div>
        <div class="moodle-dl-progress-text">
          <span id="moodle-dl-progress-status">Đang chuẩn bị...</span>
          <span id="moodle-dl-progress-percent">0%</span>
        </div>
      </div>
      <div class="moodle-dl-footer">
        <button id="moodle-dl-btn-start" class="moodle-dl-btn-primary">🚀 Tải các file đã chọn</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Render List
  const listEl = document.getElementById("moodle-dl-file-list");
  const groups = {};
  data.items.forEach((i) => {
    if (!groups[i.section]) groups[i.section] = [];
    groups[i.section].push(i);
  });

  for (const [sec, items] of Object.entries(groups)) {
    const groupEl = document.createElement("div");
    groupEl.className = "moodle-dl-section-group";
    groupEl.innerHTML = `
      <div class="moodle-dl-section-header">
        <strong>${sec}</strong>
        <span>${items.length} file</span>
      </div>
      <div class="moodle-dl-section-items">
        ${items
          .map(
            (it) => `
          <div class="moodle-dl-item-row">
            <label class="moodle-dl-checkbox-label">
              <input type="checkbox" class="moodle-dl-chk" data-id="${it.id}" checked>
              <span>${it.title}</span>
            </label>
          </div>
        `
          )
          .join("")}
      </div>
    `;
    listEl.appendChild(groupEl);
  }

  floatBtn.onclick = () => modal.classList.remove("moodle-dl-hidden");
  document.getElementById("moodle-dl-close").onclick = () => modal.classList.add("moodle-dl-hidden");
  document.getElementById("moodle-dl-select-all").onclick = () => {
    document.querySelectorAll(".moodle-dl-chk").forEach((c) => (c.checked = true));
  };
  document.getElementById("moodle-dl-deselect-all").onclick = () => {
    document.querySelectorAll(".moodle-dl-chk").forEach((c) => (c.checked = false));
  };

  // Download Action
  document.getElementById("moodle-dl-btn-start").onclick = async () => {
    const checkedIds = new Set(
      Array.from(document.querySelectorAll(".moodle-dl-chk:checked")).map((c) => c.getAttribute("data-id"))
    );
    const selected = data.items.filter((i) => checkedIds.has(i.id));
    if (selected.length === 0) return alert("Vui lòng chọn ít nhất 1 file!");

    const useFolders = document.getElementById("moodle-dl-opt-folders").checked;
    const progressBox = document.getElementById("moodle-dl-progress-box");
    const fill = document.getElementById("moodle-dl-progress-bar-fill");
    const statusText = document.getElementById("moodle-dl-progress-status");
    const percentText = document.getElementById("moodle-dl-progress-percent");

    progressBox.classList.remove("moodle-dl-hidden");
    document.getElementById("moodle-dl-btn-start").disabled = true;

    const zip = new JSZip();
    const cleanCourse = sanitize(data.courseName);

    for (let i = 0; i < selected.length; i++) {
      const item = selected[i];
      const pct = Math.round(((i + 1) / selected.length) * 100);
      fill.style.width = `${pct}%`;
      percentText.innerText = `${pct}%`;
      statusText.innerText = `Đang tải (${i + 1}/${selected.length}): ${item.title}`;

      try {
        let u = item.url;
        if (u.includes("/mod/resource/view.php") && !u.includes("redirect=1")) {
          u += (u.includes("?") ? "&" : "?") + "redirect=1";
        }
        const res = await fetch(u, { credentials: "include" });
        const buf = await res.arrayBuffer();
        let fname = sanitize(item.title);
        if (!fname.includes(".")) fname += ".pdf";

        if (useFolders) {
          zip.folder(sanitize(item.section)).file(fname, buf);
        } else {
          zip.file(fname, buf);
        }
      } catch (e) {
        console.warn(e);
      }
      await new Promise((r) => setTimeout(r, 150));
    }

    statusText.innerText = "Đang nén file ZIP...";
    const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const blobUrl = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `${cleanCourse}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    statusText.innerText = "Đã hoàn tất tải xuống file ZIP!";
    document.getElementById("moodle-dl-btn-start").disabled = false;
  };
})();
