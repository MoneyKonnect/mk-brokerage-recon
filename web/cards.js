// Rate-card PDF reading in the browser (pdf.js text -> lines -> AMC-specific parser)
(function (root) {
  async function pdfLines(pdfjs, buf, password) {
    var doc = await pdfjs.getDocument({ data: new Uint8Array(buf), password: password || undefined }).promise, lines = [];
    for (var p = 1; p <= doc.numPages; p++) {
      var tc = await (await doc.getPage(p)).getTextContent(), rows = {};
      tc.items.forEach(function (it) { if (!it.str.trim()) return; var y = Math.round(it.transform[5] / 3); (rows[y] = rows[y] || []).push({ x: it.transform[4], w: it.width, s: it.str }); });
      Object.keys(rows).map(Number).sort(function (a, b) { return b - a; }).forEach(function (y) {
        var it = rows[y].sort(function (a, b) { return a.x - b.x; }), s = '', end = null;
        it.forEach(function (t) { if (end !== null && t.x - end > 6) s += '   '; else if (end !== null) s += ' '; s += t.s; end = t.x + t.w; });
        lines.push(s);
      });
    }
    return lines;
  }
  var MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  function qk(d, m, y) { return y + '-' + ('0' + (Math.floor((m - 1) / 3) * 3 + 1)).slice(-2); }
  // Franklin Templeton "Distribution Remuneration Structure": "N) FUND NAME (ABBR)  category  exit load  D  E  F  G"
  function parseFranklin(lines) {
    var t = lines.join('\n'), m = t.match(/period\s+(\d{1,2})-(\w{3})-(\d{4})\s+to\s+(\d{1,2})-(\w{3})-(\d{4})/i);
    if (!m || !/Remuneration Structure/i.test(t)) return null;
    var q = qk(+m[1], MON[m[2]], +m[3]), rates = {}, n = 0;
    lines.forEach(function (ln) {
      var r = ln.match(/^\s*\d+\)\s+(.+?)\s{2,}(.*)$/); if (!r) return;
      var c = r[1].match(/\(([A-Z0-9]{3,8})\)/); if (!c) return;
      var nums = (r[2].match(/(?:^|\s)(\d+\.\d+|\d+)(?=\s|$)/g) || []).map(function (x) { return parseFloat(x); });
      if (nums.length < 4) return; rates[c[1]] = nums[nums.length - 4]; n++;
    });
    return n ? { amc: 'FTI', name: 'Franklin Templeton', quarter: q, from: m[1] + '-' + m[2] + '-' + m[3], to: m[4] + '-' + m[5] + '-' + m[6], rates: rates, count: n } : null;
  }
  function detectAmc(lines) {
    var t = lines.slice(0, 40).join(' ');
    var k = ['Franklin', 'HDFC', 'Kotak', 'Mirae', 'Edelweiss', 'Axis', 'SBI', 'Bandhan', 'Aditya Birla', 'DSP', 'Nippon', 'Invesco', 'Sundaram', 'UTI', 'HSBC', 'WhiteOak', 'Quant', 'PGIM', 'Canara', 'Baroda', 'Bank of India', 'Mahindra', 'Tata', 'Union', 'Helios', 'Motilal', 'ICICI', 'PPFAS', 'JM'];
    var f = k.filter(function (x) { return t.toLowerCase().indexOf(x.toLowerCase()) >= 0; }); return f[0] || 'unknown AMC';
  }
  var PARSERS = [parseFranklin];
  async function readCard(pdfjs, file, passwords) {
    var buf = await file.arrayBuffer(), lines = null, pw = [''].concat(passwords || []);
    for (var i = 0; i < pw.length && !lines; i++) { try { lines = await pdfLines(pdfjs, buf.slice(0), pw[i]); } catch (e) { if (!/password/i.test(e.message || e.name || '')) throw e; } }
    if (!lines) return { error: 'PDF is password protected. Ask me to add the password, or use Axis/PAN-style passwords.' };
    for (var j = 0; j < PARSERS.length; j++) { var r = PARSERS[j](lines); if (r) return r; }
    return { unsupported: true, amcGuess: detectAmc(lines) };
  }
  root.CARDS = { readCard: readCard, parseFranklin: parseFranklin, pdfLines: pdfLines };
})(typeof window !== 'undefined' ? window : globalThis);
