/**
 * Join loaded sources on common pile IDs and compute QC deltas / averages.
 * Sources: design, gnss (rover), uts (rover), machine.
 * Only IDs present in every loaded source type are reported.
 */
var PileQC = (function () {
  var COLORS = {
    gnss: '#005f9e',
    uts: '#e36c0a',
    machine: '#006638',
    design: '#6a6e79',
  };

  function delta(a, b) {
    if (!a || !b) return null;
    return {
      dn: a.n - b.n,
      de: a.e - b.e,
      dz: a.z - b.z,
      horiz: Math.sqrt(Math.pow(a.n - b.n, 2) + Math.pow(a.e - b.e, 2)),
    };
  }

  function avgOf(arr, key) {
    if (!arr.length) return null;
    var sum = 0;
    for (var i = 0; i < arr.length; i++) sum += arr[i][key];
    return sum / arr.length;
  }

  function medianOf(arr, key) {
    if (!arr.length) return null;
    var vals = [];
    for (var i = 0; i < arr.length; i++) {
      var v = arr[i][key];
      if (v != null && Number.isFinite(v)) vals.push(v);
    }
    if (!vals.length) return null;
    vals.sort(function (a, b) {
      return a - b;
    });
    var mid = Math.floor(vals.length / 2);
    if (vals.length % 2 === 0) return (vals[mid - 1] + vals[mid]) / 2;
    return vals[mid];
  }

  function favorLabel(de, dn) {
    if (de == null || dn == null) return '—';
    var absE = Math.abs(de);
    var absN = Math.abs(dn);
    var eps = 1e-6;
    if (absE < eps && absN < eps) return 'On design (avg)';
    var ns = absN < eps ? '' : dn > 0 ? 'N' : 'S';
    var ew = absE < eps ? '' : de > 0 ? 'E' : 'W';
    if (ns && ew) {
      if (absN >= absE * 2) return ns + ' of design';
      if (absE >= absN * 2) return ew + ' of design';
      return ns + ew + ' of design';
    }
    if (ns) return ns + ' of design';
    return ew + ' of design';
  }

  function mapKeys(map) {
    return Object.keys(map || {});
  }

  function isLoaded(map) {
    return !!(map && mapKeys(map).length);
  }

  /**
   * Intersection of keys across provided maps (only maps that exist / have data).
   * sourceMaps: { design?, gnss?, uts?, machine? }
   * Also accepts legacy `measured` as alias for gnss.
   */
  function commonIds(sourceMaps) {
    var maps = normalizeSourceMaps(sourceMaps);
    var sets = [];
    var labels = [];
    ['design', 'gnss', 'uts', 'machine'].forEach(function (key) {
      var m = maps[key];
      if (isLoaded(m)) {
        sets.push(m);
        labels.push(key);
      }
    });
    if (!sets.length) return { ids: [], sourcesUsed: [] };

    var order = sets
      .map(function (m, i) {
        return { m: m, i: i, n: mapKeys(m).length };
      })
      .sort(function (a, b) {
        return a.n - b.n;
      });

    var ids = mapKeys(order[0].m).filter(function (id) {
      for (var i = 1; i < order.length; i++) {
        if (!order[i].m[id]) return false;
      }
      return true;
    });
    ids.sort(function (a, b) {
      var na = Number(a);
      var nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    });
    return { ids: ids, sourcesUsed: labels };
  }

  function normalizeSourceMaps(sourceMaps) {
    sourceMaps = sourceMaps || {};
    var gnss = sourceMaps.gnss || sourceMaps.measured || null;
    return {
      design: sourceMaps.design || null,
      gnss: gnss,
      uts: sourceMaps.uts || null,
      machine: sourceMaps.machine || null,
    };
  }

  function packAvg(list) {
    if (!list.length) return null;
    var avg = {
      dn: avgOf(list, 'dn'),
      de: avgOf(list, 'de'),
      dz: avgOf(list, 'dz'),
      horiz: avgOf(list, 'horiz'),
      medianDz: medianOf(list, 'dz'),
      count: list.length,
    };
    avg.favor = favorLabel(avg.de, avg.dn);
    return avg;
  }

  function buildReport(sourceMaps) {
    var maps = normalizeSourceMaps(sourceMaps);
    var design = maps.design || Object.create(null);
    var gnss = maps.gnss || Object.create(null);
    var uts = maps.uts || Object.create(null);
    var machine = maps.machine || Object.create(null);

    var common = commonIds(maps);
    var rows = [];
    var gdList = [];
    var udList = [];
    var kdList = [];
    var kgList = [];
    var kuList = [];

    for (var i = 0; i < common.ids.length; i++) {
      var id = common.ids[i];
      var d = design[id] || null;
      var g = gnss[id] || null;
      var u = uts[id] || null;
      var k = machine[id] || null;
      var gd = d && g ? delta(g, d) : null;
      var ud = d && u ? delta(u, d) : null;
      var kd = d && k ? delta(k, d) : null;
      var kg = g && k ? delta(k, g) : null;
      var ku = u && k ? delta(k, u) : null;
      if (gd) gdList.push(gd);
      if (ud) udList.push(ud);
      if (kd) kdList.push(kd);
      if (kg) kgList.push(kg);
      if (ku) kuList.push(ku);
      rows.push({
        id: id,
        design: d,
        gnss: g,
        uts: u,
        measured: g, // legacy alias for charts/UI during transition
        machine: k,
        gd: gd,
        ud: ud,
        kd: kd,
        kg: kg,
        ku: ku,
        md: gd, // legacy alias (measured/GNSS vs design)
        km: kg, // legacy alias (machine vs GNSS)
      });
    }

    return {
      rows: rows,
      sourcesUsed: common.sourcesUsed,
      hasGnss: isLoaded(gnss),
      hasUts: isLoaded(uts),
      hasMachine: isLoaded(machine),
      hasDesign: isLoaded(design),
      counts: {
        design: mapKeys(design).length,
        gnss: mapKeys(gnss).length,
        uts: mapKeys(uts).length,
        measured: mapKeys(gnss).length,
        machine: mapKeys(machine).length,
        common: rows.length,
      },
      avg: {
        gnssVsDesign: packAvg(gdList),
        utsVsDesign: packAvg(udList),
        measuredVsDesign: packAvg(gdList),
        machineVsDesign: packAvg(kdList),
        machineVsGnss: packAvg(kgList),
        machineVsUts: packAvg(kuList),
        machineVsMeasured: packAvg(kgList),
      },
      medianZ: {
        gnssDz: medianOf(gdList, 'dz'),
        utsDz: medianOf(udList, 'dz'),
        roverDz: medianOf(gdList, 'dz'),
        machineDz: medianOf(kdList, 'dz'),
      },
      colors: COLORS,
    };
  }

  function fmt(n, digits) {
    if (n == null || !Number.isFinite(n)) return '—';
    return n.toFixed(digits == null ? 3 : digits);
  }

  function rowsToCsv(report) {
    var header = [
      'PileID',
      'Design_N',
      'Design_E',
      'Design_Z',
      'GNSS_N',
      'GNSS_E',
      'GNSS_Z',
      'UTS_N',
      'UTS_E',
      'UTS_Z',
      'Machine_N',
      'Machine_E',
      'Machine_Z',
      'dN_gnss_design',
      'dE_gnss_design',
      'dZ_gnss_design',
      'Horiz_gnss_design',
      'dN_uts_design',
      'dE_uts_design',
      'dZ_uts_design',
      'Horiz_uts_design',
      'dN_mach_design',
      'dE_mach_design',
      'dZ_mach_design',
      'Horiz_mach_design',
      'dN_mach_gnss',
      'dE_mach_gnss',
      'dZ_mach_gnss',
      'Horiz_mach_gnss',
      'dN_mach_uts',
      'dE_mach_uts',
      'dZ_mach_uts',
      'Horiz_mach_uts',
    ];
    var lines = [header.join(',')];
    report.rows.forEach(function (r) {
      function nz(p, k) {
        return p && p[k] != null ? p[k] : '';
      }
      function dz(d, k) {
        return d && d[k] != null ? d[k] : '';
      }
      lines.push(
        [
          r.id,
          nz(r.design, 'n'),
          nz(r.design, 'e'),
          nz(r.design, 'z'),
          nz(r.gnss, 'n'),
          nz(r.gnss, 'e'),
          nz(r.gnss, 'z'),
          nz(r.uts, 'n'),
          nz(r.uts, 'e'),
          nz(r.uts, 'z'),
          nz(r.machine, 'n'),
          nz(r.machine, 'e'),
          nz(r.machine, 'z'),
          dz(r.gd, 'dn'),
          dz(r.gd, 'de'),
          dz(r.gd, 'dz'),
          dz(r.gd, 'horiz'),
          dz(r.ud, 'dn'),
          dz(r.ud, 'de'),
          dz(r.ud, 'dz'),
          dz(r.ud, 'horiz'),
          dz(r.kd, 'dn'),
          dz(r.kd, 'de'),
          dz(r.kd, 'dz'),
          dz(r.kd, 'horiz'),
          dz(r.kg, 'dn'),
          dz(r.kg, 'de'),
          dz(r.kg, 'dz'),
          dz(r.kg, 'horiz'),
          dz(r.ku, 'dn'),
          dz(r.ku, 'de'),
          dz(r.ku, 'dz'),
          dz(r.ku, 'horiz'),
        ].join(',')
      );
    });
    return lines.join('\r\n');
  }

  return {
    COLORS: COLORS,
    buildReport: buildReport,
    commonIds: commonIds,
    favorLabel: favorLabel,
    fmt: fmt,
    rowsToCsv: rowsToCsv,
  };
})();
