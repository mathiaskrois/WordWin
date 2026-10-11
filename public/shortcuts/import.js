// Replace WORDWIN_IMAGE_BASE64 with the Base64 Encoded magic variable in Shortcuts.
(function () {
  var image = "WORDWIN_IMAGE_BASE64";
  var data = document.getElementById("wordwin-shortcut-data");
  var button = document.getElementById("wordwin-shortcut-import");
  var receipt = document.getElementById("wordwin-shortcut-receipt");
  if (!data || !button || !receipt ||
      !/^(krois\.dk|localhost|127\.0\.0\.1)$/.test(location.hostname) ||
      !/^\/wordwin\/$/i.test(location.pathname)) {
    completion("WORDWIN_ERROR: Open WordWin in Safari first.");
    return;
  }
  var id = crypto.randomUUID();
  var finished = false;
  var timer;
  var observer = new MutationObserver(function () {
    try {
      var result = JSON.parse(receipt.textContent);
      if (result.id !== id) return;
      finish(result.received === true ? "WORDWIN_RECEIVED" :
        "WORDWIN_ERROR: " + result.error);
    } catch (_) { /* Wait for the complete receipt. */ }
  });
  function finish(result) {
    if (finished) return;
    finished = true;
    observer.disconnect();
    clearTimeout(timer);
    completion(result);
  }
  observer.observe(receipt, { childList: true, characterData: true, subtree: true });
  timer = setTimeout(function () {
    finish("WORDWIN_ERROR: Receipt timed out. Keep the original photo.");
  }, 3500);
  data.value = JSON.stringify({ id: id, image: image });
  button.click();
})();
