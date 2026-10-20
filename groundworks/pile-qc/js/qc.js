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
    var gmList = [];
    var umList = [];

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
      var gm = g && k ? delta(g, k) : null; // GNSS − machine
      var um = u && k ? delta(u, k) : null; // UTS − machine
      if (gd) gdList.push(gd);
      if (ud) udList.push(ud);
      if (kd) kdList.push(kd);
      if (kg) kgList.push(kg);
      if (ku) kuList.push(ku);
      if (gm) gmList.push(gm);
      if (um) umList.push(um);
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
        gm: gm,
        um: um,
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
        gnssVsMachine: packAvg(gmList),
        utsVsMachine: packAvg(umList),
      },
      medianZ: {
        gnssDz: medianOf(gdList, 'dz'),
        utsDz: medianOf(udList, 'dz'),
        roverDz: medianOf(gdList, 'dz'),
        machineDz: medianOf(kdList, 'dz'),
        gnssVsMachineDz: medianOf(gmList, 'dz'),
        utsVsMachineDz: medianOf(umList, 'dz'),
      },
      colors: COLORS,
    };
  }

  function fmt(n, digits) {
    if (n == null || !Number.isFinite(n)) return '—';
    return n.toFixed(digits == null ? 3 : digits);
  }

  /**
   * Cluster piles into N–S rows by similar Easting.
   * Rows run north–south (same E, varying N). rowTolFt caps how far E may differ.
   */
  function clusterNorthSouthRows(points, rowTolFt) {
    var tol =
      rowTolFt != null && Number.isFinite(rowTolFt) && rowTolFt > 0 ? rowTolFt : 3;
    var byE = points.slice().sort(function (a, b) {
      return a.e - b.e || a.n - b.n;
    });
    var clusters = [];
    for (var i = 0; i < byE.length; i++) {
      var p = byE[i];
      var placed = false;
      for (var c = 0; c < clusters.length; c++) {
        var cl = clusters[c];
        if (Math.abs(p.e - cl.meanE) <= tol) {
          cl.items.push(p);
          cl.sumE += p.e;
          cl.meanE = cl.sumE / cl.items.length;
          placed = true;
          break;
        }
      }
      if (!placed) {
        clusters.push({ items: [p], sumE: p.e, meanE: p.e });
      }
    }
    clusters.forEach(function (cl) {
      cl.items.sort(function (a, b) {
        return a.n - b.n;
      });
    });
    clusters.sort(function (a, b) {
      return a.meanE - b.meanE;
    });
    return clusters;
  }

  /**
   * Pile-to-pile Z consistency along N–S rows only (separate from design deltas).
   * Each pile is compared to the pile immediately north and south in the same row
   * (same Easting band). East–west neighbors are ignored.
   * options: { source, specFt, rowTolFt }
   */
  function buildPileToPileZ(report, options) {
    options = options || {};
    var source = options.source || 'machine';
    var spec =
      options.specFt != null && Number.isFinite(options.specFt) ? Math.abs(options.specFt) : 0.02;
    var rowTol =
      options.rowTolFt != null && Number.isFinite(options.rowTolFt)
        ? Math.abs(options.rowTolFt)
        : 3;
    var rows = (report && report.rows) || [];
    var points = [];

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var src = r[source];
      if (!src || src.z == null || !Number.isFinite(src.z)) continue;
      var n = r.design && r.design.n != null ? r.design.n : src.n;
      var e = r.design && r.design.e != null ? r.design.e : src.e;
      if (n == null || e == null || !Number.isFinite(n) || !Number.isFinite(e)) continue;
      points.push({
        id: r.id,
        n: n,
        e: e,
        z: src.z,
        index: points.length,
        northId: null,
        southId: null,
        northIndex: null,
        southIndex: null,
        northDz: null,
        southDz: null,
        absDz: null,
        dz: null,
        horiz: null,
        neighborId: null,
        neighborIndex: null,
        pass: true,
        rowIndex: -1,
      });
    }

    var empty = {
      source: source,
      specFt: spec,
      rowTolFt: rowTol,
      rowCount: 0,
      count: 0,
      passCount: 0,
      failCount: 0,
      pairFailCount: 0,
      maxAbsDz: null,
      meanAbsDz: null,
      medianAbsDz: null,
      points: [],
      edges: [],
      ok: true,
    };
    if (points.length < 2) return empty;

    var clusters = clusterNorthSouthRows(points, rowTol);
    var edges = [];
    var absList = [];
    var failCount = 0;
    var pairFailCount = 0;
    var maxAbs = 0;
    var sumAbs = 0;
    var edgeCount = 0;

    for (var c = 0; c < clusters.length; c++) {
      var items = clusters[c].items;
      for (var k = 0; k < items.length; k++) {
        items[k].rowIndex = c;
      }
      for (k = 0; k < items.length; k++) {
        var pa = items[k];
        var south = k > 0 ? items[k - 1] : null;
        var north = k < items.length - 1 ? items[k + 1] : null;
        var worstAbs = 0;
        var worstDz = null;
        var worstHoriz = null;
        var worstId = null;
        var worstIndex = null;
        var pass = true;

        if (south) {
          pa.southId = south.id;
          pa.southIndex = south.index;
          pa.southDz = pa.z - south.z;
          var absS = Math.abs(pa.southDz);
          var horizS = Math.abs(pa.n - south.n);
          if (absS > worstAbs) {
            worstAbs = absS;
            worstDz = pa.southDz;
            worstHoriz = horizS;
            worstId = south.id;
            worstIndex = south.index;
          }
          if (absS > spec + 1e-12) pass = false;
        }
        if (north) {
          pa.northId = north.id;
          pa.northIndex = north.index;
          pa.northDz = pa.z - north.z;
          var absN = Math.abs(pa.northDz);
          var horizN = Math.abs(pa.n - north.n);
          if (absN > worstAbs) {
            worstAbs = absN;
            worstDz = pa.northDz;
            worstHoriz = horizN;
            worstId = north.id;
            worstIndex = north.index;
          }
          if (absN > spec + 1e-12) pass = false;
        }

        // End-of-row piles with no N/S neighbor: no pair to check → pass
        if (!south && !north) {
          pa.absDz = 0;
          pa.dz = 0;
          pa.horiz = 0;
          pa.pass = true;
          continue;
        }

        pa.absDz = worstAbs;
        pa.dz = worstDz;
        pa.horiz = worstHoriz;
        pa.neighborId = worstId;
        pa.neighborIndex = worstIndex;
        pa.pass = pass;
        if (!pass) failCount++;

        // One undirected edge per consecutive N–S pair (use south link only)
        if (south) {
          var absEdge = Math.abs(pa.z - south.z);
          var dzEdge = pa.z - south.z;
          var horizEdge = Math.abs(pa.n - south.n);
          var edgePass = absEdge <= spec + 1e-12;
          edges.push({
            idA: south.id,
            idB: pa.id,
            indexA: south.index,
            indexB: pa.index,
            absDz: absEdge,
            dz: dzEdge,
            horiz: horizEdge,
            pass: edgePass,
            direction: 'N-S',
            rowIndex: c,
          });
          absList.push(absEdge);
          sumAbs += absEdge;
          edgeCount++;
          if (absEdge > maxAbs) maxAbs = absEdge;
          if (!edgePass) pairFailCount++;
        }
      }
    }

    if (!edgeCount) {
      empty.points = points;
      empty.rowCount = clusters.length;
      empty.count = points.length;
      return empty;
    }

    absList.sort(function (x, y) {
      return x - y;
    });
    var mid = Math.floor(absList.length / 2);
    var medianAbs =
      absList.length % 2 === 0 ? (absList[mid - 1] + absList[mid]) / 2 : absList[mid];

    return {
      source: source,
      specFt: spec,
      rowTolFt: rowTol,
      rowCount: clusters.length,
      count: points.length,
      passCount: points.length - failCount,
      failCount: failCount,
      pairFailCount: pairFailCount,
      maxAbsDz: maxAbs,
      meanAbsDz: sumAbs / edgeCount,
      medianAbsDz: medianAbs,
      points: points,
      edges: edges,
      ok: failCount === 0 && pairFailCount === 0,
    };
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
      'dN_gnss_mach',
      'dE_gnss_mach',
      'dZ_gnss_mach',
      'Horiz_gnss_mach',
      'dN_uts_mach',
      'dE_uts_mach',
      'dZ_uts_mach',
      'Horiz_uts_mach',
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
          dz(r.gm, 'dn'),
          dz(r.gm, 'de'),
          dz(r.gm, 'dz'),
          dz(r.gm, 'horiz'),
          dz(r.um, 'dn'),
          dz(r.um, 'de'),
          dz(r.um, 'dz'),
          dz(r.um, 'horiz'),
        ].join(',')
      );
    });
    return lines.join('\r\n');
  }

  return {
    COLORS: COLORS,
    buildReport: buildReport,
    buildPileToPileZ: buildPileToPileZ,
    commonIds: commonIds,
    favorLabel: favorLabel,
    fmt: fmt,
    rowsToCsv: rowsToCsv,
  };
})();
