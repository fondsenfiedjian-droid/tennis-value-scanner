// Single-disk ZIP with stored or raw-deflate entries. Entries stay in memory only
// while their CRC and CSV are being checked. Embedded paths are never extracted.
export const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;

export async function zipDirectory(blob) {
  const tail = await blob.slice(Math.max(0, blob.size - 65557)).arrayBuffer();
  const end = new DataView(tail);
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (end.getUint32(i, true) !== 0x06054b50 || i + 22 + end.getUint16(i + 20, true) !== tail.byteLength) continue;
    const count = end.getUint16(i + 10, true);
    const size = end.getUint32(i + 12, true);
    const start = end.getUint32(i + 16, true);
    const boundary = blob.size - tail.byteLength + i;
    if (end.getUint32(i + 4, true) || end.getUint16(i + 8, true) !== count ||
        count > 512 || size > 2 * 1024 * 1024 || start + size !== boundary) {
      throw Error("Неподдерживаемая структура ZIP.");
    }
    const data = await blob.slice(start, boundary).arrayBuffer();
    const view = new DataView(data);
    const decoder = new TextDecoder();
    const entries = [];
    let offset = 0, expanded = 0;
    for (let j = 0; j < count; j++) {
      if (offset + 46 > size || view.getUint32(offset, true) !== 0x02014b50) throw Error("Повреждён каталог ZIP.");
      const u16 = n => view.getUint16(offset + n, true);
      const u32 = n => view.getUint32(offset + n, true);
      const nameLength = u16(28);
      const next = offset + 46 + nameLength + u16(30) + u16(32);
      if (next > size) throw Error("Обрезан каталог ZIP.");
      const name = decoder.decode(new Uint8Array(data, offset + 46, nameLength));
      if (/\.(csv|json)$/i.test(name) && !name.split("/").some(part => part === "__MACOSX" || part.startsWith("._"))) {
        const entry = { name, flags: u16(8), method: u16(10), crc: u32(16), compressed: u32(20), size: u32(24), offset: u32(42), boundary: start };
        expanded += entry.size;
        if (u16(34) || (entry.flags & 65) || ![0, 8].includes(entry.method) ||
            expanded > MAX_ARCHIVE_BYTES || entry.offset + 30 + entry.compressed > start) {
          throw Error("ZIP зашифрован, превышает 100 МБ после распаковки или использует неподдерживаемое сжатие.");
        }
        entries.push(entry);
      }
      offset = next;
    }
    if (offset !== size || !entries.length) throw Error("ZIP не содержит доступных CSV или JSON.");
    return entries;
  }
  throw Error("Конец каталога ZIP не найден.");
}

const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  for (let bit = 0; bit < 8; bit++) i = (i >>> 1) ^ (i & 1 ? 0xedb88320 : 0);
  return i;
});

export async function readZipEntry(blob, entry) {
  const header = new DataView(await blob.slice(entry.offset, entry.offset + 30).arrayBuffer());
  const start = entry.offset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
  if (header.getUint32(0, true) !== 0x04034b50 || header.getUint16(8, true) !== entry.method ||
      header.getUint16(6, true) !== entry.flags || start + entry.compressed > entry.boundary) {
    throw Error("Повреждён заголовок ZIP.");
  }
  let stream = blob.slice(start, start + entry.compressed).stream();
  if (entry.method === 8) {
    let inflate;
    try { inflate = new DecompressionStream("deflate-raw"); }
    catch { throw Error("Этот браузер не поддерживает распаковку Deflate ZIP."); }
    stream = stream.pipeThrough(inflate);
  }
  const reader = stream.getReader();
  const data = new Uint8Array(entry.size);
  let offset = 0, crc = 0xffffffff;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.length > entry.size) throw Error("Фактический размер файла превышает объявленный в ZIP.");
      data.set(value, offset);
      offset += value.length;
      for (const byte of value) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
    }
  } finally {
    await reader.cancel();
  }
  if (offset !== entry.size || ((crc ^ 0xffffffff) >>> 0) !== entry.crc) throw Error("CRC или размер файла в ZIP не совпадает.");
  return new Blob([data]);
}
