/**
 * Sections of a long form (Ort, Fahrzeug, Pflicht). User test 2 (UT2-05): a section title must not look like the
 * field label right below it, so each section after the first gets a divider and room above, and its title is
 * larger than the labels (`text-small font-medium`). The legend floats so the divider stays one unbroken line.
 */
export const FORM_SECTION =
  "m-0 min-w-0 border-0 border-border border-t p-0 pt-6 first:border-t-0 first:pt-0 [&>legend+*]:clear-both";
export const FORM_SECTION_TITLE =
  "float-left mb-4 w-full p-0 font-semibold text-[17px] leading-tight";
