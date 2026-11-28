export const DEFAULT_DETAIL_URL = "http://192.168.1.147:8787";

const URL_KEY = "mc.detail.url";
const KEY_KEY = "mc.detail.key";
const WAIT_KEY = "mc.detail.wait";

export type DetailSettings = {
  url: string;
  appKey: string;
  waitForLan: boolean;
};

export async function readDetailSettings(): Promise<DetailSettings> {
  const [url, appKey, wait] = await Promise.all([read(URL_KEY), read(KEY_KEY), read(WAIT_KEY)]);
  return {
    url: url || DEFAULT_DETAIL_URL,
    appKey: appKey ?? "",
    waitForLan: wait !== "off",
  };
}

export async function writeDetailSettings(next: DetailSettings): Promise<void> {
  await write(URL_KEY, next.url.trim() || DEFAULT_DETAIL_URL);
  await write(KEY_KEY, next.appKey.trim());
  await write(WAIT_KEY, next.waitForLan ? "on" : "off");
}

async function read(key: string): Promise<string | null> {
  try {
    const SecureStore = await import("expo-secure-store");
    return await SecureStore.getItemAsync(key);
  } catch {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  }
}

async function write(key: string, value: string): Promise<void> {
  try {
    const SecureStore = await import("expo-secure-store");
    await SecureStore.setItemAsync(key, value);
  } catch {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  }
}
