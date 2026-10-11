// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PopupApp } from '../src/popup-app';
import { popupFixture, LAN, REMOTE } from './helpers/popup-port';

beforeAll(()=>{
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, ch => '\\' + ch) });
  vi.stubGlobal('ResizeObserver',class { observe(){} unobserve(){} disconnect(){} });
  window.matchMedia=vi.fn().mockReturnValue({matches:false,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn()});
  Element.prototype.scrollIntoView=vi.fn();
});
afterEach(()=>cleanup());
async function mount(f=popupFixture()) {
  render(<PopupApp model={f.model}/>);await act(()=>f.model.start());return f;
}
it('announces the current wizard step and preserves progress when going back', async () => {
  const f = popupFixture(true); f.authNeeded.add(LAN); await mount(f);
  const progress = () => screen.getByRole('list', { name: 'Подключение к keen-pbr' });
  const states = () => within(progress()).getAllByRole('listitem').map(item => ({
    current: item.getAttribute('aria-current'), state: item.getAttribute('data-state'),
  }));
  expect(states()).toEqual([
    {current:'step',state:'current'}, {current:null,state:'pending'}, {current:null,state:'pending'},
  ]);
  fireEvent.click(screen.getByRole('button', { name: 'Использовать локальный адрес' }));
  fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
  await screen.findByLabelText('Пароль keen-pbr');
  expect(states()).toEqual([
    {current:null,state:'complete'}, {current:'step',state:'current'}, {current:null,state:'pending'},
  ]);
  fireEvent.change(screen.getByLabelText('Пароль keen-pbr'), {target:{value:'fictional-qa-password'}});
  fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
  await screen.findByLabelText('Список по умолчанию', {selector:'button'});
  expect(states()).toEqual([
    {current:null,state:'complete'}, {current:null,state:'complete'}, {current:'step',state:'current'},
  ]);
  expect(within(progress()).queryByRole('button')).toBeNull();
  fireEvent.click(screen.getByRole('button', {name:'Назад'}));
  await screen.findByLabelText('Адрес keen-pbr');
  expect(states()[0]).toEqual({current:'step',state:'current'});
});
it('renders only address controls at the first step, with one primary continuation',async()=>{
  await mount(popupFixture(true));
  expect(screen.getByLabelText('Адрес keen-pbr')).toBeTruthy();
  expect(screen.queryByLabelText('Пароль keen-pbr')).toBeNull();
  expect(screen.queryByLabelText('Список по умолчанию')).toBeNull();
  expect(screen.getAllByRole('button',{name:'Продолжить'})).toHaveLength(1);
});
it('renders only the password step after auth-required, not the address form or list',async()=>{
  const f=popupFixture();f.authNeeded.add(LAN);await mount(f);
  expect(screen.getByLabelText('Пароль keen-pbr')).toBeTruthy();
  expect(screen.queryByLabelText('Адрес keen-pbr')).toBeNull();
  expect(screen.queryByLabelText('Список по умолчанию')).toBeNull();
  expect(screen.getByRole('button',{name:'Продолжить'}).hasAttribute('disabled')).toBe(true);
  expect(screen.queryByRole('checkbox',{name:/Подтверждаю передачу/})).toBeNull();
  expect(screen.getByText(/По HTTP пароль передаётся без шифрования/)).toBeTruthy();
  expect(screen.getByLabelText('Пароль keen-pbr').getAttribute('aria-describedby')).toContain('http-warning');
});
it('settings opens a manager with active profile and separate add action, not a wizard', async () => {
  const f = await mount(); await act(() => f.model.openSettings());
  expect(screen.getByRole('heading', { name: 'Подключения' })).toBeTruthy();
  expect(screen.getByText('Активно')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Добавить подключение' })).toBeTruthy();
  expect(screen.queryByLabelText('Адрес keen-pbr')).toBeNull();
});
it('keeps connection URLs plain and marks the active option without adding visible Active text', async () => {
  const f = await mount(); await act(() => f.model.openSettings());
  fireEvent.click(screen.getByRole('button', { name: 'Выберите подключение Сохранённые подключения' }));
  const option = await screen.findByRole('option', { name: LAN + ' · Активно' });
  expect(option.textContent).toBe(LAN);
  expect(option.firstElementChild?.textContent).toBe(LAN);
  expect(option.querySelector('[aria-label="Активно"]')).toBeTruthy();
  fireEvent.click(option);
  expect(f.model.getSnapshot().active.apiOrigin).toBe(LAN);
  expect(screen.queryByRole('button', { name: 'Сделать активным' })).toBeNull();
});
it('reserves separate trailing slots for the selected checkmark and active connection dot', async () => {
  const f = popupFixture(); f.profiles.push({ apiOrigin: REMOTE, defaultList: 'other', authMode: null });
  await mount(f); await act(() => f.model.openSettings());
  const picker = () => document.querySelector('.saved-connection-picker .select__trigger')!;
  fireEvent.click(picker());
  fireEvent.click(await screen.findByRole('option', { name: LAN + ' · Активно' }));
  fireEvent.click(picker());
  const active = await screen.findByRole('option', { name: LAN + ' · Активно' });
  expect(active.getAttribute('aria-selected')).toBe('true');
  const indicators = active.querySelector('.connection-option-indicators');
  expect(indicators).toBeTruthy();
  expect(indicators?.firstElementChild?.getAttribute('data-slot')).toBe('list-box-item-indicator');
  expect(indicators?.lastElementChild?.getAttribute('aria-label')).toBe('Активно');
  expect(active.lastElementChild).toBe(indicators);
  fireEvent.click(screen.getByRole('option', { name: REMOTE }));
  fireEvent.click(picker());
  const selected = await screen.findByRole('option', { name: REMOTE });
  expect(selected.getAttribute('aria-selected')).toBe('true');
  expect(selected.querySelector('.connection-option-indicators [data-visible="true"]')).toBeTruthy();
  expect(selected.querySelector('.status-dot')).toBeNull();
  expect(screen.getByRole('option', { name: LAN + ' · Активно' }).querySelector('.status-dot')).toBeTruthy();
  expect(f.model.getSnapshot().active.apiOrigin).toBe(LAN);
  expect(f.send.mock.calls.some(([request]) => request.type === 'SAVE_SETTINGS')).toBe(false);
});
it('offers the standard local address with a generic label without activating it', async () => {
  const f = await mount(popupFixture(true));
  fireEvent.click(screen.getByRole('button', { name: 'Использовать локальный адрес' }));
  expect((screen.getByLabelText('Адрес keen-pbr') as HTMLInputElement).value).toBe(LAN);
  expect(f.model.getSnapshot().active.apiOrigin).toBeNull();
});
it('password help appears in a tooltip rather than permanent content', async () => {
  const f = popupFixture(); f.authNeeded.add(LAN); await mount(f);
  expect(screen.queryByText(/Вход в открытой вкладке Web UI не заменяет/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Пароль keen-pbr — справка' }));
  await waitFor(() => expect(screen.getByRole('tooltip').textContent).toContain('Вход в открытой вкладке Web UI не заменяет'));
});
it('delete requires confirmation and offers cancel before changing profiles', async () => {
  const f = popupFixture(); f.profiles.push({ apiOrigin: REMOTE, defaultList: 'other', authMode: null });
  await mount(f); await act(() => f.model.openSettings());
  fireEvent.click(screen.getByRole('button', { name: 'Выберите подключение Сохранённые подключения' }));
  fireEvent.click(await screen.findByRole('option', { name: REMOTE }));
  expect(f.model.getSnapshot().active.apiOrigin).toBe(LAN);
  expect(f.send.mock.calls.some(([request]) => request.type === 'SAVE_SETTINGS')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Удалить ' + REMOTE }));
  await waitFor(() => expect(screen.getByRole('alertdialog')).toBeTruthy());
  expect(f.profiles).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(f.profiles).toHaveLength(2);
});
it('the verified list step hides credentials and Connect, with one Finish button',async()=>{
  const f=await mount();await act(async()=>{f.model.openSettings();await f.model.checkConnection();});
  expect(screen.getByLabelText('Список по умолчанию', {selector:'button'})).toBeTruthy();
  expect(screen.queryByLabelText('Пароль keen-pbr')).toBeNull();
  expect(screen.queryByRole('button',{name:'Подключиться'})).toBeNull();
  expect(screen.getByText('Подключено к keen-pbr 3.3.1')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Сохранить и продолжить'}));
  await waitFor(()=>expect(screen.getByLabelText('Домен или URL')).toBeTruthy());
});
it('shows Check inside the field only for a valid hostname, and From tab only for a different target',async()=>{
  await mount();const field=screen.getByLabelText('Домен или URL');
  expect(screen.queryByRole('button',{name:'Из вкладки'})).toBeNull();
  fireEvent.change(field,{target:{value:'www.youtube.com/path'}});
  expect(screen.queryByRole('button',{name:'Из вкладки'})).toBeNull();
  expect(field.closest('.input-group')?.contains(screen.getByRole('button',{name:'Проверить'}))).toBe(true);
  fireEvent.change(field,{target:{value:'example.com/page'}});
  expect(screen.getByRole('button',{name:'Из вкладки'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Проверить'}));
  await waitFor(()=>expect((field as HTMLInputElement).value).toBe('example.com'));
  fireEvent.change(field,{target:{value:'chrome://newtab'}});
  expect(screen.queryByRole('button',{name:'Проверить'})).toBeNull();
});
it.each(['https://gemini.google.com/app?hl=ru', 'https://www.www.gemini.google.com/app?hl=ru'])(
  'retains the requested subdomain after Check and sends that exact target when adding: %s', async (domainInput) => {
  const f = popupFixture(); f.setMemberships([]); await mount(f);
  const field = screen.getByLabelText('Домен или URL');
  fireEvent.change(field, { target: { value: domainInput } });
  expect(screen.getByRole('button', { name: 'Из вкладки' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Проверить' }));
  await waitFor(() => expect((field as HTMLInputElement).value).toBe('gemini.google.com'));
  fireEvent.click(screen.getByRole('button', { name: 'Добавить в local' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Удалить из local' })).toBeTruthy());
  expect(f.send).toHaveBeenCalledWith({ type: 'MUTATE_DOMAIN', action: 'add', list: 'local', domain: 'gemini.google.com', expectedOrigin: LAN });
});
it('shows Remove and the other memberships instead of Ready to add',async()=>{
  await mount();expect(screen.getByRole('button',{name:'Удалить из local'})).toBeTruthy();
  expect(screen.getByText('Уже в списке local')).toBeTruthy();
  expect(screen.getByRole('list', { name: 'Найдено в других списках:' }).textContent).toBe('other');
});
it.each([
  { language: 'ru' as const, list: 'Список', addDefault: 'Добавить в local', removeOther: 'Удалить из other', addOther: 'Добавить в other' },
  { language: 'en' as const, list: 'List', addDefault: 'Add to local', removeOther: 'Remove from other', addOther: 'Add to other' },
])('names the current operation list in action labels ($language)', async ({ language, list, addDefault, removeOther, addOther }) => {
  const f = popupFixture(); f.setMemberships(['other']);
  f.port.loadLanguage = async () => language;
  await mount(f);
  expect(screen.getByRole('button', { name: addDefault })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'local ' + list }));
  fireEvent.click(await screen.findByRole('option', { name: 'other' }));
  fireEvent.click(screen.getByRole('button', { name: removeOther }));
  await waitFor(() => expect(screen.getByRole('button', { name: addOther })).toBeTruthy());
  expect(f.send.mock.calls.find(([r]) => r.type === 'MUTATE_DOMAIN')?.[0])
    .toMatchObject({ action: 'remove', list: 'other', domain: 'youtube.com' });
  expect(f.model.getSnapshot().active.defaultList).toBe('local');
  expect(f.send.mock.calls.some(([r]) => r.type === 'SAVE_SETTINGS')).toBe(false);
});
it('keeps a generic disabled Add label when no operation list is selected', async () => {
  const f = popupFixture(); f.setDefault('missing'); await mount(f);
  expect(screen.getByRole('button', { name: 'Добавить' }).hasAttribute('disabled')).toBe(true);
});
it('a failed external inspection does not claim all-clear or ready',async()=>{
  const f=popupFixture();f.setMemberships([]);f.setInspection({status:'unavailable',matchedLists:[]});await mount(f);
  expect(screen.queryByText('Готово к добавлению')).toBeNull();
  expect(screen.getByText(/Внешние источники проверить не удалось/)).toBeTruthy();
});
it('keeps external membership informational and only offers adding to the selected inline list', async () => {
  const f = popupFixture(); f.setMemberships([]);
  f.setInspection({ status: 'partial', matchedLists: ['itdog_inside'] }); await mount(f);
  expect(screen.getByRole('status').textContent).toBe('Отсутствует в списке, доступно для добавления');
  expect(screen.getByRole('list', { name: 'Найдено в других списках:' }).textContent).toBe('itdog_inside');
  expect(screen.queryByText('Готово к добавлению')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Добавить в local' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Удалить из local' })).toBeTruthy());
  expect(f.send.mock.calls.find(([r]) => r.type === 'MUTATE_DOMAIN')?.[0])
    .toMatchObject({ type: 'MUTATE_DOMAIN', action: 'add', list: 'local', domain: 'youtube.com' });
});
it('merges explicit and external memberships without duplicates or the selected list', async () => {
  const f = popupFixture(); f.setMemberships(['local', 'other']);
  f.setInspection({ status: 'partial', matchedLists: ['other', 'itdog_inside', 'local', 'itdog_inside'] });
  await mount(f);
  const list = screen.getByRole('list', { name: 'Найдено в других списках:' });
  expect([...list.querySelectorAll('[role="listitem"], li')].map(item => item.textContent))
    .toEqual(['other', 'itdog_inside']);
  expect(list.querySelectorAll('.chip')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Удалить из local' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Домен или URL'), { target: { value: 'example.com' } });
  expect(screen.queryByRole('list', { name: 'Найдено в других списках:' })).toBeNull();
});
it.each([{ memberships: [] }, { memberships: ['local'] }])('shows external limitations only in a status tooltip for %j', async ({ memberships }) => {
  const f = popupFixture(); f.setMemberships(memberships);
  f.setInspection({ status: 'partial', matchedLists: ['itdog_inside'] }); await mount(f);
  expect(screen.queryByText(/Перечень внешних совпадений неполный/)).toBeNull();
  const requests = f.send.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Сведения о проверке списков' }));
  await waitFor(() => expect(screen.getByRole('tooltip').textContent).toContain('Перечень внешних совпадений неполный'));
  expect(f.send.mock.calls).toHaveLength(requests);
});
it('uses concise domain hints without weakening validation', async () => {
  await mount(); const field = screen.getByLabelText('Домен или URL');
  fireEvent.change(field, { target: { value: '' } });
  expect(screen.getByRole('status').textContent).toBe('Введите домен');
  fireEvent.change(field, { target: { value: 'http://user:password@example.com' } });
  expect(screen.getByRole('status').textContent).toBe('Введите домен');
  expect(screen.queryByRole('button', { name: 'Проверить' })).toBeNull();
  fireEvent.change(field, { target: { value: 'example.com/path' } });
  expect(screen.getByRole('status').textContent).toBe('Нажмите «Проверить»');
});
it('opens the list explanation on hover without fetching or changing lists', async () => {
  const f = popupFixture(); f.setInspection({ status: 'partial', matchedLists: ['itdog_inside'] });
  await mount(f); const requests = f.send.mock.calls.length;
  await userEvent.hover(screen.getByRole('button', { name: 'Сведения о проверке списков' }));
  await waitFor(() => expect(screen.getByRole('tooltip').textContent).toContain('Перечень внешних совпадений неполный'));
  expect(f.send.mock.calls).toHaveLength(requests);
});
it('also shortens an INVALID_DOMAIN response from the background worker', async () => {
  const f = popupFixture();
  f.override(r => r.type === 'GET_CONTEXT' ? { ok: false, code: 'INVALID_DOMAIN',
    message: 'Введите публичный домен или HTTP/HTTPS-адрес без логина и пароля.' } : undefined);
  await mount(f); expect(screen.getByRole('alert').textContent).toBe('Введите домен');
});
it('renders router-controlled strings as text, never HTML',async()=>{
  const f=popupFixture();f.override(r=>r.type==='GET_CONTEXT'?{ok:false,code:'API_ERROR',message:'<img src=x onerror=alert(1)>'}:undefined);
  await mount(f);expect(document.querySelector('img[src="x"]')).toBeNull();
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
});
it('language switch updates all wizard labels without repeating checks',async()=>{
  const f=await mount(popupFixture(true));const calls=f.send.mock.calls.length;
  fireEvent.click(screen.getByRole('button',{name:'EN'}));
  expect(screen.getByLabelText('keen-pbr address')).toBeTruthy();
  expect(screen.getByRole('button',{name:'Continue'})).toBeTruthy();expect(f.send.mock.calls).toHaveLength(calls);
});
