'use strict';

function tlv(id, value) {
  const text = String(value);
  const size = Buffer.byteLength(text, 'utf8');
  if (size > 99) throw new Error('Campo do Pix excede 99 bytes.');
  return id + String(size).padStart(2, '0') + text;
}

function crc16(text) {
  let crc = 0xffff;
  for (const byte of Buffer.from(text, 'utf8')) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function normalizarCampo(valor, maximo) {
  return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, maximo);
}

function gerarPixEstatico({ chave, valorCentavos, nomeRecebedor, cidadeRecebedor, txid }) {
  const key = String(chave || '').trim();
  if (!key || Buffer.byteLength(key, 'utf8') > 77) throw new Error('Configure uma chave Pix válida para o recebimento.');
  if (!Number.isSafeInteger(Number(valorCentavos)) || Number(valorCentavos) < 1) throw new Error('O valor do sinal Pix é inválido.');
  const nome = normalizarCampo(nomeRecebedor, 25);
  const cidade = normalizarCampo(cidadeRecebedor, 15);
  if (!nome || !cidade) throw new Error('Cadastre o nome e a cidade do recebedor nas configurações do estabelecimento.');
  const identificador = String(txid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || 'AGENDA';
  const centavos = Number(valorCentavos);
  const valor = (centavos / 100).toFixed(2);
  const conta = tlv('00', 'br.gov.bcb.pix') + tlv('01', key);
  const adicionais = tlv('05', identificador);
  const campos = [
    tlv('00', '01'),
    tlv('01', '11'),
    tlv('26', conta),
    tlv('52', '0000'),
    tlv('53', '986'),
    tlv('54', valor),
    tlv('58', 'BR'),
    tlv('59', nome),
    tlv('60', cidade),
    tlv('62', adicionais),
  ].join('');
  const payload = campos + '6304';
  return payload + crc16(payload);
}

function gfMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function reedSolomon(data, degree) {
  let generator = [1];
  let root = 1;
  for (let i = 0; i < degree; i++) {
    const next = Array(generator.length + 1).fill(0);
    for (let j = 0; j < generator.length; j++) {
      next[j] ^= generator[j];
      next[j + 1] ^= gfMultiply(generator[j], root);
    }
    generator = next;
    root = gfMultiply(root, 2);
  }
  const remainder = Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    for (let i = 0; i < degree; i++) remainder[i] ^= gfMultiply(generator[i + 1], factor);
  }
  return remainder;
}

function qrBits(payload) {
  const bytes = Buffer.from(payload, 'utf8');
  const version = bytes.length <= 192 ? 8 : 9;
  const dataPerBlock = version === 8 ? 97 : 116;
  const ecPerBlock = version === 8 ? 24 : 30;
  const dataCapacity = dataPerBlock * 2;
  if (bytes.length > dataCapacity) throw new Error('O código Pix é longo demais para gerar o QR Code.');
  const bits = [];
  const append = (value, length) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  append(0b0100, 4);
  append(bytes.length, 8);
  for (const byte of bytes) append(byte, 8);
  const maxBits = dataCapacity * 8;
  for (let i = 0; i < Math.min(4, maxBits - bits.length); i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((n, bit) => (n << 1) | bit, 0));
  for (let pad = 0; data.length < dataCapacity; pad++) data.push(pad % 2 ? 0x11 : 0xec);
  const blocks = [data.slice(0, dataPerBlock), data.slice(dataPerBlock)];
  const ec = blocks.map((block) => reedSolomon(block, ecPerBlock));
  const words = [];
  for (let i = 0; i < dataPerBlock; i++) for (const block of blocks) words.push(block[i]);
  for (let i = 0; i < ecPerBlock; i++) for (const block of ec) words.push(block[i]);
  return { version, bits: words.flatMap((word) => Array.from({ length: 8 }, (_, i) => (word >>> (7 - i)) & 1)) };
}

function bchRemainder(value, polynomial) {
  let rem = value;
  const degree = 31 - Math.clz32(polynomial);
  while (rem && (31 - Math.clz32(rem)) >= degree) rem ^= polynomial << ((31 - Math.clz32(rem)) - degree);
  return rem;
}

function gerarQrSvg(payload) {
  const encoded = qrBits(payload);
  const version = encoded.version;
  const size = version * 4 + 17;
  const matrix = Array.from({ length: size }, () => Array(size).fill(null));
  const setFunction = (x, y, dark) => { if (x >= 0 && y >= 0 && x < size && y < size) matrix[y][x] = Boolean(dark); };

  function finder(cx, cy) {
    for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
      const x = cx + dx, y = cy + dy;
      const inside = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      const dark = inside && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      setFunction(x, y, dark);
    }
  }
  finder(0, 0);
  finder(size - 7, 0);
  finder(0, size - 7);

  const centers = version === 8 ? [6, 24, 42] : [6, 26, 46];
  for (const cy of centers) for (const cx of centers) {
    if ((cx === 6 && cy === 6) || (cx === size - 7 && cy === 6) || (cx === 6 && cy === size - 7)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === null) setFunction(i, 6, i % 2 === 0);
    if (matrix[i][6] === null) setFunction(6, i, i % 2 === 0);
  }

  const formatData = (0b01 << 3) | 0;
  const format = ((formatData << 10) | bchRemainder(formatData << 10, 0x537)) ^ 0x5412;
  for (let i = 0; i <= 5; i++) setFunction(8, i, ((format >>> i) & 1) !== 0);
  setFunction(8, 7, ((format >>> 6) & 1) !== 0);
  setFunction(8, 8, ((format >>> 7) & 1) !== 0);
  setFunction(7, 8, ((format >>> 8) & 1) !== 0);
  for (let i = 9; i < 15; i++) setFunction(14 - i, 8, ((format >>> i) & 1) !== 0);
  for (let i = 0; i < 8; i++) setFunction(size - 1 - i, 8, ((format >>> i) & 1) !== 0);
  for (let i = 8; i < 15; i++) setFunction(8, size - 15 + i, ((format >>> i) & 1) !== 0);
  setFunction(8, size - 8, true);

  const versionInfo = (version << 12) | bchRemainder(version << 12, 0x1f25);
  for (let i = 0; i < 18; i++) {
    const bit = ((versionInfo >>> i) & 1) !== 0;
    const a = size - 11 + (i % 3), b = Math.floor(i / 3);
    setFunction(a, b, bit);
    setFunction(b, a, bit);
  }

  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) {
      const y = upward ? size - 1 - v : v;
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        if (matrix[y][x] !== null) continue;
        const bit = encoded.bits[bitIndex++] || 0;
        setFunction(x, y, Boolean(bit ^ (((x + y) % 2) === 0)));
      }
    }
    upward = !upward;
  }
  if (bitIndex !== encoded.bits.length) throw new Error('Falha ao montar a matriz do QR Code Pix.');

  const quiet = 4;
  let path = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size;) {
      if (!matrix[y][x]) { x++; continue; }
      const start = x;
      while (x < size && matrix[y][x]) x++;
      const largura = x - start;
      path += `M${start + quiet},${y + quiet}h${largura}v1h-${largura}z`;
    }
  }
  const dimension = size + quiet * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" role="img" aria-label="QR Code Pix"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#102b3b" shape-rendering="crispEdges"/></svg>`;
}

function qrDataUri(payload) {
  return 'data:image/svg+xml;base64,' + Buffer.from(gerarQrSvg(payload), 'utf8').toString('base64');
}

module.exports = { gerarPixEstatico, gerarQrSvg, qrDataUri, crc16 };