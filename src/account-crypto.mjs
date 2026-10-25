import { readAccount } from "./account-model.mjs";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const MAX_CIPHERTEXT_BASE64 = 8192; // Match existing Firestore envelope bounds.
const encode64 = bytes => btoa(String.fromCharCode(...bytes));
function decode64(value) {
  if (typeof value !== "string" || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new TypeError("Invalid encrypted envelope.");
  const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  if (encode64(bytes) !== value) throw new TypeError("Invalid encrypted envelope.");
  return bytes;
}

export async function sealJSON(value, key, context = "", max = MAX_CIPHERTEXT_BASE64) {
  if (!key) throw new Error("Unlock before saving an account.");
  const payload = encoder.encode(JSON.stringify(value));
  if (Math.ceil((payload.length + 16) / 3) * 4 > max) throw new RangeError("Record exceeds the encrypted storage limit.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(context) }, key, payload);
  return { v: 1, iv: encode64(iv), data: encode64(new Uint8Array(ciphertext)) };
}

export async function openJSON(raw, key, context = "", max = MAX_CIPHERTEXT_BASE64) {
  if (!key) throw new Error("Unlock before reading an account.");
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length !== 3 || raw.v !== 1 || typeof raw.iv !== "string" || raw.iv.length !== 16 || typeof raw.data !== "string" || raw.data.length > max || raw.data.length < 24) throw new TypeError("Invalid encrypted envelope.");
  const iv = decode64(raw.iv);
  const ciphertext = decode64(raw.data);
  if (iv.length !== 12 || ciphertext.length < 16) throw new TypeError("Invalid encrypted envelope.");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(context) }, key, ciphertext);
  return JSON.parse(decoder.decode(plaintext));
}

export const encryptAccount = (fields, key) => sealJSON(readAccount(fields), key);
export async function decryptAccount(raw, key, context = "") {
  if (raw?.v === 2) {
    if (!context || Object.keys(raw).sort().join(",") !== "data,iv,purging,revision,v" || typeof raw.purging!=="boolean" || !/^[a-zA-Z0-9-]{1,80}$/.test(raw.revision)) throw new TypeError("Invalid tracking envelope.");
    return readAccount(await openJSON({v:1,iv:raw.iv,data:raw.data}, key, `${context}:${raw.revision}`));
  }
  return readAccount(await openJSON(raw, key));
}
export async function encryptTrackingAccount(fields, key, context, revision) {
  if (!context || !/^[a-zA-Z0-9-]{1,80}$/.test(revision)) throw new TypeError("Invalid tracking context.");
  return {...await sealJSON(readAccount(fields), key, `${context}:${revision}`),v:2,revision,purging:false};
}
