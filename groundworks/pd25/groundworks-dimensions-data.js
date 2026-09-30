/**
 * OEM Vermeer PD25R measure-up guide — required vs default Groundworks dimensions.
 * Source: OEM_Vermeer_PD25R Measure Up Guide (Dec 2025).
 */
var PD25_GROUNDWORKS_DIMENSIONS = {
  intro:
    'Values marked Measure come from your survey CSV and this calculator. Values marked Use default are fixed PD25R dimensions from the OEM measure-up guide — enter them in Groundworks before relying on guidance on slope.',
  b5Callout:
    'B5 is the vertical from Mast Pivot (X-pin / Y) to Mast Tilt (X tilt pin). On the PD25 it is always negative because Mast Tilt is above the pivot. Choose prepopulated OEM (−1.056 ft / −0.321 m) or measure MT during measure-up (resect to the rear, enter flange→X-pin horizontal offset, shoot MT). Measuring B5 also rebuilds Moving Base and Heading left/back (G6, G5, G2, G1). Wrong sign or magnitude degrades tool position accuracy on slope (with G7, B5 locates mast geometry).',
  b5Image: 'assets/images/pd25-b5-callout.png',
  b5ImageAlt:
    'B5 on PD25 — Mast Tilt (X) relative to Mast Pivot / X-pin center (Y)',
  b5ImageCaption: 'B5 — Mast Pivot (Y) to Mast Tilt (X); always negative on PD25',
  sections: [
    {
      id: 'gnss',
      title: 'GNSS measure-up values',
      subtitle: 'From survey — computed by this calculator',
      rows: [
        { id: 'G1', name: 'Back offset from mast tilt pin (H)', entry: 'measure' },
        { id: 'G2', name: 'Horizontal offset from mast tilt pin (H)', entry: 'measure' },
        { id: 'G5', name: 'Back offset from mast tilt pin (MB)', entry: 'measure' },
        { id: 'G6', name: 'Horizontal offset from mast tilt pin (MB)', entry: 'measure' },
        { id: 'G7', name: 'Moving Base APC to ML (boom pin height)', entry: 'measure' },
      ],
    },
    {
      id: 'hammer',
      title: 'Hammer measure-up values',
      rows: [
        {
          id: 'T1',
          name: 'Horizontal tool offset — Y direction',
          entry: 'measure',
          notes: 'Optional from HC in calculator; tune on pile if needed',
        },
        {
          id: 'T2',
          name: 'Horizontal tool offset — X direction',
          entry: 'measure',
          notes: 'Should be 0.10 ft (0.030 m) or less after plumb-pile 180° check',
        },
        {
          id: 'T3',
          name: 'Tool vertical offset',
          entry: 'measure',
          notes: 'Set with hammer float on known elevation — finalize on plumb pile with 180° check',
        },
        { id: 'T4', name: 'Total mast length', entry: 'default', defaultFt: 24.9343, defaultM: 7.599 },
        { id: 'T5', name: 'Mast tilt pin to mast foot', entry: 'default', defaultFt: 3.6, defaultM: 1.097, notes: 'Or from MF in calculator when surveyed' },
        { id: 'T6', name: 'Center of mast Z slide to tilt pin', entry: 'default', defaultFt: 0.6562, defaultM: 0.2 },
        { id: 'T7', name: 'Center of mast Z slide to tilt pin (second)', entry: 'default', defaultFt: 0, defaultM: 0 },
      ],
      footnote: 'Hammer opening diameter for reporting: 6 in (0.152 m) or 8 in (0.203 m) per pile guide.',
    },
    {
      id: 'body',
      title: 'Body measure-up values',
      subtitle: 'All from mast tilt pin — use defaults',
      rows: [
        { id: 'M1', name: 'Center of rotation — behind tilt pin', entry: 'default', defaultFt: 3.7073, defaultM: 1.129 },
        { id: 'M2', name: 'Center of rotation — right of tilt pin', entry: 'default', defaultFt: 0, defaultM: 0 },
        { id: 'M3', name: 'Distance rear of body', entry: 'default', defaultFt: 8.8583, defaultM: 2.7 },
        { id: 'M4', name: 'Distance front of body', entry: 'default', defaultFt: 0, defaultM: 0 },
        { id: 'M5', name: 'Distance left of body', entry: 'default', defaultFt: 4.3635, defaultM: 1.329 },
        { id: 'M6', name: 'Distance right of body', entry: 'default', defaultFt: 5.4462, defaultM: 1.66 },
        { id: 'M7', name: 'Distance to top of machine', entry: 'default', defaultFt: 2.7231, defaultM: 0.83 },
        { id: 'M8', name: 'Distance below machine', entry: 'default', defaultFt: 3.773, defaultM: 1.15 },
      ],
    },
    {
      id: 'boom',
      title: 'Boom measure-up values',
      rows: [
        { id: 'B1', name: 'Boom swing to boom pin', entry: 'na', notes: 'Not used on PD25' },
        { id: 'B2', name: 'Boom length', entry: 'na', notes: 'Not used on PD25' },
        { id: 'B3', name: 'VA boom length', entry: 'na', notes: 'Not used on PD25' },
        { id: 'B4', name: 'Stick length', entry: 'na', notes: 'Not used on PD25' },
        {
          id: 'B5',
          name: 'Y pivot pin center to X tilt pin (Mast Tilt)',
          entry: 'default',
          defaultFt: -1.056,
          defaultM: -0.321,
          emphasize: true,
          notes:
            'Vertical — always negative on PD25. Or measure MT in the calculator (Measure B5) instead of this OEM default.',
        },
      ],
    },
  ],
};
