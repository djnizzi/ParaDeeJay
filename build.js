// Packages the addon as ParaDeeJay.mmip (a zip with a different extension).
//
// The zip is written directly rather than through PowerShell's Compress-Archive,
// which stores entry names with backslashes; MediaMonkey's extractor would then
// create files literally named "vendor\paradee_int8.onnx" instead of a folder.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = __dirname;
const outPath = path.join(root, 'ParaDeeJay.mmip');

// The artwork is authored as paradeejay.png; info.json points at icon.png, so
// re-saving the artwork and re-running the build is the whole workflow.
const artPath = path.join(root, 'paradeejay.png');
const iconPath = path.join(root, 'icon.png');
if (fs.existsSync(artPath) &&
    (!fs.existsSync(iconPath) || fs.statSync(artPath).mtimeMs > fs.statSync(iconPath).mtimeMs)) {
  fs.copyFileSync(artPath, iconPath);
  console.log('icon: copied paradeejay.png -> icon.png');
}

if (fs.existsSync(iconPath)) {
  const png = fs.readFileSync(iconPath);
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  const alpha = png[25] === 4 || png[25] === 6 || png[28] !== 0;
  console.log('icon: ' + w + 'x' + h + ', ' + Math.round(png.length / 1024) + ' KB' +
    (alpha ? '' : ' (no alpha channel)'));
  if (w > 512 || h > 512) {
    console.log('icon: MediaMonkey shows this small - 256x256 keeps ' +
      Math.round((png.length / 1048576) * 10) / 10 + ' MB out of the package');
  }
}

const entries = [
  'info.json',
  'install.js',
  'init.js',
  'actions_add.js',
  'config.js',
  'config.html',
  'icon.png',
  'platform.js',
  'g2p.js',
  'engine.js',
  'README.md',
  'vendor'
];

// --- crc32 -----------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

// --- collect files ---------------------------------------------------------
function collect(absDir, relDir, out) {
  for (const name of fs.readdirSync(absDir).sort()) {
    const abs = path.join(absDir, name);
    const rel = relDir ? relDir + '/' + name : name;
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) collect(abs, rel, out);
    else out.push({ abs, name: rel });
  }
}

const files = [];
for (const entry of entries) {
  const abs = path.join(root, entry);
  if (!fs.existsSync(abs)) {
    console.error('missing: ' + entry);
    process.exit(1);
  }
  if (fs.statSync(abs).isDirectory()) collect(abs, entry, files);
  else files.push({ abs, name: entry });
}

// --- write zip -------------------------------------------------------------
const DOS_TIME = 0;      // 00:00:00
const DOS_DATE = 0x21;   // 1980-01-01
const locals = [];
const central = [];
let offset = 0;

for (const f of files) {
  const data = fs.readFileSync(f.abs);
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const useDeflate = deflated.length < data.length;
  const body = useDeflate ? deflated : data;
  const crc = crc32(data);
  const nameBuf = Buffer.from(f.name, 'utf8');

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);                                  // version needed
  local.writeUInt16LE(0x0800, 6);                              // UTF-8 names
  local.writeUInt16LE(useDeflate ? 8 : 0, 8);                  // method
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  locals.push(local, nameBuf, body);

  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0);
  cen.writeUInt16LE(20, 4);                                    // version made by
  cen.writeUInt16LE(20, 6);                                    // version needed
  cen.writeUInt16LE(0x0800, 8);
  cen.writeUInt16LE(useDeflate ? 8 : 0, 10);
  cen.writeUInt16LE(DOS_TIME, 12);
  cen.writeUInt16LE(DOS_DATE, 14);
  cen.writeUInt32LE(crc, 16);
  cen.writeUInt32LE(body.length, 20);
  cen.writeUInt32LE(data.length, 24);
  cen.writeUInt16LE(nameBuf.length, 28);
  cen.writeUInt16LE(0, 30);                                    // extra
  cen.writeUInt16LE(0, 32);                                    // comment
  cen.writeUInt16LE(0, 34);                                    // disk
  cen.writeUInt16LE(0, 36);                                    // internal attrs
  cen.writeUInt32LE(0, 38);                                    // external attrs
  cen.writeUInt32LE(offset, 42);
  central.push(cen, nameBuf);

  offset += local.length + nameBuf.length + body.length;
}

const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4);
end.writeUInt16LE(0, 6);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);
end.writeUInt16LE(0, 20);

fs.writeFileSync(outPath, Buffer.concat([...locals, centralBuf, end]));
console.log('wrote ' + outPath + ' (' + (fs.statSync(outPath).size / 1048576).toFixed(1) + ' MB, ' + files.length + ' entries)');
