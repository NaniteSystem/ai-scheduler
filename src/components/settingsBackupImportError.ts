type Translate = (key: string) => string;

export function backupImportErrorMessage(error: unknown, t: Translate): string {
  if (!(error instanceof Error)) return t('settings.backupErr');

  switch (error.message) {
    case 'invalid-json':
      return t('settings.backupError.invalidJson');
    case 'unsupported-version':
      return t('settings.backupError.unsupportedVersion');
    case 'not-nebulla':
      return t('settings.backupError.notNebulla');
    case 'invalid-root':
    case 'invalid-data':
    case 'invalid-store-version':
      return t('settings.backupError.invalidStructure');
    case 'invalid-goals':
      return t('settings.backupError.invalidGoals');
    case 'invalid-sessions':
      return t('settings.backupError.invalidSessions');
    case 'invalid-tasks':
      return t('settings.backupError.invalidTasks');
    case 'invalid-projects':
      return t('settings.backupError.invalidProjects');
    case 'invalid-habits':
      return t('settings.backupError.invalidHabits');
    case 'invalid-habit-groups':
      return t('settings.backupError.invalidHabitGroups');
    case 'invalid-metrics':
      return t('settings.backupError.invalidMetrics');
    case 'invalid-reflections':
      return t('settings.backupError.invalidReflections');
    case 'invalid-user-profile':
      return t('settings.backupError.invalidUserProfile');
    case 'invalid-notif-prefs':
      return t('settings.backupError.invalidNotifPrefs');
    case 'invalid-prefs':
      return t('settings.backupError.invalidPrefs');
    case 'invalid-generated-plan':
      return t('settings.backupError.invalidGeneratedPlan');
    case 'invalid-focus-timer':
      return t('settings.backupError.invalidFocusTimer');
    default:
      return error.message.startsWith('invalid-')
        ? t('settings.backupError.invalidContent')
        : t('settings.backupErr');
  }
}
