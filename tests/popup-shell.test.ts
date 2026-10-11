import { readFile, access } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('React popup shell',()=>{
  it('ships one React mount, local script and stylesheet, not the old parallel forms',async()=>{
    const html=await readFile('public/popup.html','utf8');
    expect(html.match(/id="root"/g)).toHaveLength(1);
    expect(html).toContain('type="module" src="popup.js"');
    expect(html).toContain('href="popup.css"');
    expect(html).not.toContain('auth-password');
    expect(html).not.toMatch(/(?:src|href)="https?:/);
  });
  it('uses the open default HeroUI styles with no custom palette or remote assets',async()=>{
    const css=await readFile('public/popup.css','utf8');
    expect(css).toContain('@import "@heroui/styles"');
    expect(css).not.toMatch(/#[a-f0-9]{3,8}\b/i);
    expect(css).not.toMatch(/url\(\s*["']?https?:/i);
  });
  it('bounds the popup and supports reduced motion',async()=>{
    const css=await readFile('public/popup.css','utf8');
    expect(css).toContain('max-height: 600px');expect(css).toContain('overflow-y: auto');
    expect(css).toContain('prefers-reduced-motion');
  });
  it('retains branded icons and licenses locally',async()=>{
    for(const name of ['keen-pbr.svg','keen-pbr-NOTICE.txt','LICENSE.txt','open_in_new.svg']) {
      await expect(access('public/icons/'+name)).resolves.toBeUndefined();
    }
  });
});
