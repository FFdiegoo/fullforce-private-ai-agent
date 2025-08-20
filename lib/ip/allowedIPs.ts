import ipConfig from '@/config/ip.json';

export function getAllowedIPs(): string[] {
  let allowed: string[] = [];

  const data: any = ipConfig as any;
  if (Array.isArray(data)) {
    allowed = [...data];
  } else if (Array.isArray(data.allowedIPs)) {
    allowed = [...data.allowedIPs];
  } else {
    console.warn('⚠️ Invalid IP configuration format in config/ip.json');
  }

  if (allowed.length === 0) {
    console.warn('⚠️ Allowed IP configuration is empty');
  }

  return allowed.map(ip => ip.trim());
}
