import type { KeenPbrConfig } from '../../src/keen-pbr-types';

export function makeConfig(): KeenPbrConfig {
  return {
    daemon: { ipv6_enabled: false },
    lists: {
      local: { domains: ['alpha.example'], ip_cidrs: [''], url: '', file: '' },
      google_ai: { domains: ['ai.example'], ip_cidrs: [], url: '', file: '' },
      remote_domains: {
        domains: [''],
        ip_cidrs: [''],
        url: 'https://lists.example/domains.txt',
        file: '',
      },
      local_file: {
        domains: [],
        ip_cidrs: [],
        url: '',
        file: '/opt/etc/keen-pbr/list.txt',
      },
      ip_only: { domains: [], ip_cidrs: ['203.0.113.0/24'], url: '', file: '' },
      inactive: { domains: ['inactive.example'], ip_cidrs: [], url: '', file: '' },
    },
    route: {
      rules: [
        { list: ['local'], outbound: 'vpn_auto' },
        { list: ['google_ai'], outbound: 'vpn_auto', enabled: true },
        { list: ['inactive'], outbound: 'vpn_auto', enabled: false },
      ],
    },
  };
}
