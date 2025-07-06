declare module 'cidr-matcher' {
  class CidrMatcher {
    constructor(cidrs: string[]);
    contains(ip: string): boolean;
    containsAny(ips: string[]): boolean;
    containsAll(ips: string[]): boolean;
  }
  
  export default CidrMatcher;
}