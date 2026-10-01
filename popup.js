// popup.js - Extension popup controller (Direct file downloads)

let courseData = { courseName: "", items: [] };

document.addEventListener("DOMContentLoaded", async () => {
  const notMoodleView = document.getElementById("not-moodle-view");
  const courseView = document.getElementById("course-view");
  const courseNameEl = document.getElementById("course-name");
  const badgeCount = document.getElementById("badge-count");
  const fileListEl = document.getElementById("file-list");
  const startBtn = document.getElementById("btn-start-download");
  const selectAllBtn = document.getElementById("btn-select-all");
  const deselectAllBtn = document.getElementById("btn-deselect-all");
  const rescanBtn = document.getElementById("btn-rescan");

  const progressBox = document.getElementById("progress-container");
  const progressBarFill = document.getElementById("progress-bar-fill");
  const progressStatus = document.getElementById("progress-status");
  const progressPercent = document.getElementById("progress-percent");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url || !tab.url.includes("/course/view.php")) {
    notMoodleView.classList.remove("hidden");
    courseView.classList.add("hidden");
    return;
  }

  notMoodleView.classList.add("hidden");
  courseView.classList.remove("hidden");

  async function loadData() {
    try {
      courseNameEl.innerText = "Đang quét dữ liệu môn học...";
      fileListEl.innerHTML = "<p style='padding: 12px; font-size: 12px; color: #64748b;'>Đang tải danh sách tài liệu...</p>";

      let response = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { action: "SCAN_RESOURCES" }, (res) => {
          if (chrome.runtime.lastError || !res) {
            resolve(null);
          } else {
            resolve(res);
          }
        });
      });

      if (!response) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"]
        });
        await new Promise((r) => setTimeout(r, 200));
        response = await new Promise((resolve) => {
          chrome.tabs.sendMessage(tab.id, { action: "SCAN_RESOURCES" }, (res) => resolve(res || null));
        });
      }

      if (!response || response.items.length === 0) {
        courseNameEl.innerText = tab.title || "Moodle Course";
        badgeCount.innerText = "0 tệp";
        fileListEl.innerHTML = "<p style='padding: 12px; font-size: 12px; color: #64748b;'>Không tìm thấy tệp tài liệu nào trong khóa học này.</p>";
        startBtn.disabled = true;
        return;
      }

      courseData = response;
      courseNameEl.innerText = courseData.courseName;
      badgeCount.innerText = `${courseData.items.length} tệp`;
      renderFiles();
    } catch (err) {
      console.error(err);
      courseNameEl.innerText = "Lỗi khi quét";
      fileListEl.innerHTML = `<p style='padding: 12px; font-size: 12px; color: #ef4444;'>Không thể kết nối đến trang web. Hãy thử tải lại trang (F5).</p>`;
    }
  }

  function renderFiles() {
    fileListEl.innerHTML = "";

    const groups = {};
    courseData.items.forEach((item) => {
      if (!groups[item.section]) groups[item.section] = [];
      groups[item.section].push(item);
    });

    for (const [section, sectionItems] of Object.entries(groups)) {
      const groupEl = document.createElement("div");
      groupEl.className = "section-group";

      const header = document.createElement("div");
      header.className = "section-head";
      header.innerHTML = `
        <label class="checkbox-container section-name">
          <input type="checkbox" class="sec-chk" data-sec="${encodeURIComponent(section)}" checked>
          <span>${section}</span>
        </label>
        <span class="section-badge">${sectionItems.length} tệp</span>
      `;
      groupEl.appendChild(header);

      sectionItems.forEach((item) => {
        const row = document.createElement("div");
        row.className = "item-row";
        row.innerHTML = `
          <label class="checkbox-container">
            <input type="checkbox" class="item-chk" data-id="${item.id}" data-sec="${encodeURIComponent(section)}" checked>
            <span class="item-name" title="${item.title}">${item.title}</span>
          </label>
        `;
        groupEl.appendChild(row);
      });

      fileListEl.appendChild(groupEl);
    }

    bindSelectionEvents();
  }

  function bindSelectionEvents() {
    document.querySelectorAll(".sec-chk").forEach((chk) => {
      chk.addEventListener("change", (e) => {
        const sec = e.target.getAttribute("data-sec");
        document.querySelectorAll(`.item-chk[data-sec="${sec}"]`).forEach((itemChk) => {
          itemChk.checked = e.target.checked;
        });
        updateCount();
      });
    });

    document.querySelectorAll(".item-chk").forEach((chk) => {
      chk.addEventListener("change", updateCount);
    });

    updateCount();
  }

  function updateCount() {
    const checkedCount = document.querySelectorAll(".item-chk:checked").length;
    startBtn.innerText = `Tải các tệp đã chọn (${checkedCount})`;
    startBtn.disabled = checkedCount === 0;
  }

  selectAllBtn.addEventListener("click", () => {
    document.querySelectorAll(".sec-chk, .item-chk").forEach((c) => (c.checked = true));
    updateCount();
  });

  deselectAllBtn.addEventListener("click", () => {
    document.querySelectorAll(".sec-chk, .item-chk").forEach((c) => (c.checked = false));
    updateCount();
  });

  rescanBtn.addEventListener("click", loadData);

  startBtn.addEventListener("click", () => {
    const checkedIds = new Set(
      Array.from(document.querySelectorAll(".item-chk:checked")).map((c) => c.getAttribute("data-id"))
    );
    const selectedItems = courseData.items.filter((i) => checkedIds.has(i.id));

    if (selectedItems.length === 0) return;

    const useFolders = document.getElementById("opt-folders").checked;
    const addIndex = document.getElementById("opt-index").checked;

    progressBox.classList.remove("hidden");
    progressBarFill.style.width = "0%";
    progressPercent.innerText = "0%";
    progressStatus.innerText = "Đang bắt đầu tải...";
    startBtn.disabled = true;

    chrome.runtime.sendMessage({
      action: "START_DOWNLOAD",
      data: {
        courseName: courseData.courseName,
        items: selectedItems,
        useFolders,
        addIndex
      }
    });
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "DOWNLOAD_PROGRESS") {
      progressBox.classList.remove("hidden");
      const percent = Math.round((msg.current / msg.total) * 100) || 0;
      progressBarFill.style.width = `${percent}%`;
      progressPercent.innerText = `${percent}%`;

      if (msg.isDone) {
        progressStatus.innerText = `Hoàn tất tải ${msg.total} tệp!`;
        startBtn.disabled = false;
      } else {
        progressStatus.innerText = `Đang tải (${msg.current}/${msg.total}): ${msg.currentFile}`;
      }
    }
  });

  loadData();
});
