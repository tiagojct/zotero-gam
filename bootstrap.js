/* gam bootstrap. The plugin code is in content/gam.mjs. */

var chromeHandle;
var Gam;

async function startup({ id, version, rootURI }, reason) {
  const aomStartup = Cc["@mozilla.org/addons/addon-manager-startup;1"].getService(Ci.amIAddonManagerStartup);
  const manifestURI = Services.io.newURI(rootURI + "manifest.json");
  // One chrome package for each version: Zotero keeps loaded modules in memory, so an update
  // must load its modules from a new address to run the new code without a restart.
  const pkg = "gam-" + version.replace(/[^A-Za-z0-9]/g, "-");
  chromeHandle = aomStartup.registerChrome(manifestURI, [["content", pkg, rootURI + "content/"]]);
  // The settings pane first, so that it is there even when startup fails.
  await Zotero.PreferencePanes.register({
    pluginID: id,
    src: rootURI + "content/preferences.xhtml",
    label: "gam",
    image: rootURI + "content/icons/gam.svg",
    // The OpenAlex key field: it is not a pref, so a script fills and saves it.
    scripts: [`chrome://${pkg}/content/preferences.js`],
  });
  ({ Gam } = ChromeUtils.importESModule(`chrome://${pkg}/content/gam.mjs`));
  const homeDir = Services.dirsvc.get("Home", Ci.nsIFile).path;
  await Gam.startup({ id, version, rootURI, Zotero, homeDir });
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
