// background.js - Manages file downloading and directory structuring

let downloadState = {
  isDownloading: false,
  total: 0,
  current: 0,
  currentFile: "",
  errors: []
};

// Sanitize string for valid file & folder names across Windows/Mac/Linux
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

// Extract file extension and filename from URL or Content-Disposition
async function resolveFileInfo(url, fallbackTitle) {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      credentials: "include"
    });

    let detectedName = "";
    const disposition = response.headers.get("content-disposition");
    if (disposition) {
      // filename*=UTF-8''... or filename="..."
      const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      if (utfMatch && utfMatch[1]) {
        detectedName = decodeURIComponent(utfMatch[1]);
      } else {
        const standardMatch = disposition.match(/filename=["']?([^"';]+)["']?/i);
        if (standardMatch && standardMatch[1]) {
          detectedName = standardMatch[1].trim();
        }
      }
    }

    // Fallback to URL path
    if (!detectedName && response.url) {
      try {
        const parsed = new URL(response.url);
        const lastPart = parsed.pathname.split("/").filter(Boolean).pop();
        if (lastPart && lastPart.includes(".")) {
          detectedName = decodeURIComponent(lastPart);
        }
      } catch (e) {}
    }

    // Extract extension
    let ext = "";
    if (detectedName && detectedName.includes(".")) {
      ext = detectedName.substring(detectedName.lastIndexOf(".")).toLowerCase();
    }

    // If title already has an extension
    if (fallbackTitle && /\.[a-zA-Z0-9]{2,5}$/i.test(fallbackTitle)) {
      return { finalName: fallbackTitle, ext: "" };
    }

    return {
      finalName: (detectedName || fallbackTitle) + (ext && !fallbackTitle.endsWith(ext) ? ext : ""),
      ext: ext
    };
  } catch (err) {
    // If HEAD request fails, fallback safely
    let ext = "";
    if (fallbackTitle.toLowerCase().includes("pdf") || fallbackTitle.toLowerCase().includes("syllabus")) {
      ext = ".pdf";
    }
    return {
      finalName: fallbackTitle + (fallbackTitle.endsWith(ext) ? "" : ext),
      ext: ext
    };
  }
}

// Main download processor
async function processDownloads({ courseName, items, useFolders = true, addIndex = false }) {
  if (downloadState.isDownloading) {
    return { status: "already_running" };
  }

  downloadState = {
    isDownloading: true,
    total: items.length,
    current: 0,
    currentFile: "",
    errors: []
  };

  const cleanCourse = sanitize(courseName || "Moodle_Course");

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    downloadState.current = i + 1;
    downloadState.currentFile = item.title;

    broadcastProgress();

    try {
      // Add redirect=1 for Moodle resource links if not already present
      let downloadUrl = item.url;
      if (downloadUrl.includes("/mod/resource/view.php") && !downloadUrl.includes("redirect=1")) {
        downloadUrl += (downloadUrl.includes("?") ? "&" : "?") + "redirect=1";
      }

      // Resolve real file info
      const info = await resolveFileInfo(downloadUrl, item.title);
      let filename = sanitize(info.finalName || item.title);

      // Add index prefix if requested (e.g. 01_Syllabus.pdf)
      if (addIndex) {
        const prefix = String(i + 1).padStart(2, "0");
        filename = `${prefix}_${filename}`;
      }

      // Structure directories
      const cleanSection = sanitize(item.section || "Chung");
      let fullPath = "";
      if (useFolders) {
        fullPath = `${cleanCourse}/${cleanSection}/${filename}`;
      } else {
        fullPath = `${cleanCourse}/${filename}`;
      }

      // Trigger download via chrome.downloads API
      await new Promise((resolve, reject) => {
        chrome.downloads.download(
          {
            url: downloadUrl,
            filename: fullPath,
            conflictAction: "uniquify"
          },
          (downloadId) => {
            if (chrome.runtime.lastError) {
              console.warn("Download error for:", fullPath, chrome.runtime.lastError.message);
              downloadState.errors.push({ file: item.title, error: chrome.runtime.lastError.message });
              resolve(); // Continue with next file
            } else {
              resolve(downloadId);
            }
          }
        );
      });

      // Pause briefly between downloads to prevent flooding the browser
      await new Promise((r) => setTimeout(r, 650));
    } catch (err) {
      console.error("Error processing item:", item, err);
      downloadState.errors.push({ file: item.title, error: err.message });
    }
  }

  downloadState.isDownloading = false;
  downloadState.currentFile = "Hoàn tất!";
  broadcastProgress(true);

  return { status: "completed", errors: downloadState.errors };
}

function broadcastProgress(isDone = false) {
  const payload = {
    action: "DOWNLOAD_PROGRESS",
    ...downloadState,
    isDone
  };

  // Notify extension popups or content scripts
  chrome.runtime.sendMessage(payload).catch(() => {});
  chrome.tabs.query({ active: true }, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, payload).catch(() => {});
    });
  });
}

// Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "START_DOWNLOAD") {
    processDownloads(message.data).then(sendResponse);
    return true; // Keep channel open for async response
  }

  if (message.action === "GET_STATUS") {
    sendResponse(downloadState);
    return true;
  }
});
