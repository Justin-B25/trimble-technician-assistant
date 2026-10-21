# Pile QC sample datasets

Each field test gets its own folder (design + GNSS/UTS + machine quality + drive log).

This calculator reports objective deltas and |error| statistics only. It does not recommend a source.

## Guidance screen vs machine-displayed compare

For each pile in the drive-log CSV:

1. **Truth** = as-built ΔZ from UTS (or GNSS): `Z_as-built − Z_design` (ft)
2. **Guidance |error|** = `|truth − GuidanceRemainingFt|`
3. **Machine-displayed |error|** = `|truth − MachineDisplayedRemaining|` (converted to ft via the unit selector)
4. Counts and mean |error| summarize the dataset

Load the matching design/stakeout/machine files for that test first, then import that test’s drive-log CSV.

## Recording data

**Use a CSV or spreadsheet — not photos.**

| Column | Units | Notes |
|--------|-------|--------|
| `PileID` | — | Same ID as design / stakeout |
| `GuidanceRemainingFt` | feet | End-of-drive remaining on the guidance screen (`GroundworksRemainingFt` also accepted) |
| `MachineDisplayedRemaining` | inches *or* feet | Value on the machine screen; set the app unit selector to match |
| `Notes` | — | Optional field observations |

Copy `DRIVE-LOG-TEMPLATE.csv` for each new test.

## Folder layout

```
samples/
  DRIVE-LOG-TEMPLATE.csv
  test1-full-down-pressure/
  test2-…/
```
