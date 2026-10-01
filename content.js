// content.js - Scans Moodle course pages with business logic options & quick filters (Direct downloads)

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

  function cleanSectionTitle(title) {
    if (!title) return "Tài liệu chung (General)";
    return title
      .replace(/(Collapse|Expand)\s*all/gi, "")
      .replace(/(Thu gọn|Mở rộng)\s*tất cả/gi, "")
      .replace(/\s+/g, " ")
      .trim() || "Tài liệu chung";
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

      let sectionName = "Tài liệu chung";
      const sectionEl = link.closest("[data-sectionid], .course-section, li.section.main, li.section, div.section");
      if (sectionEl) {
        const secTitleEl = sectionEl.querySelector(".sectionname, .section-title, h3, h4, [data-for='section_title']");
        if (secTitleEl) {
          const secText = getCleanText(secTitleEl);
          if (secText) sectionName = cleanSectionTitle(secText);
        }
      }

      items.push({
        id: `moodle_item_${idx}`,
        title: title,
        url: rawUrl,
        section: sectionName,
        type: detectFileType(title, rawUrl)
      });
    });

    return { courseName, items };
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

        <!-- Quick Filters -->
        <div class="moodle-dl-toolbar">
          <div class="moodle-dl-stats">
            <span id="moodle-dl-count-badge">Tìm thấy ${data.items.length} tệp</span>
          </div>
          <div class="moodle-dl-filter-group">
            <span style="font-size: 11px; color: #64748b; margin-right: 2px;">Lọc nhanh:</span>
            <button class="moodle-dl-filter-btn active" data-filter="all">Tất cả</button>
            <button class="moodle-dl-filter-btn" data-filter="slides">Chỉ Slide / Bài giảng</button>
            <button class="moodle-dl-filter-btn" data-filter="exercises">Chỉ Bài tập / Lab</button>
            <button class="moodle-dl-filter-btn" data-filter="none">Bỏ chọn</button>
          </div>
        </div>

        <!-- Options Bar -->
        <div class="moodle-dl-options">
          <label class="moodle-dl-checkbox-label">
            <input type="checkbox" id="moodle-dl-opt-course" checked disabled>
            <span style="font-weight: 600;">Tạo thư mục theo tên môn học</span>
          </label>
          <label class="moodle-dl-checkbox-label">
            <input type="checkbox" id="moodle-dl-opt-folders">
            <span>Chia thêm thư mục con theo chương/tuần</span>
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
          <div class="moodle-dl-sec-actions">
            <span class="moodle-dl-sec-count">${sectionItems.length} tệp</span>
            <button class="moodle-dl-toggle-btn" title="Thu gọn / Mở rộng" data-section="${encodeURIComponent(section)}">Thu gọn</button>
          </div>
        `;
        groupEl.appendChild(groupHeader);

        const itemsEl = document.createElement("div");
        itemsEl.className = "moodle-dl-section-items";
        itemsEl.setAttribute("data-section-items", encodeURIComponent(section));

        sectionItems.forEach((item) => {
          const itemRow = document.createElement("div");
          itemRow.className = "moodle-dl-item-row";
          itemRow.innerHTML = `
            <div class="moodle-dl-item-left">
              <label class="moodle-dl-checkbox-label">
                <input type="checkbox" class="moodle-dl-item-chk" data-item-id="${item.id}" data-title="${encodeURIComponent(item.title)}" data-section="${encodeURIComponent(section)}" checked>
                <span class="moodle-dl-item-name" title="${item.title}">${item.title}</span>
              </label>
            </div>
            <span class="moodle-dl-type-badge">${item.type}</span>
          `;
          itemsEl.appendChild(itemRow);
        });

        groupEl.appendChild(itemsEl);
        listContainer.appendChild(groupEl);
      }

      attachEvents();
    }

    function attachEvents() {
      document.querySelectorAll(".moodle-dl-toggle-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const sec = e.target.getAttribute("data-section");
          const target = document.querySelector(`[data-section-items="${sec}"]`);
          if (target) {
            target.classList.toggle("collapsed");
            e.target.innerText = target.classList.contains("collapsed") ? "Mở rộng" : "Thu gọn";
          }
        });
      });

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

      document.querySelectorAll(".moodle-dl-filter-btn").forEach((fBtn) => {
        fBtn.addEventListener("click", (e) => {
          document.querySelectorAll(".moodle-dl-filter-btn").forEach((b) => b.classList.remove("active"));
          e.target.classList.add("active");
          const filter = e.target.getAttribute("data-filter");

          document.querySelectorAll(".moodle-dl-item-chk").forEach((chk) => {
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

          document.querySelectorAll(".moodle-dl-sec-master-chk").forEach((secChk) => {
            const sec = secChk.getAttribute("data-section");
            const allSecItems = document.querySelectorAll(`.moodle-dl-item-chk[data-section="${sec}"]`);
            const checkedSecItems = document.querySelectorAll(`.moodle-dl-item-chk[data-section="${sec}"]:checked`);
            secChk.checked = allSecItems.length > 0 && allSecItems.length === checkedSecItems.length;
          });

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

    document.getElementById("moodle-dl-btn-start").addEventListener("click", () => {
      const currentData = scanCourseData();
      const checkedIds = new Set(
        Array.from(document.querySelectorAll(".moodle-dl-item-chk:checked")).map((c) => c.getAttribute("data-item-id"))
      );
      const selectedItems = currentData.items.filter((item) => checkedIds.has(item.id));

      if (selectedItems.length === 0) {
        alert("Vui lòng chọn ít nhất 1 tệp để tải!");
        return;
      }

      const useFolders = document.getElementById("moodle-dl-opt-folders").checked;
      const addIndex = document.getElementById("moodle-dl-opt-index").checked;

      const progressBox = document.getElementById("moodle-dl-progress-box");
      const fill = document.getElementById("moodle-dl-progress-bar-fill");
      const statusText = document.getElementById("moodle-dl-progress-status");
      const percentText = document.getElementById("moodle-dl-progress-percent");

      progressBox.classList.remove("moodle-dl-hidden");
      document.getElementById("moodle-dl-btn-start").disabled = true;

      chrome.runtime.sendMessage({
        action: "START_DOWNLOAD",
        data: {
          courseName: currentData.courseName,
          items: selectedItems,
          useFolders,
          addIndex
        }
      });
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
