import fs from 'fs';
import path from 'path';

describe('IP configuration', () => {
  it('loads a valid array of IPs', () => {
    const filePath = path.join(process.cwd(), 'config', 'ip.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    expect(Array.isArray(data)).toBe(true);
    data.forEach(ip => {
      expect(typeof ip).toBe('string');
    });
  });
});
