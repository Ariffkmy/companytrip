/* ═══════════════════════════════════════════════════
   A minimal ZIP writer — stored, not compressed
   ═══════════════════════════════════════════════════

   Album photos and videos are JPEG and MP4, already as small as they
   get, so squeezing them again would only cost the phone time. Each
   file goes in as it is. No ZIP64: keep an archive under 4 GB (the
   album splits its download into much smaller parts anyway). */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* MS-DOS time and date, as ZIP keeps them (local time, 2 s steps). */
function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: (Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** Collects files, then builds one .zip Blob. */
export class ZipWriter {
  constructor() {
    this.parts = [];
    this.central = [];
    this.offset = 0;
    this.files = 0;
    this.names = new Set();
  }

  get size() { return this.offset; }
  get count() { return this.files; }

  /* Two files with the same name would hide one another when unzipped. */
  uniqueName(name) {
    if (!this.names.has(name)) { this.names.add(name); return name; }
    const dot = name.lastIndexOf('.');
    const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
    for (let i = 2; ; i++) {
      const next = `${stem}-${i}${ext}`;
      if (!this.names.has(next)) { this.names.add(next); return next; }
    }
  }

  /** Add a File (or Blob with a name). `modified` defaults to now. */
  async add(file, name = file.name, modified = new Date()) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const nameBytes = new TextEncoder().encode(this.uniqueName(name));
    const crc = crc32(bytes);
    const { time, date } = dosTime(modified);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);       // version needed
    local.setUint16(6, 0x0800, true);   // UTF-8 names
    local.setUint16(8, 0, true);        // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, bytes.length, true);
    local.setUint32(22, bytes.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);       // version made by
    entry.setUint16(6, 20, true);       // version needed
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 0, true);
    entry.setUint16(12, time, true);
    entry.setUint16(14, date, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, bytes.length, true);
    entry.setUint32(24, bytes.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, this.offset, true); // the rest stays 0

    /* The Blob keeps the file; the byte copy is dropped after the CRC. */
    this.parts.push(local, nameBytes, file);
    this.central.push(entry, nameBytes);
    this.offset += 30 + nameBytes.length + bytes.length;
    this.files += 1;
  }

  /** The finished archive. */
  blob() {
    const cdSize = this.central.reduce((s, p) => s + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, this.count, true);
    end.setUint16(10, this.count, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, this.offset, true);
    return new Blob([...this.parts, ...this.central, end], { type: 'application/zip' });
  }
}
