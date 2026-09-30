/**
 * Join loaded sources on common pile IDs and compute QC deltas / averages.
 * Only IDs present in every loaded source type are reported.
 */
var PileQC = (function () {
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
      // Prefer primary direction when one axis dominates strongly
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

  /**
   * Intersection of keys across provided maps (only maps that exist / have data).
   * sourceMaps: { design?, measured?, machine? }
   */
  function commonIds(sourceMaps) {
    var sets = [];
    var labels = [];
    ['design', 'measured', 'machine'].forEach(function (key) {
      var m = sourceMaps[key];
      if (m && mapKeys(m).length) {
        sets.push(m);
        labels.push(key);
      }
    });
    if (!sets.length) return { ids: [], sourcesUsed: [] };

    // Intersect starting from the smallest map for large datasets
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

  function buildReport(sourceMaps) {
    var design = sourceMaps.design || Object.create(null);
    var measured = sourceMaps.measured || Object.create(null);
    var machine = sourceMaps.machine || Object.create(null);

    var common = commonIds({ design: design, measured: measured, machine: machine });
    var rows = [];
    var mdList = [];
    var kdList = [];
    var kmList = [];

    for (var i = 0; i < common.ids.length; i++) {
      var id = common.ids[i];
      var d = design[id] || null;
      var m = measured[id] || null;
      var k = machine[id] || null;
      var md = d && m ? delta(m, d) : null;
      var kd = d && k ? delta(k, d) : null;
      var km = m && k ? delta(k, m) : null;
      if (md) mdList.push(md);
      if (kd) kdList.push(kd);
      if (km) kmList.push(km);
      rows.push({
        id: id,
        design: d,
        measured: m,
        machine: k,
        md: md,
        kd: kd,
        km: km,
      });
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

    return {
      rows: rows,
      sourcesUsed: common.sourcesUsed,
      counts: {
        design: mapKeys(design).length,
        measured: mapKeys(measured).length,
        machine: mapKeys(machine).length,
        common: rows.length,
      },
      avg: {
        measuredVsDesign: packAvg(mdList),
        machineVsDesign: packAvg(kdList),
        machineVsMeasured: packAvg(kmList),
      },
      medianZ: {
        roverDz: medianOf(mdList, 'dz'),
        machineDz: medianOf(kdList, 'dz'),
      },
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
      'Measured_N',
      'Measured_E',
      'Measured_Z',
      'Machine_N',
      'Machine_E',
      'Machine_Z',
      'dN_meas_design',
      'dE_meas_design',
      'dZ_meas_design',
      'Horiz_meas_design',
      'dN_mach_design',
      'dE_mach_design',
      'dZ_mach_design',
      'Horiz_mach_design',
      'dN_mach_meas',
      'dE_mach_meas',
      'dZ_mach_meas',
      'Horiz_mach_meas',
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
          nz(r.measured, 'n'),
          nz(r.measured, 'e'),
          nz(r.measured, 'z'),
          nz(r.machine, 'n'),
          nz(r.machine, 'e'),
          nz(r.machine, 'z'),
          dz(r.md, 'dn'),
          dz(r.md, 'de'),
          dz(r.md, 'dz'),
          dz(r.md, 'horiz'),
          dz(r.kd, 'dn'),
          dz(r.kd, 'de'),
          dz(r.kd, 'dz'),
          dz(r.kd, 'horiz'),
          dz(r.km, 'dn'),
          dz(r.km, 'de'),
          dz(r.km, 'dz'),
          dz(r.km, 'horiz'),
        ].join(',')
      );
    });
    return lines.join('\r\n');
  }

  return {
    buildReport: buildReport,
    commonIds: commonIds,
    favorLabel: favorLabel,
    fmt: fmt,
    rowsToCsv: rowsToCsv,
  };
})();
