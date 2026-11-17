// Pure logic: no DOM. Used by index.html and by node tests.
(function (root) {
  function parseCSV(text) {
    var rows = [], row = [], f = '', q = false, i = 0, n = text.length, c;
    while (i < n) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
      else if (c !== '\r') f += c;
      i++;
    }
    if (f.length || row.length) { row.push(f); rows.push(row); }
    var h = rows.shift().map(function (x) { return x.trim(); });
    return rows.filter(function (r) { return r.length > 1; }).map(function (r) {
      var o = {}; for (var k = 0; k < h.length; k++) o[h[k]] = r[k] === undefined ? '' : r[k]; return o;
    });
  }

  // dBASE reader (CAMS holdings file is DBF saved as .xls)
  function parseDBF(buf) {
    var dv = new DataView(buf), u8 = new Uint8Array(buf);
    var nrec = dv.getUint32(4, true), hlen = dv.getUint16(8, true), rlen = dv.getUint16(10, true);
    var fields = [], p = 32, dec = new TextDecoder('latin1');
    while (u8[p] !== 0x0d && p < hlen) {
      var name = dec.decode(u8.subarray(p, p + 11)).replace(/\0.*$/, '');
      fields.push({ name: name, len: u8[p + 16] }); p += 32;
    }
    var out = [];
    for (var r = 0; r < nrec; r++) {
      var off = hlen + r * rlen; if (u8[off] === 0x2a) continue; // deleted
      var o = {}, q = off + 1;
      fields.forEach(function (fd) { o[fd.name] = dec.decode(u8.subarray(q, q + fd.len)).trim(); q += fd.len; });
      out.push(o);
    }
    return out;
  }

  function pd(s) { // M/D/YYYY or YYYY-MM-DD or D-Mon-YYYY
    s = (s || '').trim(); if (!s) return null;
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return new Date(Date.UTC(+m[3], +m[1] - 1, +m[2]));
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    var d = new Date(s + ' UTC'); return isNaN(d) ? null : d;
  }
  function qkey(d) { return d.getUTCFullYear() + '-' + ('0' + (Math.floor(d.getUTCMonth() / 3) * 3 + 1)).slice(-2); }
  function qlabel(k) { var y = k.slice(0, 4), m = +k.slice(5); return ['Jan-Mar', 'Apr-Jun', 'Jul-Sep', 'Oct-Dec'][(m - 1) / 3] + ' ' + y; }
  function num(x) { var v = parseFloat(x); return isNaN(v) ? 0 : v; }
  function clientType(s) {
    s = s || ''; if (s === 'Individual' || s === 'Resident Individual') return 'Individual';
    if (s === 'HUF') return 'HUF'; if (/Minor/.test(s)) return 'Minor'; if (s === 'Company') return 'Company';
    if (s === 'Trust') return 'Trust'; if (/^NRI/.test(s)) return 'NRI'; return s || 'Unknown';
  }

  // Build lots for one AMC code from payout rows. Trail and Additional kept separate, then combined per lot.
  function buildLots(rows, amcCode) {
    var m = {}, order = [];
    rows.forEach(function (r) {
      if (r.AMC_CODE !== amcCode) return;
      var folio = r.FOLIO_NO.replace(/\.0$/, '');
      var key = [folio, r.SCHEME_COD, r.TRXN_NO, r.BRKAGE_FRO, r.BRKAGE_TO].join('|');
      var L = m[key];
      if (!L) {
        L = m[key] = { key: key, folio: folio, scheme: r.SCHEME_COD, name: (r.INV_NAME || '').replace(/\s+/g, ' ').trim(),
          td: pd(r.TRADE_DATE), type: r.TRXN_TYPE, aum: 0, days: num(r.NO_OF_DAYS), trailRate: 0, trail: 0, addRate: 0, add: 0, inc: 0, hasTrail: false };
        order.push(L);
      }
      L.aum = Math.max(L.aum, num(r.AVG_ASSETS));
      if (!L.days) L.days = num(r.NO_OF_DAYS);
      var isAdd = /additional/i.test(r.TRXN_DESC || '');
      var typ = (r.BRKAGE_TYP || '').trim().toUpperCase();
      if (typ && typ !== 'TF' && !isAdd) { L.inc += num(r.BRKAGE_AMT); return; }
      if (isAdd) { L.addRate += num(r.BRKAGE_RAT); L.add += num(r.BRKAGE_AMT); }
      else { L.trailRate += num(r.BRKAGE_RAT); L.trail += num(r.BRKAGE_AMT); L.hasTrail = true; }
    });
    return order;
  }

  // Compare lots to the rate card of the trade quarter. status: ok / below / above / gst / nocard / addonly
  function compare(lots, cfg, newFrom) {
    var nf = newFrom ? pd(newFrom) : null;
    lots.forEach(function (L) {
      L.abbr = cfg.schemeMap[L.scheme.replace(/^0+/, '')] || cfg.schemeMap[L.scheme.replace(/^[A-Z]+/, '').replace(/^0+/, '')] || null;
      L.fund = L.abbr ? (cfg.names[L.abbr] || L.abbr) : 'Unmapped scheme ' + L.scheme;
      L.q = L.td ? qkey(L.td) : null;
      var card = L.abbr && L.q && cfg.rates[L.abbr] ? cfg.rates[L.abbr][L.q] : undefined;
      L.card = card === undefined ? null : card;
      L.exp = L.card === null ? null : L.aum * L.card / 100 * (L.days / 365);
      L.diff = L.exp === null ? null : L.trail - L.exp;
      L.isNew = !!(nf && L.td && L.td >= nf);
      if (!L.hasTrail) L.status = (L.add > 0 ? 'addonly' : 'incentive');
      else if (L.card === null) L.status = 'nocard';
      else {
        var ratio = L.trailRate / L.card;
        L.status = Math.abs(ratio - 1) <= 0.005 ? 'ok' : (ratio > 1.17 && ratio < 1.19) ? 'gst' : ratio < 1 ? 'below' : 'above';
      }
    });
    return lots;
  }

  function aggregate(lots, holdings, keyFn) {
    var m = {};
    lots.forEach(function (L) {
      var k = keyFn(L); var g = m[k.key] || (m[k.key] = { key: k.key, label: k.label, sub: k.sub || '', trail: 0, add: 0, exp: 0, below: 0, above: 0, nolots: 0, lots: 0, flagged: 0, aum: 0 });
      g.trail += L.trail; g.add += L.add; g.lots++; g.aum += L.aum;
      if (L.exp !== null) { g.exp += L.exp; }
      if (L.status === 'below') { g.below += -L.diff; g.flagged++; }
      if (L.status === 'above') g.above += L.diff;
    });
    return Object.keys(m).map(function (k) { return m[k]; });
  }

  
  // KFintech brokerage report -> same internal row shape as the CAMS report
  var KF_AMC = {'117':'Mirae Asset','118':'Edelweiss','120':'Invesco','RMF':'Nippon India','128':'Axis','127':'Motilal Oswal','176':'Sundaram','116':'Bank of India','166':'Quant','108':'UTI','129':'PGIM India','906':'Altiva (Edelweiss SIF)','152':'ITI','172':'Abakkus','908':'Diviniti','101':'Canara Robeco','105':'JM Financial','178':'Baroda BNP Paribas'};
  function dmy(s) { var m = (s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : ''; }
  function isKfin(rows) { return rows.length && rows[0].hasOwnProperty('Product Code') && rows[0].hasOwnProperty('Brokerage (in Rs.)'); }
  function normalizeKfin(rows) {
    return rows.filter(function (r) { return r['Fund']; }).map(function (r) {
      var f = dmy(r['From Date']), t = dmy(r['To Date']), days = (f && t) ? Math.round((new Date(t) - new Date(f)) / 864e5) + 1 : 0;
      var head = r['Brokerage Head'] || '';
      return { AMC_CODE: 'K' + r['Fund'], FOLIO_NO: r['Account Number'], SCHEME_COD: r['Scheme Code'] || r['Product Code'], TRXN_NO: r['Transaction Number'],
        BRKAGE_FRO: f, BRKAGE_TO: t, AVG_ASSETS: r['Average Assets'], BRKAGE_RAT: r['Percentage (%)'], BRKAGE_AMT: r['Brokerage (in Rs.)'], NO_OF_DAYS: days,
        TRADE_DATE: dmy(r['PURCHASE TRXN DATE'] || r['Transaction Date']), INV_NAME: r['Investor Name'], TRXN_TYPE: r['Transaction Description'],
        TRXN_DESC: /add/i.test(head) ? 'Additional ' + head : head, BRKAGE_TYP: 'TF', TAX_STATUS: r['Investor Category'], NOTPAID: /not paid/i.test(r['Brokerage Type'] || '') };
    });
  }

  root.BR = { KF_AMC: KF_AMC, isKfin: isKfin, normalizeKfin: normalizeKfin, parseCSV: parseCSV, parseDBF: parseDBF, pd: pd, qkey: qkey, qlabel: qlabel, num: num, clientType: clientType, buildLots: buildLots, compare: compare, aggregate: aggregate };
  if (typeof module !== 'undefined') module.exports = root.BR;
})(typeof window !== 'undefined' ? window : globalThis);
