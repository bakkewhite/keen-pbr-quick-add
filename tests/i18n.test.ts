import { describe, expect, it } from 'vitest';
import {
  getPopupCopy,
  parseUiLanguage,
  UI_LANGUAGE_STORAGE_KEY,
} from '../src/i18n';

describe('popup language copy', () => {
  it('defaults missing or invalid stored language to Russian', () => {
    expect(parseUiLanguage(undefined)).toBe('ru');
    expect(parseUiLanguage('de')).toBe('ru');
    expect(parseUiLanguage('ru')).toBe('ru');
    expect(parseUiLanguage('en')).toBe('en');
    expect(UI_LANGUAGE_STORAGE_KEY).toBe('ui.language.v1');
  });

  it('provides complete English and Russian variable copy', () => {
    expect(getPopupCopy('ru')).toMatchObject({
      adding: 'Добавление…',
      removing: 'Удаление…',
      checking: 'Проверка…',
      connectionLabel: 'Подключение к keen-pbr',
      connectedSummary: 'Подключено',
      changeConnection: 'Изменить',
      cancelConnection: 'Отмена',
      checkConnection: 'Подтвердить',
      connectionHelp: 'Web UI и API keen-pbr используют один адрес',
      useCurrentTab: 'Использовать текущую вкладку',
      useKeeneticOrigin: 'Использовать локальный адрес',
      openWebUi: 'Открыть Web UI keen-pbr',
    });
    expect(getPopupCopy('en')).toMatchObject({
      adding: 'Adding…',
      removing: 'Removing…',
      checking: 'Checking…',
      connectionLabel: 'keen-pbr connection',
      connectedSummary: 'Connected',
      changeConnection: 'Change',
      cancelConnection: 'Cancel',
      checkConnection: 'Confirm',
      connectionHelp: 'The keen-pbr Web UI and API use the same address',
      useCurrentTab: 'Use current tab',
      useKeeneticOrigin: 'Use local address',
      openWebUi: 'Open keen-pbr Web UI',
    });
    expect(getPopupCopy('ru').add('Microsoft')).toBe('Добавить в Microsoft');
    expect(getPopupCopy('ru').remove('Microsoft')).toBe('Удалить из Microsoft');
    expect(getPopupCopy('en').add('Microsoft')).toBe('Add to Microsoft');
    expect(getPopupCopy('en').remove('Microsoft')).toBe('Remove from Microsoft');
    expect(getPopupCopy('ru').connected('3.1.1'))
      .toBe('Подключено к keen-pbr 3.1.1');
    expect(getPopupCopy('en').connected('3.1.1'))
      .toBe('Connected to keen-pbr 3.1.1');
    expect(getPopupCopy('en').routingConfirmed('example.com'))
      .toBe('Routing confirmed for example.com');
    expect(getPopupCopy('en').appliedUnverified('routing-not-confirmed'))
      .toBe(
        'Saved and applied, but verification is not confirmed yet: '
        + 'routing is not confirmed',
      );
    expect(getPopupCopy('ru').readyInOtherLists(['a', 'b']))
      .toBe('Готово к добавлению · уже есть в: a, b');
    expect(getPopupCopy('en').removedStillIn('local', ['a']))
      .toBe('Removed from local · still in: a');
    expect(getPopupCopy('ru').changedVerificationPending(
      'remove',
      'health-not-converged',
    )).toBe(
      'Удалено, но проверка пока не подтверждена: состояние сервиса не сошлось',
    );
  });

  it('localizes known background failures and retains diagnostics', () => {
    const copy = getPopupCopy('en');
    expect(copy.backgroundFailure(
      'API_UNAVAILABLE',
      'API keen-pbr недоступен',
      'network; TypeError: Failed to fetch',
    )).toBe(
      'keen-pbr API is unavailable [network; TypeError: Failed to fetch]',
    );
  });

  it('keeps an unknown background message instead of discarding it', () => {
    expect(getPopupCopy('en').backgroundFailure(
      'FUTURE_ERROR',
      'future diagnostic',
    )).toBe('future diagnostic');
  });
});
