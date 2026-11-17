// Minimal .xlsx reader (first sheet -> array of row objects). No dependencies; uses the browser's DecompressionStream.
(function (root) {
  async function inflate(u8) {
    var ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter(); w.write(u8); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }
  function zipEntries(buf) {
    var dv = new DataView(buf), u8 = new Uint8Array(buf), i = buf.byteLength - 22;
    while (i >= 0 && dv.getUint32(i, true) !== 0x06054b50) i--;
    if (i < 0) throw new Error('not an .xlsx file (zip header not found)');
    var n = dv.getUint16(i + 10, true), p = dv.getUint32(i + 16, true), out = {}, dec = new TextDecoder();
    for (var k = 0; k < n; k++) {
      var meth = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      out[dec.decode(u8.subarray(p + 46, p + 46 + nl))] = { meth: meth, csz: csz, off: off };
      p += 46 + nl + el + cl;
    }
    return { dv: dv, u8: u8, e: out };
  }
  async function file(z, name) {
    var e = z.e[name]; if (!e) return null;
    var o = e.off, nl = z.dv.getUint16(o + 26, true), el = z.dv.getUint16(o + 28, true), d = z.u8.subarray(o + 30 + nl + el, o + 30 + nl + el + e.csz);
    var raw = e.meth === 0 ? d : await inflate(d); return new TextDecoder().decode(raw);
  }
  function unesc(s) { return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); }
  function colIdx(ref) { var m = ref.match(/^([A-Z]+)/)[1], n = 0; for (var i = 0; i < m.length; i++) n = n * 26 + m.charCodeAt(i) - 64; return n - 1; }
  function iso(serial) { var d = new Date(Math.round((serial - 25569) * 864e5)); return d.toISOString().slice(0, 10); }
  async function readXlsx(buf) {
    var z = zipEntries(buf), ss = [], sx = await file(z, 'xl/sharedStrings.xml');
    if (sx) (sx.match(/<si[\s>][\s\S]*?<\/si>/g) || []).forEach(function (si) { var t = ''; (si.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).forEach(function (x) { t += x.replace(/<[^>]+>/g, ''); }); ss.push(unesc(t)); });
    var names = Object.keys(z.e).filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); }).sort(function (a, b) { return parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]); });
    if (!names.length) throw new Error('no worksheet found');
    var xml = await file(z, names[0]), rows = [], rx = /<row[^>]*>([\s\S]*?)<\/row>/g, m;
    while ((m = rx.exec(xml))) {
      var cells = [], cx = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, c;
      while ((c = cx.exec(m[1]))) {
        var at = c[1], body = c[2] || '', ref = (at.match(/r="([A-Z]+\d+)"/) || [])[1]; if (!ref) continue;
        var t = (at.match(/t="(\w+)"/) || [])[1], v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (t === 's') v = ss[+v]; else if (t === 'inlineStr') v = unesc((body.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [, ''])[1]); else if (v !== undefined) v = unesc(v);
        cells[colIdx(ref)] = v === undefined ? '' : v;
      }
      rows.push(cells);
    }
    if (!rows.length) return [];
    var hi = 0; for (var q = 0; q < Math.min(rows.length, 40); q++) { var rr = rows[q].filter(function (v) { return v !== undefined && v !== ''; }); if (rr.length >= 5 && rr.some(function (v) { return /brokerage|folio|scheme/i.test(v); })) { hi = q; break; } }
    rows = rows.slice(hi);
    var head = rows.shift().map(function (h) { return String(h === undefined ? '' : h).trim(); });
    var dcols = head.map(function (h, i) { return /date/i.test(h) ? i : -1; }).filter(function (i) { return i >= 0; });
    return rows.filter(function (r) { return r.some(function (x) { return x !== undefined && x !== ''; }); }).map(function (r) {
      var o = {}; for (var k = 0; k < head.length; k++) { var v = r[k] === undefined ? '' : r[k]; o[head[k]] = v; }
      dcols.forEach(function (i) { var v = o[head[i]]; if (/^\d{5}(\.\d+)?$/.test(v) && +v > 20000 && +v < 80000) o[head[i]] = iso(+v); });
      return o;
    });
  }
  root.XLSXR = { readXlsx: readXlsx };
})(typeof window !== 'undefined' ? window : globalThis);
