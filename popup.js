const db = new Dexie("ImageVaultDB");
db.version(2).stores({
  images: "id, uploaded",
  settings: "key"
});

const MAX_IMAGES = 6;
const AUTO_LOCK_MINUTES = 60; // 1 hour

// Elements
const uploadButton = document.getElementById("uploadButton");
const fileInput = document.getElementById("fileInput");
const gallery = document.getElementById("gallery");
const emptyState = document.getElementById("emptyState");
const imageCount = document.getElementById("imageCount");
const storageFill = document.getElementById("storageFill");
const storageText = document.getElementById("storageText");
const maxImages = document.getElementById("maxImages");
const uploadMessage = document.getElementById("uploadMessage");
const privacyStatus = document.getElementById("privacyStatus");
const privacyTimer = document.getElementById("privacyTimer");

const privacyToggle = document.getElementById("privacyToggle");
const passwordContainer = document.getElementById("passwordContainer");
const privacyPasswordInput = document.getElementById("privacyPassword");
const privacySubmit = document.getElementById("privacySubmit");
const forgotPassword = document.getElementById("forgotPassword");

const clearAllBtn = document.getElementById("clearAllBtn");
const notification = document.getElementById("notification");
const notificationText = document.getElementById("notificationText");

const sortOrderBtn = document.getElementById("sortOrderBtn");
const sortOrderLabel = document.getElementById("sortOrderLabel");
const sortCriteriaSelect = document.getElementById("sortCriteria");
const timerToggle = document.getElementById("timerToggle");
const timerSetting = document.getElementById("timer-setting")

let privacyMode = false; // Start in default mode
let privacyLocked = false;
let isSendingImage = false; 
let unlockTimer = null;
let timeLeft = AUTO_LOCK_MINUTES * 60;
let selectedImageId = null;
let sortCriteria = "date";
let sortAscending = true;
let timerEnabled = true;
let isPasswordModalClosing = false;

privacyToggle.checked = privacyMode;

// TAC Input Helper Functions
function getTACValue() {
  const digits = document.querySelectorAll('.tac-digit');
  return Array.from(digits).map(input => input.value).join('');
}

function clearTACInput() {
  const digits = document.querySelectorAll('.tac-digit');
  digits.forEach(input => input.value = '');
  digits[0]?.focus();
}

function setupTACInput() {
  const digits = document.querySelectorAll('.tac-digit');
  
  digits.forEach((input, index) => {
    // Only allow numbers
    input.addEventListener('input', (e) => {
      const value = e.target.value;
      
      // Remove non-numeric characters
      if (!/^\d*$/.test(value)) {
        e.target.value = '';
        return;
      }
      
      // Auto-focus next input
      if (value && index < digits.length - 1) {
        digits[index + 1].focus();
      }
    });
    
    // Handle backspace
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && index > 0) {
        digits[index - 1].focus();
      }
      
      // Handle Enter key
      if (e.key === 'Enter') {
        privacySubmit.click();
      }
    });
    
    // Handle paste
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
      
      pastedData.split('').forEach((char, i) => {
        if (digits[i]) {
          digits[i].value = char;
        }
      });
      
      // Focus the next empty input or the last one
      const nextEmpty = Array.from(digits).findIndex(d => !d.value);
      if (nextEmpty !== -1) {
        digits[nextEmpty].focus();
      } else {
        digits[3].focus();
      }
    });
  });
}

// Prevent right-click context menu
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  showNotification("Right-click is disabled for security", "warning");
  return false;
});

// Prevent keyboard shortcuts for dev tools
document.addEventListener('keydown', (e) => {
  if (
    e.key === 'F12' ||
    (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
    (e.ctrlKey && e.key === 'u')
  ) {
    e.preventDefault();
    showNotification("Developer tools are disabled for security", "warning");
    return false;
  }
  
  // Escape key to close password modal
  if (e.key === 'Escape') {
    const modal = document.getElementById('passwordModal');
    if (modal.classList.contains('show')) {
      closePasswordModal();
    }
  }
});

// Show notification
function showNotification(message, type = "info") {
  notificationText.textContent = message;
  notification.className = "notification";
  notification.classList.add(type);
  notification.classList.add("show");
  
  setTimeout(() => {
    notification.classList.remove("show");
  }, 3000);
}

// Format time
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs.toString().padStart(2, '0')}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs.toString().padStart(2, '0')}s`;
  } else {
    return `${secs}s`;
  }
}

// Start unlock timer (for default mode countdown)
function startUnlockTimer() {
  // Only start timer if it's enabled
  if (!timerEnabled) {
    updateTimerDisplay();
    return;
  }
  
  if (unlockTimer) {
    clearInterval(unlockTimer);
  }
  
  timeLeft = AUTO_LOCK_MINUTES * 60;
  updateTimerDisplay();
  
  unlockTimer = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    
    if (timeLeft <= 0) {
      clearInterval(unlockTimer);
      switchToPrivacyMode();
    }
  }, 1000);
}

/// Update timer display
function updateTimerDisplay() {
  if (privacyMode) {
    privacyTimer.textContent = "Locked";
  } else {
    if (timerEnabled) {
      privacyTimer.textContent = `Auto-lock to Privacy Mode in ${formatTime(timeLeft)}`;
      privacyTimer.style.color = "#fbbf24";
    } else {
      privacyTimer.textContent = "Auto-lock disabled";
      privacyTimer.style.color = "#94a3b8";
    }
  }
}

//Show password modal
function showPasswordModal(mode = "unlock") {
  const modal = document.getElementById("passwordModal");
  modal.classList.add("show");

  clearTACInput();
  
  // Setup TAC input ONLY ONCE on first modal open
  const firstDigit = document.querySelector('.tac-digit');
  if (!firstDigit.hasAttribute('data-setup')) {
    setupTACInput();
    document.querySelectorAll('.tac-digit').forEach(input => {
      input.setAttribute('data-setup', 'true');
    });
  }

  if (mode === "set") {
    passwordContainer.querySelector("h3").innerHTML =
      '<i class="fas fa-key"></i> Set Privacy Password';
    passwordContainer.querySelector("p").textContent =
      "Create a 4-digit password for Privacy Mode";
    privacySubmit.innerHTML =
      '<i class="fas fa-check"></i> Set Password';
  } else {
    passwordContainer.querySelector("h3").innerHTML =
      '<i class="fas fa-lock"></i> Privacy Mode Locked';
    passwordContainer.querySelector("p").textContent =
      "Enter password to unlock Privacy Mode";
    privacySubmit.innerHTML =
      '<i class="fas fa-unlock"></i> Unlock';
  }
  
  // Focus first input
  setTimeout(() => {
    document.querySelector('.tac-digit').focus();
  }, 100);
}

function closePasswordModal() {
  document.getElementById("passwordModal").classList.remove("show");
  clearTACInput();
  
  // Reset toggle to match actual privacy mode state
  privacyToggle.checked = privacyMode;
  
  // Set flag to prevent immediate Enter key actions
  isPasswordModalClosing = true;
  setTimeout(() => {
    isPasswordModalClosing = false;
  }, 500); // 500ms delay to prevent accidental image sending
}

document.getElementById("cancelPassword").addEventListener("click", () => {
  closePasswordModal();
});

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  maxImages.textContent = MAX_IMAGES;
  
  // Check if password exists
  const hasPassword = await checkPassword();

  // Load timer setting
  const timerSettingRecord = await db.settings.get("timerEnabled");
  if (timerSettingRecord !== undefined && timerSettingRecord !== null) {
    timerEnabled = timerSettingRecord.value;
    timerToggle.checked = timerEnabled;
  }
  
  // Check privacy mode state
  const unlockRecord = await db.settings.get("privacyUnlockTime");
  if (unlockRecord) {
    const unlockTime = new Date(unlockRecord.value);
    const now = new Date();
    const diffMs = now - unlockTime;
    const diffMinutes = diffMs / (1000 * 60);

    if (diffMinutes >= AUTO_LOCK_MINUTES) {
      // Auto-switch to privacy mode after 1 hour
      await switchToPrivacyMode();
    } else {
      // Still in default mode, start countdown
      privacyMode = false;
      privacyLocked = false;
      privacyToggle.checked = false;
      
      // Calculate remaining time
      const remainingMs = (AUTO_LOCK_MINUTES * 60 * 1000) - diffMs;
      timeLeft = Math.floor(remainingMs / 1000);
      
      if (timeLeft > 0) {
        startUnlockTimer();
      }
    }
  } else {
    // First time or no unlock record - start in default mode
    privacyMode = false;
    privacyLocked = false;
    privacyToggle.checked = false;
    
    if (hasPassword) {
      // If password exists, start countdown
      const unlockTime = new Date().toISOString();
      await db.settings.put({ key: "privacyUnlockTime", value: unlockTime });
      startUnlockTimer();
    }
  }
  
  await loadGallery();
  updateUIForPrivacyMode();
});

// Events
uploadButton.addEventListener("click", () => {
  if (privacyMode) {
    showNotification("Switch to Default Mode to upload images", "error");
    return;
  }
  fileInput.click();
});

fileInput.addEventListener("change", handleFileUpload);

// Update UI based on privacy mode
function updateUIForPrivacyMode() {
  const privacyStatusSpan = privacyStatus.querySelector("span");
  
  // Update footer text
  document.querySelector(".help-text small").textContent = 
    `Image Vault v2.3 • Auto-switches to Privacy Mode after 1 hour`;

  if (privacyMode) {
    // Privacy mode is active
    privacyStatusSpan.textContent = "Active";
    privacyStatus.classList.add("active");
    uploadMessage.textContent = "Privacy Mode: Images are protected";
    uploadMessage.style.color = "#f87171";
    privacyTimer.textContent = "Locked";
    privacyToggle.checked = true;
    document.body.classList.add("privacy-locked");
    clearAllBtn.style.display = "none"; //remove clear all image btn
    timerSetting.style.display = "none";
    
    closePasswordModal();
  } else {
    // Default mode is active
    privacyStatusSpan.textContent = "Inactive";
    privacyStatus.classList.remove("active");
    uploadMessage.textContent = "Default Mode: Upload and manage images";
    uploadMessage.style.color = "#94a3b8";
    privacyToggle.checked = false;
    document.body.classList.remove("privacy-locked");
    timerSetting.style.display = "flex";
    
    // Only show Clear All button if there are images
    db.images.count().then(count => {
      clearAllBtn.style.display = count > 0 ? "flex" : "none";
    });
    
    closePasswordModal();
  }
}

// Update storage indicator
async function updateStorageIndicator() {
  const existingImages = await db.images.count();
  const percentage = (existingImages / MAX_IMAGES) * 100;
  
  imageCount.textContent = existingImages;
  storageFill.style.width = `${percentage}%`;
  storageText.textContent = `${existingImages}/${MAX_IMAGES} images`;
  
  if (percentage >= 90) {
    storageFill.style.background = "linear-gradient(90deg, #ef4444, #f87171)";
  } else if (percentage >= 70) {
    storageFill.style.background = "linear-gradient(90deg, #f59e0b, #fbbf24)";
  } else {
    storageFill.style.background = "linear-gradient(90deg, #3b82f6, #8b5cf6)";
  }
}

async function handleFileUpload(e) {
  if (privacyMode) {
    showNotification("Switch to Default Mode to upload images", "error");
    fileInput.value = "";
    return;
  }
  
  const existingImages = await db.images.count();
  const files = Array.from(e.target.files);
  const available = MAX_IMAGES - existingImages;

  if (existingImages >= MAX_IMAGES) {
    showNotification("Maximum limit of 6 images reached.", "error");
    return;
  }

  if (files.length > available) {
    showNotification(`Only ${available} more image(s) can be added.`, "warning");
    files.length = available;
  }

  const filesToUpload = files.slice(0, available);
  
  if (filesToUpload.length === 0) return;
  
  showNotification(`Uploading ${filesToUpload.length} image(s)...`, "info");
  
  for (let i = 0; i < filesToUpload.length; i++) {
    await new Promise(resolve => {
      setTimeout(async () => {
        await saveImage(filesToUpload[i]);
        resolve();
      }, i * 200);
    });
  }
  
  fileInput.value = "";
}

async function saveImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        await db.images.put({
          id: crypto.randomUUID(),
          name: file.name,
          type: file.type,
          dataURL: ev.target.result,
          uploaded: new Date().toISOString()
        });
        
        await loadGallery();
        showNotification(`"${file.name}" uploaded successfully!`, "success");
        resolve();
      } catch (error) {
        console.error("Error saving image:", error);
        showNotification("Error uploading image.", "error");
        reject(error);
      }
    };
    reader.onerror = () => {
      showNotification("Error reading file.", "error");
      reject(new Error("File read error"));
    };
    reader.readAsDataURL(file);
  });
}

async function loadGallery() {
  const images = await db.images.toArray();
  gallery.innerHTML = "";

  await updateStorageIndicator();

  if (!images.length) {
    emptyState.style.display = "block";
    gallery.appendChild(emptyState);
    selectedImageId = null;
    clearAllBtn.style.display = "none"; // Hide when no images
    return;
  } else {
    emptyState.style.display = "none";
    // Show Clear All button only in default mode when there are images
    if (!privacyMode) {
      clearAllBtn.style.display = "flex";
    }
  }

  // Sort images
  const sortedImages = [...images].sort((a, b) => {
    let valA, valB;

    switch (sortCriteria) {
      case "date":
        valA = new Date(a.uploaded).getTime();
        valB = new Date(b.uploaded).getTime();
        break;
      case "size":
        valA = a.dataURL.length;
        valB = b.dataURL.length;
        break;
      default:
        valA = new Date(a.uploaded).getTime();
        valB = new Date(b.uploaded).getTime();
    }

    if (valA < valB) return sortAscending ? -1 : 1;
    if (valA > valB) return sortAscending ? 1 : -1;
    return 0;
  });

  sortedImages.forEach((img, index) => {
    const div = document.createElement("div");
    div.className = "item";
    div.dataset.id = img.id;

    div.innerHTML = `
      <button class="delete-x" data-id="${img.id}" title="Delete image">&times;</button>
      <img src="${img.dataURL}" alt="${img.name}">
      
      <div class="image-name">
        ${img.name}
      </div>

      <button class="select-image-btn" data-id="${img.id}">
        <i class="fas fa-paper-plane"></i> ${privacyMode ? "Locked" : "Select"}
      </button>
    `;

    // Click to select
    div.addEventListener("click", () => {
      const prev = gallery.querySelector(".item.selected");
      if (prev) prev.classList.remove("selected");
      div.classList.add("selected");
      selectedImageId = img.id;
    });

    // Delete button
    const deleteBtn = div.querySelector(".delete-x");
    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      
      if (privacyMode) {
        const record = await db.settings.get("privacyPassword");
        const entered = prompt("Enter privacy password to delete this image:");
        if (entered !== record?.value) {
          showNotification("Wrong password. Deletion cancelled.", "error");
          return;
        }
      }
      
      if (confirm("Are you sure you want to delete this image?")) {
        await db.images.delete(img.id);
        selectedImageId = null;
        await loadGallery();
        showNotification("Image deleted successfully.", "success");
      }
    });

    // Select button (inject)
    const selectBtn = div.querySelector(".select-image-btn");
    selectBtn.addEventListener("click", async () => {
      if (privacyMode) {
        showNotification("Switch to Default Mode to use images", "warning");
        return;
      }
      
      if (selectBtn.disabled) return;
      selectBtn.disabled = true;
      selectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
      try {
        const selected = await db.images.get(img.id);
        await sendImageToTab(selected);
      } finally {
        setTimeout(() => {
          selectBtn.disabled = false;
          selectBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Select';
        }, 1000);
      }
    });

    gallery.appendChild(div);

    // Auto-select first image
    if (index === 0) {
      div.classList.add("selected");
      selectedImageId = img.id;
    }
  });
}

sortOrderBtn.addEventListener("click", () => {
  sortAscending = !sortAscending;

  const icon = sortOrderBtn.querySelector("i");
  icon.className = sortAscending 
    ? "fas fa-sort-amount-down"
    : "fas fa-sort-amount-up";

  sortOrderLabel.textContent = sortAscending ? "Asc" : "Desc";

  loadGallery();
});

sortCriteriaSelect.addEventListener("change", () => {
  loadGallery();
});

// Timer toggle handler
timerToggle.addEventListener("change", async () => {
  timerEnabled = timerToggle.checked;
  
  // Save timer setting immediately
  await db.settings.put({ key: "timerEnabled", value: timerEnabled });
  
  if (timerEnabled && !privacyMode) {
    // Start the timer
    startUnlockTimer();
    showNotification("Auto-lock timer enabled", "info");
  } else if (!timerEnabled) {
    // Stop the timer
    if (unlockTimer) {
      clearInterval(unlockTimer);
      unlockTimer = null;
    }
    updateTimerDisplay();
    showNotification("Auto-lock timer disabled", "info");
  }
});

// Global keyboard listener
document.addEventListener("keydown", async (e) => {
  // Don't handle any gallery keyboard shortcuts if password modal is open or just closed
  const modal = document.getElementById('passwordModal');
  if (modal.classList.contains('show') || isPasswordModalClosing) {
    return; // Let the password modal handle all keys or prevent action if just closed
  }

  const items = Array.from(gallery.querySelectorAll(".item"));
  if (!items.length) return;

  let selectedIndex = items.findIndex(div => div.classList.contains("selected"));

  if (e.key === "ArrowLeft") {
    if (selectedIndex === -1) selectedIndex = 0;
    else selectedIndex = (selectedIndex - 1 + items.length) % items.length;
    updateSelection(items, selectedIndex);
  }

  if (e.key === "ArrowRight") {
    if (selectedIndex === -1) selectedIndex = 0;
    else selectedIndex = (selectedIndex + 1) % items.length;
    updateSelection(items, selectedIndex);
  }

  if (e.key === "Enter" && selectedIndex !== -1) {
    const selectedId = items[selectedIndex].dataset.id;
    const img = await db.images.get(selectedId);
    if (!img) return;

    if (privacyMode) {
      showNotification("Switch to Default Mode to use images", "warning");
      return;
    }

    await sendImageToTab(img);
  }

  if (e.key === "Delete" && selectedIndex !== -1) {
    const selectedId = items[selectedIndex].dataset.id;
    const img = await db.images.get(selectedId);
    if (!img) return;

    if (privacyMode) {
      const record = await db.settings.get("privacyPassword");
      const entered = prompt("Enter privacy password to delete this image:");
      if (entered !== record?.value) {
        showNotification("Wrong password. Deletion cancelled.", "error");
        return;
      }
    }

    if (confirm(`Are you sure you want to delete "${img.name}"?`)) {
      await db.images.delete(selectedId);
      await loadGallery();
      showNotification("Image deleted successfully.", "success");
    }
  }
});

// Helper function to update selection
function updateSelection(items, newIndex) {
  items.forEach(div => div.classList.remove("selected"));
  const newSelected = items[newIndex];
  if (!newSelected) return;
  newSelected.classList.add("selected");
  selectedImageId = newSelected.dataset.id;
  newSelected.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
}

// Send image to current tab
async function sendImageToTab(imageData) {
  if (isSendingImage) {
    showNotification("Please wait, sending previous image...", "warning");
    return;
  }

  isSendingImage = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      throw new Error("NO_ACTIVE_TAB");
    }

    if (
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://") ||
      tab.url.startsWith("about:")
    ) {
      throw new Error("RESTRICTED_PAGE");
    }

    try {
      await chrome.tabs.sendMessage(tab.id, {
        action: "inject-image",
        dataURL: imageData.dataURL,
        fileName: imageData.name,
        timestamp: Date.now()
      });

      showNotification(`"${imageData.name}" sent to page successfully!`, "success");

    } catch {
      if (!chrome?.scripting?.executeScript) {
        throw new Error("SCRIPTING_API_UNAVAILABLE");
      }

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content-script.js"]
      });

      await new Promise(r => setTimeout(r, 150));

      await chrome.tabs.sendMessage(tab.id, {
        action: "inject-image",
        dataURL: imageData.dataURL,
        fileName: imageData.name,
        timestamp: Date.now()
      });

      showNotification(`"${imageData.name}" sent to page successfully!`, "success");
    }

  } catch (error) {
    console.error("Send image error:", error);

    switch (error.message) {
      case "NO_ACTIVE_TAB":
        showNotification("No active tab found.", "error");
        break;
      case "RESTRICTED_PAGE":
        showNotification("This page does not allow image injection.", "error");
        break;
      case "SCRIPTING_API_UNAVAILABLE":
        showNotification("Image injection is unavailable on this page.", "error");
        break;
      default:
        showNotification("Unable to inject image on this webpage.", "error");
    }

  } finally {
    isSendingImage = false;
  }
}

// Privacy toggle handler
privacyToggle.addEventListener("change", async () => {
  if (privacyToggle.checked) {
    // User wants to switch from DEFAULT to PRIVACY mode
    const record = await db.settings.get("privacyPassword");

    if (!record) {
      // No password set - show modal to set password
      showPasswordModal("set");
      privacySubmit.onclick = async () => {
        const newPass = getTACValue();
        
        if (!/^\d{4}$/.test(newPass)) {
          showNotification("Password must be exactly 4 digits (0–9)", "error");
          clearTACInput();
          return;
        }
        
        await db.settings.put({ key: "privacyPassword", value: newPass });
        closePasswordModal();
        
        // Switch to privacy mode
        await switchToPrivacyMode();
        showNotification("Privacy Mode enabled with new password", "success");
      };
    } else {
      // Password exists - prompt for password to switch to privacy mode
      showPasswordModal("unlock");
      privacySubmit.onclick = async () => {
        const entered = getTACValue();
        
        if (entered === record.value) {
          // Correct password - switch to privacy mode
          closePasswordModal();
          await switchToPrivacyMode();
          showNotification("Switched to Privacy Mode", "success");

        } else if (entered === "") {
          showNotification("Please enter password", "error");
          clearTACInput();

        } else {
          showNotification("Incorrect password", "error");
          clearTACInput();
        }
      };
    }
  } else {
    // User wants to switch from PRIVACY to DEFAULT mode - require password
    const record = await db.settings.get("privacyPassword");
    
    if (!record) {
      // No password set (shouldn't happen, but handle it)
      await switchToDefaultMode();
      showNotification("Switched to Default Mode", "success");
    } else {
      // Password exists - prompt for password to switch to default mode
      showPasswordModal("unlock");
      
      // Update modal text for switching to default mode
      passwordContainer.querySelector("h3").innerHTML =
        '<i class="fas fa-unlock"></i> Switch to Default Mode';
      passwordContainer.querySelector("p").textContent =
        "Enter password to switch to Default Mode";
      privacySubmit.innerHTML =
        '<i class="fas fa-unlock"></i> Unlock';
      
      privacySubmit.onclick = async () => {
        const entered = getTACValue();
        
        if (entered === record.value) {
          // Correct password - switch to default mode
          closePasswordModal();
          await switchToDefaultMode();
          showNotification("Switched to Default Mode", "success");

        } else if (entered === "") {
          showNotification("Please enter password", "error");
          clearTACInput();

        } else {
          showNotification("Incorrect password", "error");
          clearTACInput();
          // Keep the toggle in privacy mode since password was wrong
          privacyToggle.checked = true;
        }
      };
    }
  }
});

// Switch to privacy mode
async function switchToPrivacyMode() {
  privacyMode = true;
  privacyLocked = false;
  
  // Clear timer
  if (unlockTimer) {
    clearInterval(unlockTimer);
    unlockTimer = null;
  }
  
  // Clear unlock time
  await db.settings.delete("privacyUnlockTime");
  
  loadGallery();
  updateUIForPrivacyMode();
}

// Switch to default mode
async function switchToDefaultMode() {
  privacyMode = false;
  privacyLocked = false;
  
  // Set unlock time and start countdown
  const unlockTime = new Date().toISOString();
  await db.settings.put({ key: "privacyUnlockTime", value: unlockTime });
  
  startUnlockTimer();
  loadGallery();
  updateUIForPrivacyMode();
}

// Check if password exists
async function checkPassword() {
  const record = await db.settings.get("privacyPassword");
  return !!record;
}

// Forgot password handler
forgotPassword.addEventListener("click", async () => {
  const confirmReset = confirm("Resetting password will require you to set a new one. Continue?");
  if (!confirmReset) return;
  
  await db.settings.delete("privacyPassword");
  
  // Switch to default mode
  await switchToDefaultMode();
  
  showNotification("Password reset. Set a new password to enable Privacy Mode.", "warning");
});

// Clear all images
clearAllBtn.addEventListener("click", async () => {
  const confirmClear = confirm("Are you sure you want to delete ALL images? This action cannot be undone.");
  if (!confirmClear) return;
  
  if (privacyMode) {
    const record = await db.settings.get("privacyPassword");
    const entered = prompt("Enter privacy password to delete all images:");
    
    if (entered !== record?.value) {
      showNotification("Wrong password. Deletion cancelled.", "error");
      return;
    }
  }
  
  await db.images.clear();
  await loadGallery();
  showNotification("All images deleted successfully.", "success");
});

// Auto-save unlock time periodically in default mode
setInterval(async () => {
  if (!privacyMode) {
    const unlockTime = new Date().toISOString();
    await db.settings.put({ key: "privacyUnlockTime", value: unlockTime });
  }
  
  // Save timer setting
  await db.settings.put({ key: "timerEnabled", value: timerEnabled });
}, 30000); // Save every 30 seconds