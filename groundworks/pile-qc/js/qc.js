/**
 * Join loaded sources and compute QC deltas / averages.
 * Sources: design, gnss (rover), uts (rover), machine.
 * With design: report IDs = design ∩ (gnss ∪ uts ∪ machine). Series averages
 * use only piles that have both sides of that comparison (Both mode does not
 * require GNSS∩UTS∩machine).
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

  function sortIds(ids) {
    ids.sort(function (a, b) {
      var na = Number(a);
      var nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    });
    return ids;
  }

  /**
   * Report ID set:
   * - With design + any other source(s): design ∩ (union of loaded gnss/uts/machine)
   * - Without design: intersection of every loaded non-design source
   */
  function commonIds(sourceMaps) {
    var maps = normalizeSourceMaps(sourceMaps);
    var sourcesUsed = [];
    var otherKeys = [];
    ['gnss', 'uts', 'machine'].forEach(function (key) {
      if (isLoaded(maps[key])) {
        otherKeys.push(key);
        sourcesUsed.push(key);
      }
    });

    if (isLoaded(maps.design)) {
      sourcesUsed = ['design'].concat(sourcesUsed);
      if (!otherKeys.length) return { ids: [], sourcesUsed: sourcesUsed, join: 'design-only' };
      var ids = mapKeys(maps.design).filter(function (id) {
        for (var i = 0; i < otherKeys.length; i++) {
          if (maps[otherKeys[i]][id]) return true;
        }
        return false;
      });
      return { ids: sortIds(ids), sourcesUsed: sourcesUsed, join: 'design-union' };
    }

    if (!otherKeys.length) return { ids: [], sourcesUsed: [], join: 'empty' };
    var sets = otherKeys.map(function (k) {
      return maps[k];
    });
    var order = sets
      .map(function (m, i) {
        return { m: m, i: i, n: mapKeys(m).length };
      })
      .sort(function (a, b) {
        return a.n - b.n;
      });
    var inter = mapKeys(order[0].m).filter(function (id) {
      for (var i = 1; i < order.length; i++) {
        if (!order[i].m[id]) return false;
      }
      return true;
    });
    return { ids: sortIds(inter), sourcesUsed: sourcesUsed, join: 'intersection' };
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
      joinMode: common.join || 'design-union',
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
        /** Piles in the report (design ∩ at least one as-built source). */
        common: rows.length,
        /** Alias — sample size used for charts/table (not full design count). */
        sample: rows.length,
        gnssVsDesign: gdList.length,
        utsVsDesign: udList.length,
        machineVsDesign: kdList.length,
        gnssVsMachine: gmList.length,
        utsVsMachine: umList.length,
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

  function medianNumber(vals) {
    if (!vals || !vals.length) return null;
    var a = vals.slice().sort(function (x, y) {
      return x - y;
    });
    var mid = Math.floor(a.length / 2);
    if (a.length % 2 === 0) return (a[mid - 1] + a[mid]) / 2;
    return a[mid];
  }

  /**
   * Pile-to-pile Z consistency along N–S design rows — design Z vs as-built Z only.
   * Machine is never used. As-built is GNSS or UTS (options.asBuiltSource).
   *
   * For each N–S neighbor pair, compare residuals:
   *   ΔZ = Z_asBuilt − Z_design
   *   pair metric = |ΔZ_i − ΔZ_j|
   * Spec applies to that pair metric (default 0.02 ft).
   *
   * options: {
   *   designMap, asBuiltMap, asBuiltSource: 'gnss'|'uts',
   *   specFt, rowTolFt, maxGapFactor
   * }
   */
  function buildPileToPileZ(options) {
    options = options || {};
    var asBuiltSource = options.asBuiltSource === 'uts' ? 'uts' : 'gnss';
    var designMap = options.designMap || Object.create(null);
    var asBuiltMap = options.asBuiltMap || Object.create(null);
    var spec =
      options.specFt != null && Number.isFinite(options.specFt) ? Math.abs(options.specFt) : 0.02;
    var rowTol =
      options.rowTolFt != null && Number.isFinite(options.rowTolFt)
        ? Math.abs(options.rowTolFt)
        : 3;
    var maxGapFactor =
      options.maxGapFactor != null && Number.isFinite(options.maxGapFactor)
        ? options.maxGapFactor
        : 2.5;

    var empty = {
      source: asBuiltSource,
      asBuiltSource: asBuiltSource,
      metric: 'design-vs-asbuilt-residual',
      specFt: spec,
      rowTolFt: rowTol,
      rowCount: 0,
      count: 0,
      passCount: 0,
      failCount: 0,
      pairFailCount: 0,
      skippedGapPairs: 0,
      maxAbsDz: null,
      meanAbsDz: null,
      medianAbsDz: null,
      points: [],
      edges: [],
      ok: true,
      error: null,
    };

    if (!isLoaded(designMap)) {
      empty.error = 'Design required for pile-to-pile Z (rows + design Z).';
      return empty;
    }
    if (!isLoaded(asBuiltMap)) {
      empty.error =
        'As-built ' + asBuiltSource.toUpperCase() + ' stakeout required (machine is not used).';
      return empty;
    }

    var points = [];
    var ids = mapKeys(designMap);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var d = designMap[id];
      var ab = asBuiltMap[id];
      if (!d || !ab) continue;
      if (d.z == null || ab.z == null || !Number.isFinite(d.z) || !Number.isFinite(ab.z)) continue;
      if (d.n == null || d.e == null || !Number.isFinite(d.n) || !Number.isFinite(d.e)) continue;
      var dzVsDesign = ab.z - d.z;
      points.push({
        id: id,
        n: d.n,
        e: d.e,
        zDesign: d.z,
        zAsBuilt: ab.z,
        dzVsDesign: dzVsDesign,
        z: dzVsDesign, // chart bars use .absDz on residual diffs; keep residual on z for legacy
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
        gapSkippedSouth: false,
        gapSkippedNorth: false,
      });
    }

    empty.count = points.length;
    if (points.length < 2) {
      empty.error = 'Need at least two piles with design + ' + asBuiltSource.toUpperCase() + ' Z.';
      empty.points = points;
      return empty;
    }

    var clusters = clusterNorthSouthRows(points, rowTol);
    var edges = [];
    var absList = [];
    var failCount = 0;
    var pairFailCount = 0;
    var skippedGapPairs = 0;
    var maxAbs = 0;
    var sumAbs = 0;
    var edgeCount = 0;

    for (var c = 0; c < clusters.length; c++) {
      var items = clusters[c].items;
      for (var k = 0; k < items.length; k++) items[k].rowIndex = c;

      var spacings = [];
      for (k = 1; k < items.length; k++) {
        spacings.push(Math.abs(items[k].n - items[k - 1].n));
      }
      var medSpace = medianNumber(spacings);
      var maxGap =
        medSpace != null && medSpace > 0
          ? Math.max(medSpace * maxGapFactor, medSpace + 0.5)
          : Infinity;

      for (k = 0; k < items.length; k++) {
        var pa = items[k];
        var southCand = k > 0 ? items[k - 1] : null;
        var northCand = k < items.length - 1 ? items[k + 1] : null;
        var south =
          southCand && Math.abs(pa.n - southCand.n) <= maxGap + 1e-9 ? southCand : null;
        var north =
          northCand && Math.abs(pa.n - northCand.n) <= maxGap + 1e-9 ? northCand : null;
        if (southCand && !south) pa.gapSkippedSouth = true;
        if (northCand && !north) pa.gapSkippedNorth = true;

        var worstAbs = 0;
        var worstDz = null;
        var worstHoriz = null;
        var worstId = null;
        var worstIndex = null;
        var pass = true;
        var hasNeighbor = false;

        if (south) {
          hasNeighbor = true;
          pa.southId = south.id;
          pa.southIndex = south.index;
          // Residual difference: (ab−des)_i − (ab−des)_j
          pa.southDz = pa.dzVsDesign - south.dzVsDesign;
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
          hasNeighbor = true;
          pa.northId = north.id;
          pa.northIndex = north.index;
          pa.northDz = pa.dzVsDesign - north.dzVsDesign;
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

        if (!hasNeighbor) {
          pa.absDz = 0;
          pa.dz = 0;
          pa.horiz = 0;
          pa.pass = true;
        } else {
          pa.absDz = worstAbs;
          pa.dz = worstDz;
          pa.horiz = worstHoriz;
          pa.neighborId = worstId;
          pa.neighborIndex = worstIndex;
          pa.pass = pass;
          if (!pass) failCount++;
        }

        if (south && k > 0) {
          var absEdge = Math.abs(pa.dzVsDesign - south.dzVsDesign);
          var dzEdge = pa.dzVsDesign - south.dzVsDesign;
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
            dzDesignA: south.dzVsDesign,
            dzDesignB: pa.dzVsDesign,
          });
          absList.push(absEdge);
          sumAbs += absEdge;
          edgeCount++;
          if (absEdge > maxAbs) maxAbs = absEdge;
          if (!edgePass) pairFailCount++;
        } else if (southCand && !south) {
          skippedGapPairs++;
        }
      }
    }

    empty.points = points;
    empty.rowCount = clusters.length;
    empty.skippedGapPairs = skippedGapPairs;
    if (!edgeCount) {
      empty.error =
        skippedGapPairs > 0
          ? 'No N–S pairs within row spacing (gaps too large).'
          : 'No N–S neighbor pairs found in design rows.';
      return empty;
    }

    var medianAbs = medianNumber(absList);
    return {
      source: asBuiltSource,
      asBuiltSource: asBuiltSource,
      metric: 'design-vs-asbuilt-residual',
      specFt: spec,
      rowTolFt: rowTol,
      rowCount: clusters.length,
      count: points.length,
      passCount: points.length - failCount,
      failCount: failCount,
      pairFailCount: pairFailCount,
      skippedGapPairs: skippedGapPairs,
      maxAbsDz: maxAbs,
      meanAbsDz: sumAbs / edgeCount,
      medianAbsDz: medianAbs,
      points: points,
      edges: edges,
      ok: failCount === 0 && pairFailCount === 0,
      error: null,
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
