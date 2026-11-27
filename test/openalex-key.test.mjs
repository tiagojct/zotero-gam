import { test } from "node:test";
import assert from "node:assert/strict";
import { getKey, setKey, KEY_ORIGIN, KEY_REALM } from "../content/openalex-key.mjs";

function setup({ encryptFails = false } = {}) {
  const logins = [];
  class LoginInfo {
    constructor(origin, formActionOrigin, httpRealm, username, password) {
      Object.assign(this, { origin, formActionOrigin, httpRealm, username, password });
    }
  }
  const Services = {
    logins: {
      findLogins: (origin, action, realm) => logins.filter((l) => l.origin === origin && l.httpRealm === realm),
      addLoginAsync: async (info) => { logins.push(info); return info; },
      modifyLogin: (old, info) => { logins[logins.indexOf(old)] = info; },
      removeLogin: (old) => { logins.splice(logins.indexOf(old), 1); },
    },
  };
  const Zotero = {
    OSKeyStore: {
      encrypt: async (s) => { if (encryptFails) throw new Error("no keystore"); return `enc:${[...s].reverse().join("")}`; },
      decrypt: async (s) => [...s.slice(4)].reverse().join(""),
      isEncrypted: (s) => s.startsWith("enc:"),
    },
  };
  return { logins, env: { Zotero, Services, LoginInfo } };
}

test("a saved key comes back, and the store holds only the encrypted value", async () => {
  const { logins, env } = setup();
  assert.equal(await setKey(env, "abc123"), "saved");
  assert.equal(await getKey(env), "abc123");
  assert.equal(logins.length, 1);
  assert.equal(logins[0].origin, KEY_ORIGIN);
  assert.equal(logins[0].httpRealm, KEY_REALM);
  assert.notEqual(logins[0].password, "abc123");
  assert.doesNotMatch(logins[0].password, /abc123/);
});

test("spaces and new lines of a paste go", async () => {
  const { env } = setup();
  await setKey(env, "  k1 \n");
  assert.equal(await getKey(env), "k1");
});

test("a second key replaces the first; the same key changes nothing", async () => {
  const { logins, env } = setup();
  await setKey(env, "one");
  assert.equal(await setKey(env, "two"), "saved");
  assert.equal(logins.length, 1);
  assert.equal(await getKey(env), "two");
  assert.equal(await setKey(env, "two"), "unchanged");
});

test("an empty field removes the key", async () => {
  const { logins, env } = setup();
  await setKey(env, "one");
  assert.equal(await setKey(env, "  "), "removed");
  assert.equal(logins.length, 0);
  assert.equal(await getKey(env), "");
  assert.equal(await setKey(env, ""), "unchanged");
});

test("when the keystore cannot encrypt, nothing is stored", async () => {
  const { logins, env } = setup({ encryptFails: true });
  await assert.rejects(setKey(env, "abc"), /no keystore/);
  assert.equal(logins.length, 0);
});

test("a stored value that is not encrypted is not used", async () => {
  const { logins, env } = setup();
  logins.push({ origin: KEY_ORIGIN, httpRealm: KEY_REALM, username: "API key", password: "plain" });
  assert.equal(await getKey(env), "");
});

test("no key gives an empty string", async () => {
  const { env } = setup();
  assert.equal(await getKey(env), "");
});
