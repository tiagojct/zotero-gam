// The OpenAlex API key in Zotero's login store, encrypted with the key store of the system (as Zotero
// keeps its sync key). It is never in a pref. The settings pane and the command use this module.
// env: {Zotero, Services}, and for tests LoginInfo (an nsILoginInfo constructor).

export const KEY_ORIGIN = "chrome://gam";
export const KEY_REALM = "OpenAlex API key";
const USER = "API key";

function stored({ Services }) {
  return Services.logins.findLogins(KEY_ORIGIN, null, KEY_REALM)[0] || null;
}

async function read({ Zotero }, login) {
  // gam writes only encrypted values: another value is not gam's.
  if (!login || !Zotero.OSKeyStore.isEncrypted(login.password)) return "";
  try {
    return String(await Zotero.OSKeyStore.decrypt(login.password)).trim();
  } catch {
    return "";
  }
}

/** The key, or "" when there is none or it cannot be read. */
export async function getKey(env) {
  return read(env, stored(env));
}

/** A new login entry. LoginInfo (the nsILoginInfo constructor) is for tests; Zotero uses Cc. */
function loginInfo(LoginInfo, password) {
  if (LoginInfo) return new LoginInfo(KEY_ORIGIN, null, KEY_REALM, USER, password, "", "");
  const info = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
  info.init(KEY_ORIGIN, null, KEY_REALM, USER, password, "", "");
  return info;
}

/** Save, replace or (with an empty key) remove the key: "saved", "removed" or "unchanged". */
export async function setKey(env, key) {
  // Read env at once: the settings window can close while the save runs, and its objects then die.
  const { Zotero, Services, LoginInfo } = env;
  const value = String(key ?? "").trim();
  const old = stored({ Services });
  if (!value) {
    if (!old) return "unchanged";
    Services.logins.removeLogin(old);
    return "removed";
  }
  if (old && (await read({ Zotero }, old)) === value) return "unchanged";
  // No encryption, no store: an error here keeps the key out of the login store.
  const encrypted = await Zotero.OSKeyStore.encrypt(value);
  const info = loginInfo(LoginInfo, encrypted);
  if (old) Services.logins.modifyLogin(old, info);
  else await Services.logins.addLoginAsync(info);
  return "saved";
}
