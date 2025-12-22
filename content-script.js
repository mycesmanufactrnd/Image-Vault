chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.action !== "inject-image") return;

  const input = document.querySelector("input[type='file']");
  if (!input) return alert("No file input found on page");

  // Convert Data URL to File
  function dataURLtoFile(dataurl, filename) {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], filename, { type: mime });
  }

  const file = dataURLtoFile(msg.dataURL, msg.fileName);

  // Inject into q-file
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;

  // Trigger events for Vue/q-file
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
});
