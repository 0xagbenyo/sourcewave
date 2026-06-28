type AppAlertButton = {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

export type AppAlertTone = 'default' | 'error' | 'success';

type ShowAlertFn = (
  title: string,
  message?: string,
  buttons?: AppAlertButton[],
  tone?: AppAlertTone
) => void;

let showAlertImpl: ShowAlertFn | null = null;

export function bindAppAlert(fn: ShowAlertFn | null) {
  showAlertImpl = fn;
}

function fallbackAlert(title: string, message?: string) {
  if (typeof console !== 'undefined') {
    console.warn('[appAlert] alert host unavailable:', title, message || '');
  }
}

function show(title: string, message?: string, buttons?: AppAlertButton[], tone: AppAlertTone = 'default') {
  if (showAlertImpl) {
    showAlertImpl(title, message, buttons, tone);
    return;
  }
  fallbackAlert(title, message);
}

export const appAlert = {
  alert(title: string, message?: string, buttons?: AppAlertButton[]) {
    show(title, message, buttons, 'default');
  },
  error(title: string, message?: string, buttons?: AppAlertButton[]) {
    show(title, message, buttons, 'error');
  },
  success(title: string, message?: string, buttons?: AppAlertButton[]) {
    show(title, message, buttons, 'success');
  },
};

export type { AppAlertButton };
