/**
 * The name with capital letters and every space taken away, which is how two companies are told to be the same ("Infosys HR", "infosys hr" and
 * "InfosysHR" all give "infosyshr"). The database works the same key out by itself (the generated `name_key` column); this is for code that
 * needs to look a company up by a name it was given.
 */
export function makeCompanyNameKey(name: string): string {
  return name.toLowerCase().replace(/\s/gu, '');
}
