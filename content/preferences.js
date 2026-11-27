/* gam settings pane: the OpenAlex key field. The key is not a pref: openalex-key.mjs keeps it in
   Zotero's login store. Zotero loads this script before it inserts the pane, then sends "load" to the
   pane's root element. */

(function () {
  // The URL of this script, in the versioned chrome package of gam (loadSubScript chains the callers).
  const here = String(Components.stack.filename).split(" -> ").pop();
  const { getKey, setKey } = ChromeUtils.importESModule(new URL("openalex-key.mjs", here).href);
  const LoginInfo = Components.Constructor("@mozilla.org/login-manager/loginInfo;1", Ci.nsILoginInfo, "init");
  const env = { Zotero, Services, LoginInfo };

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
    try {
      field.value = await getKey(env);
    } catch (e) {
      Zotero.logError(e);
    }
    // "change": after the user leaves the field or presses Enter, not on each key press.
    field.addEventListener("change", async () => {
      show(status, null);
      try {
        const result = await setKey(env, field.value);
        field.value = field.value.trim();
        if (result === "saved") show(status, "gam-pref-openalex-key-saved");
        if (result === "removed") show(status, "gam-pref-openalex-key-removed");
      } catch (e) {
        Zotero.logError(e);
        show(status, "gam-pref-openalex-key-error", { error: String(e?.message || e) });
      }
    });
  }

  // On the document, not the window: Gecko does not pass the "load" event of an element on to the window.
  document.addEventListener("load", (event) => {
    if (event.target?.id === "gam-prefs") init().catch((e) => Zotero.logError(e));
  }, true);
})();
