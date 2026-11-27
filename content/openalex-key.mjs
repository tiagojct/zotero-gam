// The OpenAlex API key in Zotero's login store, encrypted with the key store of the system (as Zotero
// keeps its sync key). It is never in a pref. The settings pane and the command use this module.
// env: {Zotero, Services, LoginInfo}. LoginInfo is the nsILoginInfo constructor (setKey only).

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

/** Save, replace or (with an empty key) remove the key: "saved", "removed" or "unchanged". */
export async function setKey(env, key) {
  const value = String(key ?? "").trim();
  const old = stored(env);
  if (!value) {
    if (!old) return "unchanged";
    env.Services.logins.removeLogin(old);
    return "removed";
  }
  if (old && (await read(env, old)) === value) return "unchanged";
  // No encryption, no store: an error here keeps the key out of the login store.
  const encrypted = await env.Zotero.OSKeyStore.encrypt(value);
  const info = new env.LoginInfo(KEY_ORIGIN, null, KEY_REALM, USER, encrypted, "", "");
  if (old) env.Services.logins.modifyLogin(old, info);
  else await env.Services.logins.addLoginAsync(info);
  return "saved";
}
