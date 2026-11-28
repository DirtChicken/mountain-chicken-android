import { inflateRawSync } from "node:zlib";

export function unzip(bytes: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 30 < bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    const method = bytes.readUInt16LE(offset + 8);
    const compressed = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const start = offset + 30 + nameLength + extraLength;
    const data = bytes.subarray(start, start + compressed);
    if (!name.endsWith("/")) {
      if (method === 0) files.set(name, Buffer.from(data));
      else if (method === 8) files.set(name, inflateRawSync(data));
    }
    offset = start + compressed;
  }
  return files;
}

export function findText(files: Map<string, Buffer>, suffix: string): string | null {
  for (const [name, bytes] of files) {
    if (name.endsWith(suffix)) return bytes.toString("utf8");
  }
  return null;
}

export function findBytes(files: Map<string, Buffer>, suffix: string): Buffer | null {
  for (const [name, bytes] of files) {
    if (name.toLowerCase().endsWith(suffix)) return bytes;
  }
  return null;
}
