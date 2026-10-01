// background.js - Manages file downloading and directory structuring

let downloadState = {
  isDownloading: false,
  total: 0,
  current: 0,
  currentFile: "",
  errors: []
};

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

function fixDuplicateExtension(name) {
  if (!name) return "file";
  return name.replace(/(\.[a-zA-Z0-9]{2,5})\1+$/i, "$1");
}

// Resolve true pluginfile.php URL and filename
async function resolveFileInfo(url, fallbackTitle) {
  try {
    let targetUrl = url;
    if (targetUrl.includes("/mod/resource/view.php") && !targetUrl.includes("redirect=1")) {
      targetUrl += (targetUrl.includes("?") ? "&" : "?") + "redirect=1";
    }

    const response = await fetch(targetUrl, { credentials: "include" });

    // Case 1: Redirected to pluginfile.php
    if (response.url && response.url.includes("/pluginfile.php/")) {
      let finalUrl = response.url;
      if (!finalUrl.includes("forcedownload=1")) {
        finalUrl += (finalUrl.includes("?") ? "&" : "?") + "forcedownload=1";
      }

      let detectedName = "";
      const disposition = response.headers.get("content-disposition");
      if (disposition) {
        const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
        if (utfMatch && utfMatch[1]) detectedName = decodeURIComponent(utfMatch[1]);
        else {
          const std = disposition.match(/filename=["']?([^"';]+)["']?/i);
          if (std && std[1]) detectedName = std[1].trim();
        }
      }

      let ext = "";
      if (detectedName && detectedName.includes(".")) {
        ext = detectedName.substring(detectedName.lastIndexOf(".")).toLowerCase();
      }

      let finalName = detectedName || fallbackTitle || "file";
      if (ext && !finalName.toLowerCase().endsWith(ext)) finalName += ext;
      finalName = fixDuplicateExtension(finalName);

      return { finalUrl, finalName };
    }

    // Case 2: Embed HTML page wrapper
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      const html = await response.text();
      const match = html.match(/(?:href|src|data)=["']([^"']*\/pluginfile\.php\/[^"']*)["']/i);
      if (match && match[1]) {
        let extracted = match[1].replace(/&amp;/g, "&");
        if (!extracted.includes("forcedownload=1")) {
          extracted += (extracted.includes("?") ? "&" : "?") + "forcedownload=1";
        }

        let finalName = fallbackTitle || "file";
        if (!/\.[a-zA-Z0-9]{2,5}$/i.test(finalName)) {
          finalName += ".pdf";
        }
        finalName = fixDuplicateExtension(finalName);

        return { finalUrl: extracted, finalName };
      }
    }

    let finalName = fallbackTitle || "file";
    if (!/\.[a-zA-Z0-9]{2,5}$/i.test(finalName)) finalName += ".pdf";
    finalName = fixDuplicateExtension(finalName);
    return { finalUrl: targetUrl, finalName };
  } catch (err) {
    let finalName = fallbackTitle || "file";
    if (!/\.[a-zA-Z0-9]{2,5}$/i.test(finalName)) finalName += ".pdf";
    finalName = fixDuplicateExtension(finalName);
    return { finalUrl: url, finalName };
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
      const { finalUrl, finalName } = await resolveFileInfo(item.url, item.title);
      let filename = sanitize(finalName || item.title);
      filename = fixDuplicateExtension(filename);

      if (addIndex) {
        const prefix = String(i + 1).padStart(2, "0");
        filename = `${prefix}_${filename}`;
      }

      const cleanSection = sanitize(item.section || "Chung");
      let fullPath = "";
      if (useFolders) {
        fullPath = `${cleanCourse}/${cleanSection}/${filename}`;
      } else {
        fullPath = `${cleanCourse}/${filename}`;
      }

      await new Promise((resolve) => {
        chrome.downloads.download(
          {
            url: finalUrl,
            filename: fullPath,
            conflictAction: "uniquify"
          },
          (downloadId) => {
            if (chrome.runtime.lastError) {
              console.warn("Download error for:", fullPath, chrome.runtime.lastError.message);
              downloadState.errors.push({ file: item.title, error: chrome.runtime.lastError.message });
              resolve();
            } else {
              resolve(downloadId);
            }
          }
        );
      });

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

  chrome.runtime.sendMessage(payload).catch(() => {});
  chrome.tabs.query({ active: true }, (tabs) => {
    tabs.forEach((tab) => {
      chrome.tabs.sendMessage(tab.id, payload).catch(() => {});
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "START_DOWNLOAD") {
    processDownloads(message.data).then(sendResponse);
    return true;
  }

  if (message.action === "GET_STATUS") {
    sendResponse(downloadState);
    return true;
  }
});
