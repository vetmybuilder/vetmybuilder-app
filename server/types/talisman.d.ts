declare module "talisman/metrics/jaro-winkler" {
  const fn: (a: string, b: string) => number;
  export default fn;
}
declare module "talisman/metrics/dice" {
  const fn: (a: string[] | string, b: string[] | string) => number;
  export default fn;
}
