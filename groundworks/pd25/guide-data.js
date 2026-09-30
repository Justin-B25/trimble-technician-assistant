/**
 * Vermeer PD25R measure-up guide — sourced from OEM measure-up guide (Dec 2025).
 * Phases 1–3 & 6 = technician verification funnel; phases 4–5 = survey calculator.
 */
var PD25_GUIDE = {
  product: 'Trimble Groundworks',
  machine: 'Vermeer PD25R Pile Driver',
  docTitle: 'OEM Vermeer PD25R Measure Up Guide',
  accuracyBanner:
    'Groundworks accuracy depends on Vermeer mechanical calibration, correct reference positioning, and verified measure-up values. Complete every phase in this guide before relying on guidance.',

  machineAssumptions: [
    'Moving Base (MB) must be the antenna closest to the mast.',
    'Heading (H) must be the rear antenna on the machine.',
    'Antenna brackets are assumed left of the mast (standard PD25 MB and H mounting).',
    'Reference position: mast foot lowered, Y slide in, X slide fully left (engine side).',
  ],

  requiredTooling: [
    'Trimble SPS930 total station',
    'Tri-Max tripod',
    'Trimble data collector',
    'Minimum 5 acrylic targets',
    'Calibrated smart level',
    'Plumb bob',
  ],

  /** COGO constants from guide — metric primary (reverse-verified against ECM CSV). */
  cogo: {
    offsetLine: {
      /** Siteworks step 1: perpendicular horizontal offset of ML→MR line (right +). */
      horizontalM: 0.083,
      horizontalFt: 0.272,
      /** Siteworks step 2: vertical offset applied to the horizontally offset line (up +). */
      verticalM: 0.322,
      verticalFt: 1.056,
      note:
        'Mirror Siteworks: offset ML→MR line horizontally (83 mm / 0.272 ft right), then vertically (322 mm / 1.056 ft up) to form Line PT1–Line PT2.',
    },
    centerRef: {
      distanceM: 0.263,
      distanceFt: 0.862,
      note: 'From Line PT1 along the offset line toward Line PT2 (Y-pivot on offset line).',
    },
    /** Measure-up post height only (P/N 105568 = 200 mm). User enters this; calculator adds APC offset. */
    rodPostHeight: { metricM: 0.2, usft: 0.656 },
    /** Acrylic target center on post → Zephyr 3 Rugged APC (added behind the scenes). */
    apcOffsetZephyr3Rugged: { metricM: 0.004, usft: 0.013 },
    ewToolHeightM: 0.2,
    rodHeightNote:
      'Enter measure-up post height only (e.g. 200 mm for P/N 105568). The calculator adds 4 mm to reach Zephyr 3 Rugged APC when correcting MB/H elevations from prism height.',
  },

  surveyPoints: [
    { id: 'ML', label: 'Mast Left — flange face at X-pin elevation (ML)', required: true },
    { id: 'MR', label: 'Mast Right — flange face at X-pin elevation (MR)', required: true },
    { id: 'MB', label: 'Moving Base antenna APC (MB)', required: true },
    { id: 'H', label: 'Heading antenna APC (H)', required: true },
    {
      id: 'MT',
      label: 'Mast Tilt — X tilt pin center (MT — required when measuring B5)',
      required: false,
      b5MeasureRequired: true,
    },
    { id: 'MF', label: 'Mast foot (MF — optional T5)', required: false },
    { id: 'HC', label: 'Hammer center (HC — optional T1)', required: false },
  ],

  groundworksDefaults: {
    useDefaults: ['T4', 'T6', 'T7', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'B5'],
    measureRequired: ['G1', 'G2', 'G5', 'G6', 'G7', 'T1', 'T5', 'T2', 'T3'],
  },

  /** Sign conventions for Groundworks Body Pitch/Roll Calibration */
  bodyCalibrationSigns: {
    heading: 'Body pitch & roll calibration',
    intro:
      'Preferred: calibrate pitch and roll offset values in Trimble Groundworks on a level pad. If that is not possible, use the sign rules below to determine whether you enter a positive (+) or negative (−) value so Groundworks generates the correct TS900 sensor offset.',
    signRulesLabel: 'Sign rules',
    offsetNoteLabel: 'After Save — sensor offsets',
    offsetNote:
      'When you press Save in Groundworks, you apply a sensor offset on the axis you are calibrating (pitch or roll). After both pitch and roll are complete, check each offset value — it should be small (under 1 degree) if the TS900 is mounted truly vertical on both the X and Y axes. An incorrect sign usually produces a false offset that is noticeably larger than the correct value. Always verify computed pitch and roll against your smart level, preferably with some slope on the machine body, as a final check.',
    pitch: {
      title: 'Pitch calibration (front-to-back)',
      rules: [
        {
          condition: 'Rear is UP',
          sign: 'Positive (+)',
          example: {
            image: 'assets/images/pd25-body-pitch-rear-up.png?v=2',
            imageAlt: 'PD25R with rear elevated — positive pitch example',
            title: 'Rear up — positive pitch',
            caption: 'When the rear of the machine is higher than the front, enter a positive (+) pitch value in Groundworks.',
          },
        },
        {
          condition: 'Rear is DOWN',
          sign: 'Negative (−)',
          example: {
            image: 'assets/images/pd25-body-pitch-rear-down.png',
            imageAlt: 'PD25R with rear lowered — negative pitch example',
            title: 'Rear down — negative pitch',
            caption: 'When the rear of the machine is lower than the front, enter a negative (−) pitch value in Groundworks.',
          },
        },
      ],
    },
    roll: {
      title: 'Roll calibration (side-to-side)',
      rules: [
        { condition: 'Right side is UP', sign: 'Negative (−)' },
        {
          condition: 'Right side is DOWN',
          sign: 'Positive (+)',
          example: {
            image: 'assets/images/pd25-body-roll-right-down.png',
            imageAlt: 'PD25R with right side lowered — positive roll example',
            title: 'Right side down — positive roll',
            caption:
              'When the right side of the machine is lower than the left, enter a positive (+) roll value in Groundworks.',
            maxDisplayWidth: 300,
          },
        },
      ],
    },
  },

  phases: [
    {
      id: 'phase-1',
      title: 'Phase 1 — Vermeer mechanical calibrations',
      critical: true,
      summary:
        'Do not skip. Groundworks relies on Vermeer internal sensors for mast position relative to the chassis.',
      steps: [
        {
          id: 'p1-depth-high',
          title: 'Depth sensor adjustment — high-left',
          body:
            'Set magnetic pickup face ~1/8" (3 mm) from the strip. Too close risks damage; too far causes Z dropout and inconsistent pile depth.',
          image: 'assets/images/pd25-depth-sensor-high-left.png',
          imageAlt: 'High-left depth proximity sensor mounted on the mast slide — pickup face near the magnetic strip',
        },
        {
          id: 'p1-depth-low',
          title: 'Depth sensor adjustment — low-left',
          body:
            'Set magnetic pickup face ~1/8" (3 mm) from the strip on the low-left sensor. Match the same gap as the high-left sensor.',
          image: 'assets/images/pd25-depth-sensor-low-left.png',
          imageAlt: 'Low-left depth proximity sensor on the mast — pickup face near the vertical beam',
        },
        {
          id: 'p1-mast-slide',
          title: 'Mast slide adjustment',
          body:
            'Tighten mast slides to minimize left/right movement of the hammer on the mast without binding.',
          image: 'assets/images/pd25-mast-slide-calibration.png',
          imageAlt: 'Technician adjusting mast slide hardware on the PD25 mast',
        },
        {
          id: 'p1-xy-slide-cal',
          title: 'X & Y slide calibration',
          body:
            'Zero X slide and Y slide position sensors per Vermeer procedure using the Vermeer Operator Remote.',
          noteWarning: true,
          note:
            'X and Y slide calibration must be done with the Vermeer Operator Remote. Be careful and watch the mast throughout this procedure. If the mast is slid all the way toward the engine bay, it may hit the Zephyr antenna when the mast automatically lowers for calibration.',
        },
        {
          id: 'p1-plumb',
          title: 'Plumb the mast (X & Y)',
          body:
            'Before zeroing the SICK sensor, plumb the mast in both X and Y. With the hammer relatively tight to the mast (minimal left/right play), use the hammer as your vertical reference — place a calibrated smart level on the hammer face or mast member and adjust until you read plumb in both directions.',
          image: 'assets/images/pd25-plumb-mast-smart-level.png',
          imageAlt: 'Smart level used on the PD25 mast and hammer to verify plumb in X and Y before SICK calibration',
        },
        {
          id: 'p1-sick',
          title: 'Mast inclination (SICK sensor)',
          body:
            'With the mast plumb, zero SICK inclination in the Vermeer UI.',
          image: 'assets/images/pd25-mast-inclination-sick-sensor.png',
          imageAlt: 'SICK mast inclination sensor mounted under protective bracket on the PD25 mast',
        },
      ],
    },
    {
      id: 'phase-2',
      title: 'Phase 2 — Reference position & targets',
      critical: true,
      summary: 'Most critical for antenna left/back offsets (G1, G2, G5, G6).',
      steps: [
        {
          id: 'p2-ref',
          title: 'Reference position',
          body:
            'Firm level ground · plumb mast · lower mast foot fully · Y slide retracted IN (mast in) · X slide fully LEFT (engine side / mast left).',
          image: 'assets/images/pd25-x-y-slide-reference.png',
          imageAlt: 'PD25 reference position — X slide (mast left/right) and Y slide (mast in/out)',
        },
        {
          id: 'p2-ml',
          title: 'Target ML — mast left X-slide pin flange',
          body:
            'Target the flange face at the elevation of the X-pin center (Mast Pivot / Y). The calculator offsets this line horizontally to the X-pin centerline (or use 0 if you shoot the centerline directly).',
        },
        {
          id: 'p2-mr',
          title: 'Target MR — mast right X-slide pin flange',
          body:
            'Target the flange face at the elevation of the X-pin center (Mast Pivot / Y), matching ML. Together ML/MR define the flange-face line used for the horizontal offset to pin center.',
        },
        {
          id: 'p2-mt',
          title: 'Target MT — Mast Tilt / X tilt pin center (when measuring B5)',
          body:
            'Mast Tilt (MT) is the pin where the mast tilts left/right (X). Mast Pivot is the front/back (Y) X-pin axis from ML/MR. Shooting MT usually requires resecting the total station to the rear of the machine. Required only if you choose Measure B5 in the calculator; otherwise B5 uses prepopulated OEM offsets.',
          optional: true,
        },
        {
          id: 'p2-mf',
          title: 'Target MF — mast foot / pile guide seam (optional)',
          body: 'Mast foot / pile guide seam for T5. Mast must be completely lowered. Optional if not using T5.',
          optional: true,
        },
        {
          id: 'p2-mb',
          title: 'Target MB — moving base Zephyr 3 (mast side)',
          body: 'Use EW measure-up tool P/N 105568; post vertical. Rod height 0.200 m / 0.656 ft (post only).',
        },
        {
          id: 'p2-h',
          title: 'Target H — heading Zephyr 3 (rearward)',
          body: 'Use EW measure-up tool P/N 105568; post vertical. Rod height 0.200 m / 0.656 ft (post only).',
        },
        {
          id: 'p2-hc',
          title: 'Target HC — hammer center (optional)',
          body: 'Hammer center (pile guide / jaw opening center) for T1. Optional if tuning T1 on pile later.',
          optional: true,
        },
        {
          id: 'p2-antenna',
          title: 'Antenna mounting note',
          body:
            'If brackets are angled, do not measure a leaned post — use vertical post at APC center or acrylic target above APC. Recommend Trimble P/N 133676 for Z3R on PD25R.',
        },
      ],
    },
    {
      id: 'phase-3',
      title: 'Phase 3 — Siteworks measurement',
      critical: false,
      summary: 'Collect control points before COGO / calculator.',
      steps: [
        {
          id: 'p3-project',
          title: 'Project & instrument',
          body: 'Create Siteworks project in US ft or meters. Connect and level SPS930.',
        },
        {
          id: 'p3-settings',
          title: 'Target settings',
          body:
            'Rod height 0.00 for all control points (ML, MR, MF, MB, H, HC, MT). Target type: acrylic. Add MB/H post height in the calculator — not in Siteworks.',
        },
        {
          id: 'p3-shoot',
          title: 'Measure & record',
          body:
            'Shoot ML, MR, MB, H, and MF or HC if used. If measuring B5, resect to the rear and shoot MT (Mast Tilt). Record all as control points. Export CSV for calculator below.',
        },
      ],
    },
    {
      id: 'phase-4-5',
      title: 'Phase 4–5 — COGO & Groundworks values',
      critical: false,
      summary:
        'Use the measure-up calculator after Phases 1–3. Enter G values and T5/T1 from survey, then finalize T2 and T3 on a plumb installed pile.',
      steps: [
        {
          id: 'p45-gw-values',
          title: 'Enter survey values in Groundworks',
          body:
            'From the measure-up calculator, enter G6, G5, G2, G1, G7, and T5/T1 when computed. T2 and T3 are set on a plumb pile after the machine is on piles (next step).',
        },
        {
          id: 'p45-pile-tune',
          title: 'Tune T1, T2 & T3 on a plumb pile',
          body:
            'Drive or place a plumb pile, then set the machine on that pile. Zero guidance in one direction, then rotate the machine 180°, set back on the same pile, and verify. Use this check to dial in T1, T2, and T3.',
          note:
            'Final T2 and T3 values come from this plumb-pile procedure — not from the static measure-up calculator. After the 180° check, residual error in T1, T2, or T3 should be small. If you cannot zero the error and must enter values much greater than 0.10 ft (30.48 mm), revisit Phase 1 calibrations and your full measure-up before relying on guidance.',
        },
      ],
    },
    {
      id: 'phase-6',
      title: 'Phase 6 — Body pitch & roll calibration',
      critical: true,
      summary: 'Final step for slope compensation in Groundworks.',
      showBodyCalibrationSigns: true,
      steps: [
        {
          id: 'p6-level',
          title: 'Smart level on body frame',
          body: 'Place calibrated smart level on a frame member that represents the machine body plane.',
          image: 'assets/images/pd25-smart-level-body-frame.png',
          imageAlt: 'Sola GO smart level placed on the PD25 body frame for pitch and roll readings',
        },
        {
          id: 'p6-read',
          title: 'Read pitch & roll from smart level',
          body: 'Record the pitch (front-to-back) and roll (side-to-side) values shown on the smart level before entering them in Groundworks.',
          image: 'assets/images/pd25-body-cal-diagnostics-roll.png',
          imageAlt: 'Groundworks body tilt sensor diagnostics showing computed roll value to compare against smart level',
          imageModal: true,
          imageModalTitle: 'Groundworks diagnostics — computed roll',
          imageModalCaption:
            'Open Body tilt sensor diagnostics and compare computed pitch and roll to your smart level readings on the body frame.',
          note:
            'Cross-check in Groundworks diagnostics (Body tilt sensor): computed pitch and roll should closely match your smart level readings.',
        },
        {
          id: 'p6-enter',
          title: 'Enter values in Groundworks & save',
          body:
            'Open Body Pitch/Roll Calibration in Trimble Groundworks. Enter pitch and roll using the sign rules above, then press Save.',
        },
      ],
    },
  ],
};
