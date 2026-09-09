# Fridge magnetic case for LilyGo T5 4.7 e-paper

Parametric OpenSCAD enclosure for mounting the LilyGo T5 4.7" e-paper screen
on a fridge with embedded magnets.

The case is split into two printed parts:

- `front`: visible screen bezel with screw clearance holes
- `back`: rear tray with PCB supports, closure screw posts, and blind magnet pockets

The original LilyGo shell files in `shell/style*` are left untouched.

## Geometry

Measured bounds of the included LilyGo shell STLs:

- Style 3 `a.stl`: about `120.95 x 67.65 x 8.14 mm`
- Style 3 `b.stl`: about `120.95 x 67.30 x 7.80 mm`
- Style 2 `Top_Shell.stl`: about `125.90 x 68.90 mm`
- Style 2 `Lower_shell.stl`: about `125.90 x 68.90 mm`

The default enclosure is slightly larger at `132 x 78 mm` so it has enough
wall thickness and room for four 12 mm magnets.

## Hardware

- 4x neodymium magnets, `12 x 3 mm`
- 4x M1.5 x 5 self-tapping screws to close the case
- Optional 4x M2 x 4 screws for PCB mounting

The magnet pockets are blind by default: magnets are glued from the inside and
the fridge-facing back remains covered by `rear_skin = 0.8 mm` of plastic. Set
`rear_skin = 0` if you want open pockets and maximum magnetic force, but add a
thin PET/rubber film to avoid scratching the fridge.

## Measurements To Check

Before a final print, measure the exact board version with calipers and adjust
the variables at the top of [fridge_magnetic_case.scad](fridge_magnetic_case.scad):

- Outside feel: `case_w`, `case_h`, `back_depth`
- Screen opening: `screen_w`, `screen_h`, `screen_offset_x`, `screen_offset_y`
- PCB fit: `pcb_w`, `pcb_h`, `pcb_clearance`
- USB/button locations: `usb_cut_x`, `button_cut_x`
- Magnet fit: `magnet_d`, `magnet_h`, `rear_skin`
- Screw positions: `case_screw_inset_x`, `case_screw_inset_y`, `pcb_post_x`, `pcb_post_y`

For a first physical validation, print only the front bezel or slice the back
with a low infill draft profile. The important tolerances are the screen window,
USB access, and PCB clearance.

## Print Notes

- Material: PETG preferred; PLA is fine if the fridge area stays cool
- Layer height: `0.2 mm`
- Walls: 3 perimeters
- Infill: 15-25%
- Orientation: print both halves flat
- Supports: normally none
- Magnet glue: thin CA glue or epoxy, after confirming polarity

## Export STL

Open [fridge_magnetic_case.scad](fridge_magnetic_case.scad) in OpenSCAD, set:

```scad
part = "front";
```

Render with F6 and export the STL. Then repeat with:

```scad
part = "back";
```

Keep `part = "assembly"` only for visual checking.
