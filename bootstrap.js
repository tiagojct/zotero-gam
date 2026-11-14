/* gam bootstrap. The plugin code is in content/gam.mjs. */

var chromeHandle;
var Gam;

async function startup({ id, version, rootURI }, reason) {
  const aomStartup = Cc["@mozilla.org/addons/addon-manager-startup;1"].getService(Ci.amIAddonManagerStartup);
  const manifestURI = Services.io.newURI(rootURI + "manifest.json");
  chromeHandle = aomStartup.registerChrome(manifestURI, [["content", "gam", rootURI + "content/"]]);
  ({ Gam } = ChromeUtils.importESModule("chrome://gam/content/gam.mjs"));
  await Gam.startup({ id, version, rootURI, Zotero });
  await Zotero.PreferencePanes.register({
    pluginID: id,
    src: rootURI + "content/preferences.xhtml",
    label: "gam",
    image: rootURI + "content/icons/gam.svg",
  });
}

function onMainWindowLoad({ window }, reason) {
  Gam?.onMainWindowLoad(window);
}

function onMainWindowUnload({ window }, reason) {
  Gam?.onMainWindowUnload(window);
}

function shutdown(data, reason) {
  if (reason === APP_SHUTDOWN) return;
  Gam?.shutdown();
  Gam = undefined;
  chromeHandle?.destruct();
  chromeHandle = undefined;
}

function install() {}
function uninstall() {}
