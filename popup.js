const db = new Dexie("ImageVaultDB");
db.version(2).stores({
  images: "id, uploaded",
  settings: "key"
});

const MAX_IMAGES = 6;
const AUTO_LOCK_MINUTES = 1; // Changed to 1 minute for testing

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
const setPasswordLink = document.getElementById("setPasswordLink");

const setPasswordContainer = document.getElementById("setPasswordContainer");
const newPasswordInput = document.getElementById("newPassword");
const setPasswordBtn = document.getElementById("setPasswordBtn");
const cancelSetPassword = document.getElementById("cancelSetPassword");

const clearAllBtn = document.getElementById("clearAllBtn");
const notification = document.getElementById("notification");
const notificationText = document.getElementById("notificationText");

let privacyMode = true;
let privacyLocked = false;
let isSendingImage = false;
let unlockTimer = null;
let timeLeft = AUTO_LOCK_MINUTES * 60; // seconds

// Prevent right-click context menu
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  showNotification("Right-click is disabled for security", "warning");
  return false;
});

// Prevent keyboard shortcuts for dev tools
document.addEventListener('keydown', (e) => {
  // Disable F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U
  if (
    e.key === 'F12' ||
    (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
    (e.ctrlKey && e.key === 'u')
  ) {
    e.preventDefault();
    showNotification("Developer tools are disabled for security", "warning");
    return false;
  }
  
  // Escape key to close password modals
  if (e.key === 'Escape') {
    if (passwordContainer.style.display === 'block') {
      privacyToggle.checked = false;
      privacyMode = false;
      privacyLocked = false;
      passwordContainer.style.display = 'none';
      loadGallery();
      updateUIForPrivacyMode();
    }
    
    if (setPasswordContainer.style.display === 'block') {
      setPasswordContainer.style.display = 'none';
      newPasswordInput.value = "";
      
      if (privacyToggle.checked) {
        privacyToggle.checked = false;
      }
    }
  }
  
  // Enter key in password inputs
  if (e.key === 'Enter') {
    if (document.activeElement === privacyPasswordInput) {
      privacySubmit.click();
    } else if (document.activeElement === newPasswordInput) {
      setPasswordBtn.click();
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
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Start unlock timer
function startUnlockTimer() {
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
      lockPrivacyMode();
    }
  }, 1000);
}

// Update timer display
function updateTimerDisplay() {
  if (privacyMode) {
    privacyTimer.textContent = "Locked";
  } else {
    privacyTimer.textContent = `Auto-lock in ${formatTime(timeLeft)}`;
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  maxImages.textContent = MAX_IMAGES;
  await checkPassword();
  await checkPrivacyExpiration();
  await loadGallery();
  updateUIForPrivacyMode();
  
  // Start timer if unlocked
  if (!privacyMode) {
    startUnlockTimer();
  }
});

// Events
uploadButton.addEventListener("click", () => {
  if (privacyMode) {
    showNotification("Unlock Privacy Mode to upload images", "error");
    return;
  }
  fileInput.click();
});

fileInput.addEventListener("change", handleFileUpload);

// Update UI based on privacy mode
function updateUIForPrivacyMode() {
  const privacyStatusSpan = privacyStatus.querySelector("span");
  uploadButton.classList.toggle("disabled", privacyMode);

  if (privacyMode) {
    // Privacy mode is active
    privacyStatusSpan.textContent = "Active";
    privacyStatus.classList.add("active");
    uploadMessage.textContent = "Privacy Mode locked. Unlock to access images.";
    uploadMessage.style.color = "#f87171";
    privacyTimer.textContent = "Locked";
  } else {
    // Privacy mode is inactive
    privacyStatusSpan.textContent = "Inactive";
    privacyStatus.classList.remove("active");
    uploadMessage.textContent = "Images unlocked. You may select and inject.";
    uploadMessage.style.color = "#94a3b8";
  }
}

// Update storage indicator
async function updateStorageIndicator() {
  const existingImages = await db.images.count();
  const percentage = (existingImages / MAX_IMAGES) * 100;
  
  imageCount.textContent = existingImages;
  storageFill.style.width = `${percentage}%`;
  storageText.textContent = `${existingImages}/${MAX_IMAGES} images`;
  
  // Change color based on storage level
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
    showNotification("Cannot upload images in Privacy Mode", "error");
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
          privacy: privacyMode,
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

  const visibleImages = privacyMode ? [] : images;

  if (visibleImages.length === 0) {
    emptyState.style.display = "block";
    gallery.appendChild(emptyState);
  } else {
    emptyState.style.display = "none";
  }

  visibleImages.forEach(img => {
    const div = document.createElement("div");
    div.className = "item";
    
    if (img.privacy) {
      div.classList.add("privacy-item");
    }

    div.innerHTML = `
      ${img.privacy ? '<div class="privacy-badge"><i class="fas fa-lock"></i> Private</div>' : ''}
      <button class="delete-x" data-id="${img.id}" title="Delete image">&times;</button>
      <img src="${img.dataURL}" alt="${img.name}">
      <button class="select-image-btn" data-id="${img.id}">
        <i class="fas fa-paper-plane"></i> Select
      </button>
    `;

    // Delete image
    const deleteBtn = div.querySelector(".delete-x");
    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      
      if (img.privacy) {
        const record = await db.settings.get("privacyPassword");
        const entered = prompt("Enter privacy password to delete this image:");
        if (entered !== record?.value) {
          showNotification("Wrong password. Deletion cancelled.", "error");
          return;
        }
      }

      if (confirm("Are you sure you want to delete this image?")) {
        await db.images.delete(img.id);
        await loadGallery();
        showNotification("Image deleted successfully.", "success");
      }
    });

    // Select image
    const selectBtn = div.querySelector(".select-image-btn");
    selectBtn.addEventListener("click", async () => {
      if (selectBtn.disabled) return;
      
      selectBtn.disabled = true;
      selectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
      
      try {
        const selected = await db.images.get(img.id);
        if (privacyMode) {
          showNotification("Unlock Privacy Mode to use images", "warning");
          return;
        }
        await sendImageToTab(selected);
      } finally {
        setTimeout(() => {
          selectBtn.disabled = false;
          selectBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Select';
        }, 1000);
      }
    });

    gallery.appendChild(div);
  });
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
      showNotification("No active tab found. Please open a webpage first.", "error");
      return;
    }

    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || 
        tab.url.startsWith('about:')) {
      showNotification("Cannot inject images on this type of page. Please navigate to a regular website.", "error");
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "inject-image",
        dataURL: imageData.dataURL,
        fileName: imageData.name,
        timestamp: Date.now()
      });
      
      showNotification(`"${imageData.name}" sent to page successfully!`, "success");
    } catch (sendError) {
      console.log("Content script not ready, attempting to inject...");
      
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content-script.js"]
        });
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await chrome.tabs.sendMessage(tab.id, {
          action: "inject-image",
          dataURL: imageData.dataURL,
          fileName: imageData.name,
          timestamp: Date.now()
        });
        
        showNotification(`"${imageData.name}" sent to page successfully!`, "success");
      } catch (injectError) {
        console.error("Injection error:", injectError);
        
        if (injectError.message.includes("Cannot access contents")) {
          showNotification("Cannot access this webpage. Try a different website.", "error");
        } else if (injectError.message.includes("Missing host permission")) {
          showNotification("Extension permissions issue. Please reload the extension.", "error");
        } else {
          showNotification(`Cannot inject image. Make sure you're on a supported webpage with file inputs.`, "error");
        }
      }
    }
  } catch (error) {
    console.error("Send image error:", error);
    showNotification("Error: " + error.message, "error");
  } finally {
    isSendingImage = false;
  }
}

privacyToggle.addEventListener("change", async () => {
  if (privacyToggle.checked) {
    // User wants to LOCK Privacy Mode
    const record = await db.settings.get("privacyPassword");
    if (!record) {
      showNotification("Please set a password first", "warning");
      privacyToggle.checked = false;
      setPasswordContainer.style.display = "block";
      return;
    }

    privacyMode = true;
    privacyLocked = true;
    passwordContainer.style.display = "none";
    setPasswordContainer.style.display = "none";
    
    if (unlockTimer) {
      clearInterval(unlockTimer);
    }
    
    loadGallery();
    updateUIForPrivacyMode();
    showNotification("Privacy Mode enabled", "success");

  } else {
    // User wants to UNLOCK Privacy Mode
    const record = await db.settings.get("privacyPassword");
    if (!record) {
      showNotification("No password set", "warning");
      return;
    }

    passwordContainer.style.display = "block";
  }
});

privacySubmit.addEventListener("click", async () => {
  const entered = privacyPasswordInput.value.trim();
  const record = await db.settings.get("privacyPassword");

  if (!record) {
    showNotification("No password set!", "error");
    return;
  }

  if (entered === record.value) {
    privacyMode = false;
    privacyLocked = false;
    passwordContainer.style.display = "none";
    privacyToggle.checked = false;
    privacyPasswordInput.value = "";

    // Save unlock timestamp
    const unlockTime = new Date().toISOString();
    await db.settings.put({ key: "privacyUnlockTime", value: unlockTime });

    startUnlockTimer();
    loadGallery();
    updateUIForPrivacyMode();
    showNotification("Privacy Mode unlocked for 1 minute", "success");
  } else {
    showNotification("Incorrect password", "error");
    privacyPasswordInput.value = "";
  }
});

async function checkPrivacyExpiration() {
  const unlockRecord = await db.settings.get("privacyUnlockTime");

  if (unlockRecord) {
    const unlockTime = new Date(unlockRecord.value);
    const now = new Date();
    const diffMs = now - unlockTime;
    const diffMinutes = diffMs / (1000 * 60);

    if (diffMinutes >= AUTO_LOCK_MINUTES) {
      // Auto-lock after 1 minute
      await lockPrivacyMode();
    } else {
      // Still valid
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
    // No unlock record → locked
    privacyMode = true;
    privacyLocked = true;
    privacyToggle.checked = true;
  }
}

async function lockPrivacyMode() {
  privacyMode = true;
  privacyLocked = true;
  privacyToggle.checked = true;

  await db.settings.delete("privacyUnlockTime");
  
  if (unlockTimer) {
    clearInterval(unlockTimer);
  }

  loadGallery();
  updateUIForPrivacyMode();
  showNotification("Privacy Mode auto-enabled (1 minute expired)", "info");
}

// Forgot password
forgotPassword.addEventListener("click", async () => {
  const confirmReset = confirm("Resetting password will delete all private images. Continue?");
  if (!confirmReset) return;
  
  const privateImages = await db.images.where("privacy").equals(1).toArray();
  for (const img of privateImages) {
    await db.images.delete(img.id);
  }
  
  await db.settings.delete("privacyPassword");
  await db.settings.delete("privacyUnlockTime");
  
  privacyMode = false;
  privacyLocked = false;
  privacyToggle.checked = false;
  passwordContainer.style.display = "none";
  setPasswordContainer.style.display = "block";
  
  if (unlockTimer) {
    clearInterval(unlockTimer);
  }
  
  await loadGallery();
  updateUIForPrivacyMode();
  showNotification("Password reset. All private images have been deleted.", "warning");
});

// Show set password form
setPasswordLink.addEventListener("click", () => {
  setPasswordContainer.style.display = "block";
  passwordContainer.style.display = "none";
  privacyPasswordInput.value = "";
});

// Cancel set password
cancelSetPassword.addEventListener("click", () => {
  setPasswordContainer.style.display = "none";
  newPasswordInput.value = "";
  
  if (privacyToggle.checked) {
    privacyToggle.checked = false;
  }
});

async function checkPassword() {
  const record = await db.settings.get("privacyPassword");
  if (!record) {
    setPasswordContainer.style.display = "block";
    passwordContainer.style.display = "none";
  } else {
    setPasswordContainer.style.display = "none";
    passwordContainer.style.display = "none";
  }
}

// Set new password
setPasswordBtn.addEventListener("click", async () => {
  const newPass = newPasswordInput.value.trim();
  if (!newPass) {
    showNotification("Password cannot be empty", "error");
    return;
  }

  if (newPass.length < 4) {
    showNotification("Password must be at least 4 characters", "warning");
    return;
  }

  await db.settings.put({ key: "privacyPassword", value: newPass });
  showNotification("Password set successfully!", "success");
  newPasswordInput.value = "";
  setPasswordContainer.style.display = "none";
});

// Clear all images
clearAllBtn.addEventListener("click", async () => {
  const confirmClear = confirm("Are you sure you want to delete ALL images? This action cannot be undone.");
  if (!confirmClear) return;
  
  const images = await db.images.toArray();
  
  const hasPrivateImages = images.some(img => img.privacy);
  
  if (hasPrivateImages) {
    const record = await db.settings.get("privacyPassword");
    const entered = prompt("Private images found. Enter password to delete all images:");
    
    if (entered !== record?.value) {
      showNotification("Wrong password. Deletion cancelled.", "error");
      return;
    }
  }
  
  await db.images.clear();
  await loadGallery();
  showNotification("All images deleted successfully.", "success");
});

// Auto-save unlock time periodically
setInterval(async () => {
  if (!privacyMode) {
    const unlockTime = new Date().toISOString();
    await db.settings.put({ key: "privacyUnlockTime", value: unlockTime });
  }
}, 30000); // Save every 30 seconds