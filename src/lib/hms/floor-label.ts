const ORDINALS = ["", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"];

/** Floor 0 is the ground floor. Floors 1–10 read "First Floor"… and anything higher "Floor N". */
export function floorLabel(floor: number) {
  if (floor === 0) return "Ground Floor";
  if (floor >= 1 && floor <= 10) return `${ORDINALS[floor]} Floor`;
  return `Floor ${floor}`;
}

/** For compact headings that already use "Floor N": only floor 0 changes, to "Ground Floor". */
export function floorLabelPlain(floor: number) {
  return floor === 0 ? "Ground Floor" : `Floor ${floor}`;
}
