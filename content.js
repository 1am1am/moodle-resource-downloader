// content.js - Scans Moodle course pages and injects minimal quick download UI with ZIP support

(function () {
  if (window.__moodleDownloaderInjected) return;
  window.__moodleDownloaderInjected = true;

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

  function fixDuplicateExtension(name) {
    if (!name) return "file";
    return name.replace(/(\.[a-zA-Z0-9]{2,5})\1+$/i, "$1");
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

    const resourceLinks = Array.from(
      document.querySelectorAll('a[href*="/mod/resource/view.php"], a[href*="/mod/folder/view.php"], a[href*="/pluginfile.php/"]')
    ).filter((a) => !a.closest(".courseindex, #nav-drawer, .drawer, nav, aside"));

    const items = [];
    const seenUrls = new Set();

    resourceLinks.forEach((link, idx) => {
      const rawUrl = link.href.split("#")[0];
      if (seenUrls.has(rawUrl)) return;
      seenUrls.add(rawUrl);

      let title = getCleanText(link);
      if (!title || title.length < 2) {
        title = link.getAttribute("aria-label") || getCleanText(link.closest(".activityinstance, .activity-item")) || `Tai_lieu_${idx + 1}`;
      }

      title = title.replace(/^(File|Tập tin|Tệp|Tài liệu|Folder|Thư mục|PDF document|Document)\s*/i, "");
      title = fixDuplicateExtension(title);

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

  async function downloadAsZip({ courseName, items, useFolders, addIndex, onProgress }) {
    if (typeof JSZip === "undefined") {
      alert("Thư viện nén ZIP chưa sẵn sàng. Vui lòng tải trang lại!");
      return;
    }

    const zip = new JSZip();
    const cleanCourse = sanitize(courseName || "Moodle_Course");

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      onProgress({
        current: i + 1,
        total: items.length,
        currentFile: item.title,
        status: `Đang tải (${i + 1}/${items.length}): ${item.title}`
      });

      try {
        let downloadUrl = item.url;
        if (downloadUrl.includes("/mod/resource/view.php") && !downloadUrl.includes("redirect=1")) {
          downloadUrl += (downloadUrl.includes("?") ? "&" : "?") + "redirect=1";
        }

        const res = await fetch(downloadUrl, { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        let fileName = item.title;
        const disposition = res.headers.get("content-disposition");
        if (disposition) {
          const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
          if (utfMatch && utfMatch[1]) {
            fileName = decodeURIComponent(utfMatch[1]);
          } else {
            const match = disposition.match(/filename=["']?([^"';]+)["']?/i);
            if (match && match[1]) fileName = match[1].trim();
          }
        } else if (res.url) {
          try {
            const parsed = new URL(res.url);
            const lastPart = parsed.pathname.split("/").filter(Boolean).pop();
            if (lastPart && lastPart.includes(".")) fileName = decodeURIComponent(lastPart);
          } catch (e) {}
        }

        let ext = fileName.includes(".") ? fileName.substring(fileName.lastIndexOf(".")).toLowerCase() : ".pdf";
        let baseName = sanitize(item.title);
        if (!baseName.toLowerCase().endsWith(ext)) baseName += ext;
        baseName = fixDuplicateExtension(baseName);

        if (addIndex) {
          baseName = `${String(i + 1).padStart(2, "0")}_${baseName}`;
        }

        const arrayBuffer = await res.arrayBuffer();
        const cleanSection = sanitize(item.section || "Chung");

        if (useFolders) {
          zip.folder(cleanSection).file(baseName, arrayBuffer);
        } else {
          zip.file(baseName, arrayBuffer);
        }
      } catch (err) {
        console.warn("Failed to fetch item for zip:", item.title, err);
      }

      await new Promise((r) => setTimeout(r, 120));
    }

    onProgress({
      current: items.length,
      total: items.length,
      currentFile: "Đang đóng gói...",
      status: "Đang nén tệp .ZIP..."
    });

    const zipBlob = await zip.generateAsync(
      {
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 }
      },
      (metadata) => {
        const pct = Math.round(metadata.percent);
        onProgress({
          current: items.length,
          total: items.length,
          currentFile: `Nén ${pct}%`,
          status: `Đang nén tệp .ZIP: ${pct}%`
        });
      }
    );

    const blobUrl = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `${cleanCourse}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);

    onProgress({
      current: items.length,
      total: items.length,
      currentFile: `${cleanCourse}.zip`,
      status: `Đã hoàn tất tải tệp nén: ${cleanCourse}.zip`,
      isDone: true
    });
  }

  function injectUI() {
    const data = scanCourseData();
    if (data.items.length === 0) return;

    const floatBtn = document.createElement("button");
    floatBtn.id = "moodle-dl-float-btn";
    floatBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      <span>Tải tài liệu (${data.items.length})</span>
    `;
    document.body.appendChild(floatBtn);

    const modal = document.createElement("div");
    modal.id = "moodle-dl-modal";
    modal.className = "moodle-dl-hidden";
    modal.innerHTML = `
      <div class="moodle-dl-modal-content">
        <div class="moodle-dl-header">
          <div class="moodle-dl-header-title">
            <span class="moodle-dl-badge">Moodle Downloader</span>
            <h3 id="moodle-dl-course-title">${data.courseName}</h3>
          </div>
          <button id="moodle-dl-close" class="moodle-dl-btn-close">&times;</button>
        </div>

        <div class="moodle-dl-toolbar">
          <div class="moodle-dl-stats">
            <span id="moodle-dl-count-badge">Tìm thấy ${data.items.length} tệp</span>
          </div>
          <div class="moodle-dl-selection-actions">
            <button id="moodle-dl-select-all" class="moodle-dl-btn-link">Chọn tất cả</button>
            <span class="moodle-dl-divider">|</span>
            <button id="moodle-dl-deselect-all" class="moodle-dl-btn-link">Bỏ chọn</button>
          </div>
        </div>

        <div class="moodle-dl-options">
          <label class="moodle-dl-checkbox-label">
            <input type="checkbox" id="moodle-dl-opt-zip" checked>
            <span>Nén toàn bộ thành tệp .ZIP (Mặc định)</span>
          </label>
          <label class="moodle-dl-checkbox-label">
            <input type="checkbox" id="moodle-dl-opt-folders" checked>
            <span>Tạo thư mục con theo tuần</span>
          </label>
          <label class="moodle-dl-checkbox-label">
            <input type="checkbox" id="moodle-dl-opt-index">
            <span>Đánh số thứ tự (01_, 02_...)</span>
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
          <button id="moodle-dl-btn-start" class="moodle-dl-btn-primary">
            Tải các tệp đã chọn (${data.items.length})
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    function renderList() {
      const currentData = scanCourseData();
      document.getElementById("moodle-dl-course-title").innerText = currentData.courseName;
      document.getElementById("moodle-dl-count-badge").innerText = `Tìm thấy ${currentData.items.length} tệp`;

      const listContainer = document.getElementById("moodle-dl-file-list");
      listContainer.innerHTML = "";

      const groups = {};
      currentData.items.forEach((item) => {
        if (!groups[item.section]) groups[item.section] = [];
        groups[item.section].push(item);
      });

      for (const [section, sectionItems] of Object.entries(groups)) {
        const groupEl = document.createElement("div");
        groupEl.className = "moodle-dl-section-group";

        const groupHeader = document.createElement("div");
        groupHeader.className = "moodle-dl-section-header";
        groupHeader.innerHTML = `
          <label class="moodle-dl-checkbox-label moodle-dl-sec-title">
            <input type="checkbox" class="moodle-dl-sec-master-chk" data-section="${encodeURIComponent(section)}" checked>
            <span>${section}</span>
          </label>
          <span class="moodle-dl-sec-count">${sectionItems.length} tệp</span>
        `;
        groupEl.appendChild(groupHeader);

        const itemsEl = document.createElement("div");
        itemsEl.className = "moodle-dl-section-items";

        sectionItems.forEach((item) => {
          const itemRow = document.createElement("div");
          itemRow.className = "moodle-dl-item-row";
          itemRow.innerHTML = `
            <label class="moodle-dl-checkbox-label">
              <input type="checkbox" class="moodle-dl-item-chk" data-item-id="${item.id}" data-section="${encodeURIComponent(section)}" checked>
              <span class="moodle-dl-item-name" title="${item.title}">${item.title}</span>
            </label>
          `;
          itemsEl.appendChild(itemRow);
        });

        groupEl.appendChild(itemsEl);
        listContainer.appendChild(groupEl);
      }

      attachEvents();
    }

    function attachEvents() {
      document.querySelectorAll(".moodle-dl-sec-master-chk").forEach((secChk) => {
        secChk.addEventListener("change", (e) => {
          const sec = e.target.getAttribute("data-section");
          document.querySelectorAll(`.moodle-dl-item-chk[data-section="${sec}"]`).forEach((itemChk) => {
            itemChk.checked = e.target.checked;
          });
          updateSelectedCount();
        });
      });

      document.querySelectorAll(".moodle-dl-item-chk").forEach((itemChk) => {
        itemChk.addEventListener("change", () => {
          updateSelectedCount();
        });
      });

      updateSelectedCount();
    }

    function updateSelectedCount() {
      const selected = document.querySelectorAll(".moodle-dl-item-chk:checked").length;
      const startBtn = document.getElementById("moodle-dl-btn-start");
      startBtn.innerText = `Tải các tệp đã chọn (${selected})`;
      startBtn.disabled = selected === 0;
    }

    // Render list immediately so modal is never empty
    renderList();

    floatBtn.addEventListener("click", () => {
      renderList();
      modal.classList.remove("moodle-dl-hidden");
    });

    document.getElementById("moodle-dl-close").addEventListener("click", () => {
      modal.classList.add("moodle-dl-hidden");
    });

    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("moodle-dl-hidden");
    });

    document.getElementById("moodle-dl-select-all").addEventListener("click", () => {
      document.querySelectorAll(".moodle-dl-item-chk, .moodle-dl-sec-master-chk").forEach((c) => (c.checked = true));
      updateSelectedCount();
    });

    document.getElementById("moodle-dl-deselect-all").addEventListener("click", () => {
      document.querySelectorAll(".moodle-dl-item-chk, .moodle-dl-sec-master-chk").forEach((c) => (c.checked = false));
      updateSelectedCount();
    });

    document.getElementById("moodle-dl-btn-start").addEventListener("click", async () => {
      const currentData = scanCourseData();
      const checkedIds = new Set(
        Array.from(document.querySelectorAll(".moodle-dl-item-chk:checked")).map((c) => c.getAttribute("data-item-id"))
      );
      const selectedItems = currentData.items.filter((item) => checkedIds.has(item.id));

      if (selectedItems.length === 0) {
        alert("Vui lòng chọn ít nhất 1 tệp để tải!");
        return;
      }

      const isZip = document.getElementById("moodle-dl-opt-zip").checked;
      const useFolders = document.getElementById("moodle-dl-opt-folders").checked;
      const addIndex = document.getElementById("moodle-dl-opt-index").checked;

      const progressBox = document.getElementById("moodle-dl-progress-box");
      const fill = document.getElementById("moodle-dl-progress-bar-fill");
      const statusText = document.getElementById("moodle-dl-progress-status");
      const percentText = document.getElementById("moodle-dl-progress-percent");

      progressBox.classList.remove("moodle-dl-hidden");
      document.getElementById("moodle-dl-btn-start").disabled = true;

      if (isZip) {
        await downloadAsZip({
          courseName: currentData.courseName,
          items: selectedItems,
          useFolders,
          addIndex,
          onProgress: (p) => {
            const pct = Math.round((p.current / p.total) * 100) || 0;
            fill.style.width = `${pct}%`;
            percentText.innerText = `${pct}%`;
            statusText.innerText = p.status || p.currentFile;
            if (p.isDone) {
              document.getElementById("moodle-dl-btn-start").disabled = false;
            }
          }
        });
      } else {
        chrome.runtime.sendMessage({
          action: "START_DOWNLOAD",
          data: {
            courseName: currentData.courseName,
            items: selectedItems,
            useFolders,
            addIndex
          }
        });
      }
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "SCAN_RESOURCES") {
      const data = scanCourseData();
      sendResponse(data);
      return true;
    }

    if (message.action === "DOWNLOAD_PROGRESS") {
      const progressBox = document.getElementById("moodle-dl-progress-box");
      const fill = document.getElementById("moodle-dl-progress-bar-fill");
      const statusText = document.getElementById("moodle-dl-progress-status");
      const percentText = document.getElementById("moodle-dl-progress-percent");

      if (progressBox && fill && statusText && percentText) {
        progressBox.classList.remove("moodle-dl-hidden");
        const percent = Math.round((message.current / message.total) * 100) || 0;
        fill.style.width = `${percent}%`;
        percentText.innerText = `${percent}%`;

        if (message.isDone) {
          statusText.innerText = `Đã hoàn tất tải ${message.total} tệp!`;
          const startBtn = document.getElementById("moodle-dl-btn-start");
          if (startBtn) startBtn.disabled = false;
        } else {
          statusText.innerText = `Đang tải (${message.current}/${message.total}): ${message.currentFile}`;
        }
      }
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectUI);
  } else {
    injectUI();
  }
})();
