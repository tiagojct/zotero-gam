/* gam settings pane: the OpenAlex key field. The key is not a pref: openalex-key.mjs keeps it in
   Zotero's login store. Zotero loads this script before it inserts the pane, then sends "load" to the
   pane's root element. */

(function () {
  // The URL of this script, in the versioned chrome package of gam (loadSubScript chains the callers).
  const here = String(Components.stack.filename).split(" -> ").pop();
  const { getKey, setKey } = ChromeUtils.importESModule(new URL("openalex-key.mjs", here).href);
  const env = { Zotero, Services };

  function show(status, id, args) {
    if (id) document.l10n.setAttributes(status, id, args);
    else {
      status.removeAttribute("data-l10n-id");
      status.textContent = "";
    }
  }

  async function init() {
    const field = document.getElementById("gam-pref-openalex-key");
    const status = document.getElementById("gam-pref-openalex-key-status");
    if (!field || field.dataset.gamReady) return;
    field.dataset.gamReady = "1";
    // The value that is in the store (or is being saved), so the same value is not saved twice.
    let last = "";
    try {
      last = await getKey(env);
      field.value = last;
    } catch (e) {
      Zotero.logError(e);
    }
    // One save at a time: two saves at once could add two logins.
    let queue = Promise.resolve();
    let timer = null;
    const save = () => {
      clearTimeout(timer);
      timer = null;
      const value = field.value.trim();
      if (value === last) return queue;
      last = value;
      queue = queue.then(async () => {
        show(status, null);
        try {
          const result = await setKey(env, value);
          if (result === "saved") show(status, "gam-pref-openalex-key-saved");
          if (result === "removed") show(status, "gam-pref-openalex-key-removed");
        } catch (e) {
          last = null;
          Zotero.logError(e);
          show(status, "gam-pref-openalex-key-error", { error: String(e?.message || e) });
        }
      });
      return queue;
    };
    // A paste saves shortly after the last key press; leaving the field, Enter or closing the window saves
    // at once. (Closing the window sends no "change" event.)
    field.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(save, 800);
    });
    field.addEventListener("change", save);
    // The window goes away now: a promise of this pane may not run any more, so call setKey (module
    // code) at once, not through the queue.
    window.addEventListener("pagehide", () => {
      if (!timer) return;
      clearTimeout(timer);
      timer = null;
      const value = field.value.trim();
      if (value !== last) setKey(env, value).catch((e) => Zotero.logError(e));
    });
  }

  // On the document, not the window: Gecko does not pass the "load" event of an element on to the window.
  document.addEventListener("load", (event) => {
    if (event.target?.id === "gam-prefs") init().catch((e) => Zotero.logError(e));
  }, true);
})();
