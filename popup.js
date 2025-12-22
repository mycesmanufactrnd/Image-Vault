const db = new Dexie("ImageStorageDB");
db.version(2).stores({
  images: "id",
  settings: "key"
});

const MAX_IMAGES = 6;

// Elements
const uploadButton = document.getElementById("uploadButton");
const fileInput = document.getElementById("fileInput");
const customUploadLabel = document.getElementById("customUploadLabel");
const gallery = document.getElementById("gallery");
const emptyState = document.getElementById("emptyState");
const imageCount = document.getElementById("imageCount");
const storageFill = document.getElementById("storageFill");
const storageText = document.getElementById("storageText");
const maxImages = document.getElementById("maxImages");
const uploadMessage = document.getElementById("uploadMessage");
const privacyStatus = document.getElementById("privacyStatus");

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
let isSendingImage = false; // Flag to prevent multiple sends

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  maxImages.textContent = MAX_IMAGES;
  await checkPassword();
  await checkPrivacyExpiration(); // 🔹 check if unlock expired
  await loadGallery();
  updateUIForPrivacyMode();
});

// Events
fileInput.addEventListener("change", handleFileUpload);

// Show notification
function showNotification(message, type = "info") {
  notificationText.textContent = message;
  notification.className = "notification";
  
  // Set color based on type
  if (type === "success") {
    notification.style.background = "linear-gradient(90deg, #4CAF50, #66BB6A)";
  } else if (type === "error") {
    notification.style.background = "linear-gradient(90deg, #ff6b6b, #ff8e8e)";
  } else if (type === "warning") {
    notification.style.background = "linear-gradient(90deg, #FF9800, #FFB74D)";
  } else {
    notification.style.background = "linear-gradient(90deg, #4a6ee0, #6a8cff)";
  }
  
  notification.classList.add("show");
  
  setTimeout(() => {
    notification.classList.remove("show");
  }, 3000);
}

// Update UI based on privacy mode
function updateUIForPrivacyMode() {
  const privacyStatusSpan = privacyStatus.querySelector("span");

  if (privacyMode) {
    // Privacy mode is active
    privacyStatusSpan.textContent = "Active";
    privacyStatus.classList.add("active");
    uploadMessage.textContent = "Privacy Mode locked. Unlock to access images.";
    uploadMessage.style.color = "#ff6b6b";
    
    // Disable upload area
    customUploadLabel.classList.add("disabled");
    customUploadLabel.style.pointerEvents = "none";
    customUploadLabel.querySelector(".upload-icon i").style.color = "#ccc";
    customUploadLabel.querySelector(".upload-text h3").style.color = "#ccc";
    customUploadLabel.querySelector(".upload-text p").style.color = "#ccc";
  } 
  
  else {
    // Privacy mode is inactive
    privacyStatusSpan.textContent = "Inactive";
    privacyStatus.classList.remove("active");
    uploadMessage.textContent = "Images unlocked. You may select and inject.";
    uploadMessage.style.color = "#666";
    
    // Enable upload area
    customUploadLabel.classList.remove("disabled");
    customUploadLabel.style.pointerEvents = "auto";
    customUploadLabel.querySelector(".upload-icon i").style.color = "#4a6ee0";
    customUploadLabel.querySelector(".upload-text h3").style.color = "#2a3f7b";
    customUploadLabel.querySelector(".upload-text p").style.color = "#7a8bc8";
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
    storageFill.style.background = "linear-gradient(90deg, #ff6b6b, #ff8e8e)";
  } else if (percentage >= 70) {
    storageFill.style.background = "linear-gradient(90deg, #FF9800, #FFB74D)";
  } else {
    storageFill.style.background = "linear-gradient(90deg, #4a6ee0, #6a8cff)";
  }
}

async function handleFileUpload(e) {
  // Check if upload is allowed
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
    files.length = available; // Truncate the array
  }

  const filesToUpload = files.slice(0, available);
  
  if (filesToUpload.length === 0) return;
  
  showNotification(`Uploading ${filesToUpload.length} image(s)...`, "info");
  
  // Upload each file sequentially
  for (let i = 0; i < filesToUpload.length; i++) {
    await new Promise(resolve => {
      setTimeout(async () => {
        await saveImage(filesToUpload[i]);
        resolve();
      }, i * 200);
    });
  }
  
  // Clear file input
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

  // Update storage indicator
  await updateStorageIndicator();

  // Only show images based on privacy mode
  // const visibleImages = images.filter(img => {
  //   return privacyMode ? true : !img.privacy;
  // });
  const visibleImages = privacyMode
  ? []            // 🔒 locked → show NOTHING
  : images;       // 🔓 unlocked → show ALL images


  // Show empty state if no images
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
      <button class="delete-x ${privacyMode ? 'disabled' : ''}" data-id="${img.id}" title="${privacyMode ? 'Delete disabled in Privacy Mode' : 'Delete image'}">&times;</button>
      <img src="${img.dataURL}" alt="${img.name}">
      <button class="select-image-btn" data-id="${img.id}">
        <i class="fas fa-paper-plane"></i> Select
      </button>
    `;

    // Delete image - disabled in privacy mode
    const deleteBtn = div.querySelector(".delete-x");
    if (!privacyMode) {
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
    } else {
      // In privacy mode, prevent any clicks on delete button
      deleteBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showNotification("Delete disabled in Privacy Mode", "warning");
      };
    }

    // Select image - prevent multiple clicks
    const selectBtn = div.querySelector(".select-image-btn");
    selectBtn.addEventListener("click", async () => {
      // Prevent multiple rapid clicks
      if (selectBtn.disabled) return;
      
      selectBtn.disabled = true;
      selectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
      
      try {
        const selected = await db.images.get(img.id);
        // if (img.privacy && !privacyMode) {
        //   showNotification("Enable Privacy Mode to access this image", "warning");
        //   return;
        // }
        if (privacyMode) {
          showNotification("Unlock Privacy Mode to use images", "warning");
          return;
        }
        await sendImageToTab(selected);
      } finally {
        // Re-enable button after a delay
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
  // Prevent multiple sends
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

    // Check if we can access the tab (some pages like chrome:// are restricted)
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || 
        tab.url.startsWith('about:')) {
      showNotification("Cannot inject images on this type of page. Please navigate to a regular website.", "error");
      return;
    }

    // Try to send message directly first (content script might already be injected)
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: "inject-image",
        dataURL: imageData.dataURL,
        fileName: imageData.name,
        timestamp: Date.now() // Unique identifier
      });
      
      showNotification(`"${imageData.name}" sent to page successfully!`, "success");
    } catch (sendError) {
      // If message fails, try to inject the content script first
      console.log("Content script not ready, attempting to inject...");
      
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content-script.js"]
        });
        
        // Wait a bit for the content script to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Try sending message again
        await chrome.tabs.sendMessage(tab.id, {
          action: "inject-image",
          dataURL: imageData.dataURL,
          fileName: imageData.name,
          timestamp: Date.now()
        });
        
        showNotification(`"${imageData.name}" sent to page successfully!`, "success");
      } catch (injectError) {
        console.error("Injection error:", injectError);
        
        // Provide more helpful error messages
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

// Privacy toggle - now acts as activation lock
// privacyToggle.addEventListener("change", async () => {
//   if (privacyToggle.checked) {
//     // Privacy mode toggle is ON - need password to activate
//     // Check if password exists
//     const record = await db.settings.get("privacyPassword");
//     if (!record) {
//       showNotification("Please set a password first", "warning");
//       privacyToggle.checked = false;
//       setPasswordContainer.style.display = "block";
//       passwordContainer.style.display = "none";
//       return;
//     }

//     // Show password input to unlock privacy mode
//     passwordContainer.style.display = "block";
//     setPasswordContainer.style.display = "none";
//   } else {
//     // Turn off privacy mode - no password required to deactivate
//     privacyMode = false;
//     privacyLocked = false;
//     passwordContainer.style.display = "none";
//     setPasswordContainer.style.display = "none";
//     loadGallery(); // reload normal images
//     updateUIForPrivacyMode();
//     showNotification("Privacy mode disabled", "info");
//   }
// });

privacyToggle.addEventListener("change", async () => {
  if (privacyToggle.checked) {
    // User wants to LOCK Privacy Mode
    const record = await db.settings.get("privacyPassword");
    if (!record) {
      showNotification("Please set a password first", "warning");
      privacyToggle.checked = false; // reset toggle
      setPasswordContainer.style.display = "block";
      return;
    }

    privacyMode = true;
    privacyLocked = true;
    passwordContainer.style.display = "none";
    setPasswordContainer.style.display = "none";
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

// privacySubmit.addEventListener("click", async () => {
//   const entered = privacyPasswordInput.value.trim();
//   const record = await db.settings.get("privacyPassword");

//   if (!record) {
//     showNotification("No password set!", "error");
//     return;
//   }

//   if (entered === record.value) {
//     privacyMode = false; // unlocked
//     privacyLocked = false;
//     passwordContainer.style.display = "none";
//     privacyToggle.checked = false; // reflect unlocked state
//     privacyPasswordInput.value = "";
//     loadGallery();
//     updateUIForPrivacyMode();
//     showNotification("Privacy Mode unlocked", "success");
//   } else {
//     showNotification("Incorrect password", "error");
//   }
// });

privacySubmit.addEventListener("click", async () => {
  const entered = privacyPasswordInput.value.trim();
  const record = await db.settings.get("privacyPassword");

  if (!record) {
    showNotification("No password set!", "error");
    return;
  }

  if (entered === record.value) {
    privacyMode = false; // unlocked
    privacyLocked = false;
    passwordContainer.style.display = "none";
    privacyToggle.checked = false; // reflect unlocked state
    privacyPasswordInput.value = "";

    // 🔹 Save unlock timestamp
    const unlockTime = new Date().toISOString();
    await db.settings.put({ key: "privacyUnlockTime", value: unlockTime });

    loadGallery();
    updateUIForPrivacyMode();
    showNotification("Privacy Mode unlocked for 1 day", "success");
  } else {
    showNotification("Incorrect password", "error");
  }
});

async function checkPrivacyExpiration() {
  const unlockRecord = await db.settings.get("privacyUnlockTime");

  if (unlockRecord) {
    const unlockTime = new Date(unlockRecord.value);
    const now = new Date();
    const diffMs = now - unlockTime; // milliseconds
    // const diffDays = diffMs / (1000 * 60 * 60 * 24); // convert to days
    const diffDays = diffMs / (1000 * 60); 

    if (diffDays >= 1) {
      // 1 day passed → auto-lock
      privacyMode = true;
      privacyLocked = true;
      privacyToggle.checked = true;
      await db.settings.delete("privacyUnlockTime"); // clear timestamp
      loadGallery();
      updateUIForPrivacyMode();
      showNotification("Privacy Mode re-enabled (1 day expired)", "info");
    } else {
      // still valid → remain unlocked
      privacyMode = false;
      privacyLocked = false;
      privacyToggle.checked = false;
    }
  } else {
    // No unlock record → remain locked
    privacyMode = true;
    privacyLocked = true;
    privacyToggle.checked = true;
  }
}

async function lockPrivacyMode() {
  privacyMode = true;
  privacyLocked = true;
  privacyToggle.checked = true;

  // Remove unlock timestamp
  await db.settings.delete("privacyUnlockTime");

  // Reload gallery and update UI
  loadGallery();
  updateUIForPrivacyMode();
  showNotification("Privacy Mode re-enabled (expired)", "info");
}

// Forgot password
forgotPassword.addEventListener("click", async () => {
  const confirmReset = confirm("Resetting password will delete all private images. Continue?");
  if (!confirmReset) return;
  
  // Delete all private images
  const privateImages = await db.images.where("privacy").equals(1).toArray();
  for (const img of privateImages) {
    await db.images.delete(img.id);
  }
  
  // Remove password
  await db.settings.delete("privacyPassword");
  
  // Reset UI
  privacyMode = false;
  privacyLocked = false;
  privacyToggle.checked = false;
  passwordContainer.style.display = "none";
  setPasswordContainer.style.display = "block";
  
  await loadGallery();
  updateUIForPrivacyMode();
  showNotification("Password reset. All private images have been deleted.", "warning");
});

// Show set password form
setPasswordLink.addEventListener("click", () => {
  setPasswordContainer.style.display = "block";
  passwordContainer.style.display = "none";
});

// Cancel set password
cancelSetPassword.addEventListener("click", () => {
  setPasswordContainer.style.display = "none";
  newPasswordInput.value = "";
  
  // If privacy toggle was checked, uncheck it
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
  
  // Check if there are private images that need password
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

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
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