/*
  LilyGo T5 4.7 e-paper fridge magnetic case

  Parametric two-part enclosure for a fridge-mounted LilyGo EPD47.
  Open in OpenSCAD, adjust the parameters below, then render/export STL.
  Dimensions are in millimeters.
*/

$fn = 64;

// Select "front", "back", or "assembly".
part = "assembly";

// Overall outside dimensions. Official shell STLs in this repo are roughly
// 121 x 68 mm (style3) and 126 x 69 mm (style2), so this version adds room for
// walls, tolerance, and enclosed magnets.
case_w = 132;
case_h = 78;
back_depth = 13.5;
front_skin = 2.0;
front_sleeve_depth = 2.2;
corner_r = 5;
wall = 2.2;
fit_clearance = 0.35;

// Visible e-paper opening. The 4.7" 960x540 panel is close to 104 x 58.5 mm;
// enlarge or shift slightly after measuring your exact front glass/bezel.
screen_w = 104;
screen_h = 58.5;
screen_r = 1.2;
screen_offset_x = 0;
screen_offset_y = 0;

// PCB locator and supports. Disable posts if you prefer to keep the board in
// the original LilyGo bracket and only use this as an outer magnetic shell.
use_pcb_posts = true;
pcb_w = 121.0;
pcb_h = 67.0;
pcb_clearance = 0.8;
pcb_support_h = 3.0;
pcb_support_d = 5.2;
pcb_screw_d = 2.1; // M2 clearance
pcb_post_x = 53.5;
pcb_post_y = 28.0;

// Housing closure. M1.5 x 5 self-tapping screws work with the official shell.
case_screw_inset_x = 8.5;
case_screw_inset_y = 8.5;
case_boss_d = 6.0;
case_boss_pilot_d = 1.45;
case_screw_clearance_d = 2.0;
case_countersink_d = 4.0;

// Magnets are inserted from inside the back half before closing the case.
// rear_skin keeps plastic between magnet and fridge to avoid scratches.
magnet_d = 12.2;      // 12 mm magnet plus print tolerance
magnet_h = 3.2;      // 3 mm magnet plus glue/tolerance
magnet_inset_x = 18;
magnet_inset_y = 15;
rear_skin = 0.8;     // set to 0 for through-pockets and stronger grip

// Service openings. The USB cut is on the bottom edge in landscape mode.
usb_cut_w = 14;
usb_cut_h = 6;
usb_cut_x = -45;
button_cut_w = 12;
button_cut_h = 5;
button_cut_x = 43;

module rounded_rect(w, h, r) {
  offset(r = r)
    square([w - 2 * r, h - 2 * r], center = true);
}

module rounded_box(w, h, d, r) {
  linear_extrude(height = d)
    rounded_rect(w, h, r);
}

module screw_hole(d, h) {
  translate([0, 0, -0.1])
    cylinder(d = d, h = h + 0.2);
}

module boss_with_pilot(x, y, z, h, d, pilot_d) {
  translate([x, y, z])
    difference() {
      cylinder(d = d, h = h);
      screw_hole(pilot_d, h);
    }
}

module case_screw_positions() {
  for (x = [-case_w / 2 + case_screw_inset_x, case_w / 2 - case_screw_inset_x])
    for (y = [-case_h / 2 + case_screw_inset_y, case_h / 2 - case_screw_inset_y])
      translate([x, y, 0])
        children();
}

module magnet_positions() {
  for (x = [-case_w / 2 + magnet_inset_x, case_w / 2 - magnet_inset_x])
    for (y = [-case_h / 2 + magnet_inset_y, case_h / 2 - magnet_inset_y])
      translate([x, y, 0])
        children();
}

module pcb_post_positions() {
  for (x = [-pcb_post_x, pcb_post_x])
    for (y = [-pcb_post_y, pcb_post_y])
      translate([x, y, 0])
        children();
}

module edge_service_cuts(top_z) {
  translate([usb_cut_x, -case_h / 2 - 0.1, top_z - usb_cut_h / 2])
    cube([usb_cut_w, wall + 0.4, usb_cut_h], center = true);

  translate([button_cut_x, case_h / 2 + 0.1, top_z - button_cut_h / 2])
    cube([button_cut_w, wall + 0.4, button_cut_h], center = true);
}

module front_shell() {
  sleeve_w = case_w - 2 * wall - 2 * fit_clearance;
  sleeve_h = case_h - 2 * wall - 2 * fit_clearance;
  sleeve_wall = 1.2;

  difference() {
    union() {
      rounded_box(case_w, case_h, front_skin, corner_r);

      // Shallow sleeve centers the front in the rear tray.
      translate([0, 0, front_skin])
        difference() {
          rounded_box(sleeve_w, sleeve_h, front_sleeve_depth, max(0.8, corner_r - wall - fit_clearance));
          translate([0, 0, -0.1])
            rounded_box(sleeve_w - 2 * sleeve_wall,
                        sleeve_h - 2 * sleeve_wall,
                        front_sleeve_depth + 0.2,
                        max(0.5, corner_r - wall - sleeve_wall));
        }
    }

    translate([screen_offset_x, screen_offset_y, -0.1])
      rounded_box(screen_w, screen_h, front_skin + front_sleeve_depth + 0.2, screen_r);

    // Screws pass through the visible front into pilots in the back posts.
    case_screw_positions() {
      screw_hole(case_screw_clearance_d, front_skin + front_sleeve_depth);
      translate([0, 0, -0.05])
        cylinder(d1 = case_countersink_d, d2 = case_screw_clearance_d, h = 1.0);
    }

    edge_service_cuts(front_skin + front_sleeve_depth);
  }
}

module back_shell() {
  inner_w = case_w - 2 * wall;
  inner_h = case_h - 2 * wall;
  base_h = max(rear_skin + magnet_h + 0.4, 4.2);

  difference() {
    rounded_box(case_w, case_h, back_depth, corner_r);

    // Main open tray.
    translate([0, 0, base_h])
      rounded_box(inner_w, inner_h, back_depth + 0.2, max(0.8, corner_r - wall));

    // PCB relief pocket just above the magnet/base zone.
    translate([0, 0, base_h - 0.05])
      rounded_box(pcb_w + 2 * pcb_clearance,
                  pcb_h + 2 * pcb_clearance,
                  1.4,
                  1.2);

    // Magnet pockets are blind by default, leaving rear_skin plastic outside.
    magnet_positions()
      translate([0, 0, rear_skin])
        cylinder(d = magnet_d, h = magnet_h + 0.1);

    edge_service_cuts(back_depth);
  }

  // Closure posts.
  case_screw_positions()
    boss_with_pilot(0, 0, base_h, back_depth - base_h, case_boss_d, case_boss_pilot_d);

  // Low PCB standoffs.
  if (use_pcb_posts) {
    pcb_post_positions()
      boss_with_pilot(0, 0, base_h, pcb_support_h, pcb_support_d, pcb_screw_d);
  }
}

if (part == "front") {
  front_shell();
} else if (part == "back") {
  back_shell();
} else {
  back_shell();
  translate([0, 0, back_depth + front_skin + front_sleeve_depth + 4])
    rotate([180, 0, 0])
      front_shell();
}
